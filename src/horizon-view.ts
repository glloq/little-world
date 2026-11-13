import * as THREE from 'three';
import {terrainColor,terrainHeight,isLegacyTerrain} from './terrain.ts';

/** HZ-1: geographic horizon independent from detailed tiles.
 * The whole project rectangle is covered by a coarse heightfield split into blocks
 * (frustum-culled, rebuilt locally after edits). Cells under a displayed detailed tile
 * are left out of the block index, so layers never overlap and no depth bias or fog is
 * needed. Generated islands also get an opaque sea ring outside the project rectangle;
 * far water is folded into the horizon mesh (sea-clamped vertices), avoiding coplanar
 * water/terrain depth fighting at kilometres.
 * Purely derived visuals: no collision, simulation or source data depends on it.
 */
export interface HorizonGrid {spacing:number;blockCells:number;columns:number;rows:number}
export interface CoverageSource {version:number;tileSize:number;/** minY: lowest point of the displayed tile (skirts excluded) when known. */forEachActive(visit:(column:number,row:number,minY?:number)=>void):void}
export interface HorizonStats {blocks:number;triangles:number;bytes:number;buildMs:number;rebuilt:number;coverageUpdates:number;oceanVisible:boolean}
export interface HorizonView {group:THREE.Group;stats:HorizonStats;update(focus?:{x:number;z:number}):void;refresh(x:number,z:number,radius:number):void;dispose():void}

const SEA_COLOR=0x6aa9b3;
/** Target ≤ ~32k horizon vertices whatever the project size (measured budget, not a contract).
 * Spacing is the render tile size times a power of two, so horizon cells never straddle tiles. */
export function horizonGrid(width:number,length:number,tileSize=64):HorizonGrid{
  const raw=Math.sqrt(width*length/32768);let spacing=tileSize;
  while(spacing>8&&spacing/2>=raw)spacing/=2;
  while(spacing<raw)spacing*=2;
  const blockCells=32;
  return {spacing,blockCells,columns:Math.ceil(width/(spacing*blockCells)),rows:Math.ceil(length/(spacing*blockCells))};
}
/** Far clipping plane large enough for the project diagonal plus an ocean margin. */
export function horizonFar(width:number,length:number):number{
  return Math.min(20000,Math.max(750,Math.hypot(width,length)+2500));
}
interface Bounds {width:number;length:number;seaLevel:number}
/** Pure geometry of one block; shared edges sample identical points, so blocks never crack. */
export function horizonBlockData(bounds:Bounds,grid:HorizonGrid,column:number,row:number,height=terrainHeight,legacy=isLegacyTerrain()){
  const step=grid.spacing,minX=-bounds.width/2+column*grid.blockCells*step,minZ=-bounds.length/2+row*grid.blockCells*step;
  const cellsX=Math.max(1,Math.min(grid.blockCells,Math.ceil((bounds.width/2-minX)/step))),cellsZ=Math.max(1,Math.min(grid.blockCells,Math.ceil((bounds.length/2-minZ)/step)));
  const clampX=(x:number)=>Math.min(bounds.width/2,Math.max(-bounds.width/2,x)),clampZ=(z:number)=>Math.min(bounds.length/2,Math.max(-bounds.length/2,z));
  const w=cellsX+3,heights=new Float32Array(w*(cellsZ+3));
  for(let j=0;j<cellsZ+3;j++)for(let i=0;i<w;i++)heights[j*w+i]=height(clampX(minX+(i-1)*step),clampZ(minZ+(j-1)*step));
  const count=(cellsX+1)*(cellsZ+1),positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),color=new THREE.Color();
  let k=0;
  for(let j=0;j<=cellsZ;j++)for(let i=0;i<=cellsX;i++,k++){
    const x=clampX(minX+i*step),z=clampZ(minZ+j*step),at=(a:number,b:number)=>heights[(j+1+b)*w+i+1+a],h=at(0,0);
    const sea=!legacy&&h<bounds.seaLevel,y=sea?bounds.seaLevel:h;
    let nx=0,nz=0;if(!sea){nx=(at(-1,0)-at(1,0))/(2*step);nz=(at(0,-1)-at(0,1))/(2*step);}
    const n=Math.hypot(nx,1,nz);normals.set([nx/n,1/n,nz/n],k*3);positions.set([x,y,z],k*3);
    if(sea)color.setHex(SEA_COLOR);else terrainColor(x,z,h,Math.max(Math.abs(at(1,0)-h),Math.abs(at(0,1)-h))*2/step,color);
    colors.set([color.r,color.g,color.b],k*3);
  }
  const index=count>65535?new Uint32Array(cellsX*cellsZ*6):new Uint16Array(cellsX*cellsZ*6);let t=0;
  for(let j=0;j<cellsZ;j++)for(let i=0;i<cellsX;i++){const a=j*(cellsX+1)+i,b=a+1,d=a+cellsX+1;index.set([a,d,b,b,d,d+1],t);t+=6;}
  return {positions,normals,colors,index,minX,minZ,cellsX,cellsZ,maxX:clampX(minX+cellsX*step),maxZ:clampZ(minZ+cellsZ*step)};
}
/** Cells of a block whose render tile is displayed in detail are simply not indexed:
 * no hidden triangle is rasterised, no fragment is discarded. Horizon cells are
 * tile-aligned, so the visible horizon starts exactly where detailed tiles stop. */
export function visibleHorizonIndex(full:ArrayLike<number>,cellsX:number,cellsZ:number,covered:(i:number,j:number)=>boolean,out:Uint16Array|Uint32Array):number{
  let count=0;
  for(let j=0;j<cellsZ;j++)for(let i=0;i<cellsX;i++){
    if(covered(i,j))continue;const at=(j*cellsX+i)*6;
    for(let k=0;k<6;k++)out[count++]=full[at+k];
  }
  return count;
}
interface Block {mesh:THREE.Mesh;full:Uint16Array|Uint32Array;minX:number;minZ:number;cellsX:number;cellsZ:number}
export function createHorizonView(root:THREE.Group,bounds:Bounds,coverage:CoverageSource):HorizonView{
  const group=new THREE.Group();group.name='HorizonProxy';root.add(group);
  const tile=coverage.tileSize,grid=horizonGrid(bounds.width,bounds.length,tile),legacy=isLegacyTerrain();
  const columns=Math.ceil(bounds.width/tile),rows=Math.ceil(bounds.length/tile),mask=new Uint8Array(columns*rows);
  const tileOf=(x:number,z:number)=>{const c=Math.floor((x+bounds.width/2)/tile),r=Math.floor((z+bounds.length/2)/tile);return c>=0&&r>=0&&c<columns&&r<rows?r*columns+c:-1;};
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  const blocks=new Map<string,Block>(),stats:HorizonStats={blocks:0,triangles:0,bytes:0,buildMs:0,rebuilt:0,coverageUpdates:0,oceanVisible:!legacy};
  function reindex(block:Block){
    const g=block.mesh.geometry,index=g.index!;
    const count=visibleHorizonIndex(block.full,block.cellsX,block.cellsZ,(i,j)=>{const t=tileOf(block.minX+(i+.5)*grid.spacing,block.minZ+(j+.5)*grid.spacing);return t>=0&&mask[t]>0;},index.array as Uint16Array|Uint32Array);
    g.setDrawRange(0,count);index.needsUpdate=true;block.mesh.visible=count>0;
  }
  function build(column:number,row:number){
    const begin=performance.now(),data=horizonBlockData(bounds,grid,column,row),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(data.normals,3));geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3));
    geometry.setIndex(new THREE.BufferAttribute(data.index.slice(),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const key=column+':'+row,old=blocks.get(key);if(old){old.mesh.geometry.dispose();old.mesh.removeFromParent();}
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=1;mesh.name='Horizon '+key;mesh.userData.horizonBlock=key;mesh.matrixAutoUpdate=false;group.add(mesh);
    const block={mesh,full:data.index,minX:data.minX,minZ:data.minZ,cellsX:data.cellsX,cellsZ:data.cellsZ};blocks.set(key,block);reindex(block);
    stats.buildMs+=performance.now()-begin;stats.rebuilt++;
  }
  function measure(){stats.blocks=blocks.size;stats.triangles=0;stats.bytes=mask.byteLength;for(const {mesh,full} of blocks.values()){const g=mesh.geometry;stats.triangles+=Math.min(g.drawRange.count,g.index?.count??0)/3;for(const a of Object.values(g.attributes))stats.bytes+=(a as THREE.BufferAttribute).array.byteLength;stats.bytes+=(g.index?.array.byteLength??0)+full.byteLength;}}
  for(let row=0;row<grid.rows;row++)for(let column=0;column<grid.columns;column++)build(column,row);
  measure();
  // Open sea: an opaque ring around the project rectangle (no pixel over the island) and
  // one water quad per displayed tile that reaches below sea level (rebuilt on coverage change).
  let ring:THREE.Mesh|null=null,near:THREE.Mesh|null=null;
  const nearCapacity=1024;
  if(!legacy){
    const far=horizonFar(bounds.width,bounds.length),hx=bounds.width/2,hz=bounds.length/2,ox=hx+far,oz=hz+far,y=bounds.seaLevel;
    const ringGeometry=new THREE.BufferGeometry();
    ringGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-ox,y,-oz,ox,y,-oz,ox,y,oz,-ox,y,oz,-hx,y,-hz,hx,y,-hz,hx,y,hz,-hx,y,hz],3));
    ringGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:8},()=>[0,1,0]).flat(),3));
    ringGeometry.setIndex([0,4,1,1,4,5,1,5,2,2,5,6,2,6,3,3,6,7,3,7,0,0,7,4]);ringGeometry.computeBoundingSphere();
    ring=new THREE.Mesh(ringGeometry,new THREE.MeshLambertMaterial({color:SEA_COLOR}));ring.name='OceanRing';ring.frustumCulled=false;group.add(ring);
    const nearGeometry=new THREE.BufferGeometry(),normals=new Float32Array(nearCapacity*12);for(let k=1;k<normals.length;k+=3)normals[k]=1;
    nearGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nearCapacity*12),3));nearGeometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    const index=new Uint16Array(nearCapacity*6);for(let q=0;q<nearCapacity;q++)index.set([q*4,q*4+2,q*4+1,q*4+1,q*4+2,q*4+3],q*6);
    nearGeometry.setIndex(new THREE.BufferAttribute(index,1));nearGeometry.setDrawRange(0,0);
    near=new THREE.Mesh(nearGeometry,new THREE.MeshLambertMaterial({color:SEA_COLOR,transparent:true,opacity:.9,depthWrite:false}));near.name='NearSea';near.frustumCulled=false;near.renderOrder=2;group.add(near);
  }
  function rebuildNear(){
    if(!near)return;const attribute=near.geometry.getAttribute('position') as THREE.BufferAttribute,p=attribute.array as Float32Array,y=bounds.seaLevel+.02;let quads=0;
    coverage.forEachActive((column,row,minY)=>{
      if(quads>=nearCapacity||(minY!==undefined&&minY>bounds.seaLevel))return;
      const x0=-bounds.width/2+column*tile,z0=-bounds.length/2+row*tile,x1=Math.min(bounds.width/2,x0+tile),z1=Math.min(bounds.length/2,z0+tile);
      p.set([x0,y,z0,x1,y,z0,x0,y,z1,x1,y,z1],quads*12);quads++;
    });
    attribute.needsUpdate=true;near.geometry.setDrawRange(0,quads*6);
  }
  let coverageVersion=-1;
  return {group,stats,
    update(){
      if(coverage.version===coverageVersion)return;coverageVersion=coverage.version;
      const previous=mask.slice();mask.fill(0);
      coverage.forEachActive((column,row)=>{if(column>=0&&row>=0&&column<columns&&row<rows)mask[row*columns+column]=255;});
      // Only blocks containing a tile whose coverage changed are re-indexed.
      const span=grid.spacing*grid.blockCells,dirty=new Set<string>();
      for(let t=0;t<mask.length;t++)if(mask[t]!==previous[t]){const x=-bounds.width/2+(t%columns+.5)*tile,z=-bounds.length/2+(Math.floor(t/columns)+.5)*tile;dirty.add(Math.floor((x+bounds.width/2)/span)+':'+Math.floor((z+bounds.length/2)/span));}
      for(const key of dirty){const block=blocks.get(key);if(block)reindex(block);}
      rebuildNear();measure();stats.coverageUpdates++;
    },
    refresh(x,z,radius){
      const span=grid.spacing*grid.blockCells;
      for(let row=0;row<grid.rows;row++)for(let column=0;column<grid.columns;column++){
        const minX=-bounds.width/2+column*span,minZ=-bounds.length/2+row*span;
        // One extra cell: border normals/colours sample the neighbour row.
        if(minX-grid.spacing<=x+radius&&minX+span+grid.spacing>=x-radius&&minZ-grid.spacing<=z+radius&&minZ+span+grid.spacing>=z-radius)build(column,row);
      }
      measure();
    },
    dispose(){for(const {mesh} of blocks.values())mesh.geometry.dispose();blocks.clear();material.dispose();for(const sea of [ring,near])if(sea){sea.geometry.dispose();(sea.material as THREE.Material).dispose();}group.removeFromParent();measure();},
  };
}
