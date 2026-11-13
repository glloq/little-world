import * as THREE from 'three';
import {isLegacyTerrain} from './terrain.ts';
import {packedColors,packedNormals} from './render/packing.ts';
import {horizonGrid,horizonFar,packedHorizonBlock,SEA_COLOR,type HorizonBounds} from './horizon-data.ts';
export {horizonGrid,horizonFar,horizonBlockData,visibleHorizonIndex,packedHorizonBlock,type HorizonGrid} from './horizon-data.ts';
import {visibleHorizonIndex,type PackedHorizonBlock} from './horizon-data.ts';
import type {GeoWorkerPool} from './geography/geo-workers.ts';

/** HZ-1: geographic horizon independent from detailed tiles.
 * The whole project rectangle is covered by a coarse heightfield split into blocks
 * (frustum-culled, rebuilt locally after edits). Cells under a displayed detailed tile
 * are left out of the block index, so layers never overlap and no depth bias or fog is
 * needed. Generated islands also get an opaque sea ring outside the project rectangle;
 * far water is folded into the horizon mesh (sea-clamped vertices), avoiding coplanar
 * water/terrain depth fighting at kilometres.
 * Purely derived visuals: no collision, simulation or source data depends on it.
 */
export interface CoverageSource {version:number;tileSize:number;/** minY: lowest point of the displayed tile (skirts excluded) when known. */forEachActive(visit:(column:number,row:number,minY?:number)=>void):void}
export interface HorizonStats {blocks:number;triangles:number;bytes:number;buildMs:number;rebuilt:number;coverageUpdates:number;oceanVisible:boolean}
export interface HorizonView {group:THREE.Group;stats:HorizonStats;update(focus?:{x:number;z:number}):void;refresh(x:number,z:number,radius:number):void;dispose():void}

interface Block {mesh:THREE.Mesh;full:Uint16Array|Uint32Array;minX:number;minZ:number;cellsX:number;cellsZ:number}
export function createHorizonView(root:THREE.Group,bounds:HorizonBounds,coverage:CoverageSource,workers:GeoWorkerPool|null=null):HorizonView{
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
  // Workers compute blocks off the main thread; a newer request for the same block makes
  // older answers obsolete (generation counter), the displayed block stays until replaced.
  const generation=new Map<string,number>();let disposed=false;
  function request(column:number,row:number,priority:number){
    if(!workers?.available){build(column,row);return;}
    const key=column+':'+row,gen=(generation.get(key)??0)+1;generation.set(key,gen);
    workers.run<PackedHorizonBlock>({kind:'horizon',bounds:{width:bounds.width,length:bounds.length,seaLevel:bounds.seaLevel},grid,column,row},priority).promise.then(({result,stale})=>{
      if(disposed||generation.get(key)!==gen)return;
      if(stale){request(column,row,priority);return;}
      build(column,row,result);measure();
    },()=>{if(!disposed&&generation.get(key)===gen){build(column,row);measure();}});
  }
  function build(column:number,row:number,packed?:PackedHorizonBlock){
    const begin=performance.now(),data=packed??packedHorizonBlock(bounds,grid,column,row),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('normal',packedNormals(data.normals));geometry.setAttribute('color',packedColors(data.colors));
    geometry.setIndex(new THREE.BufferAttribute(data.index.slice(),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const key=column+':'+row,old=blocks.get(key);if(old){old.mesh.geometry.dispose();old.mesh.removeFromParent();}
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=1;mesh.name='Horizon '+key;mesh.userData.horizonBlock=key;mesh.matrixAutoUpdate=false;group.add(mesh);
    const block={mesh,full:data.index,minX:data.minX,minZ:data.minZ,cellsX:data.cellsX,cellsZ:data.cellsZ};blocks.set(key,block);reindex(block);
    stats.buildMs+=performance.now()-begin;stats.rebuilt++;
  }
  function measure(){stats.blocks=blocks.size;stats.triangles=0;stats.bytes=mask.byteLength;for(const {mesh,full} of blocks.values()){const g=mesh.geometry;stats.triangles+=Math.min(g.drawRange.count,g.index?.count??0)/3;for(const a of Object.values(g.attributes))stats.bytes+=(a as THREE.BufferAttribute).array.byteLength;stats.bytes+=(g.index?.array.byteLength??0)+full.byteLength;}}
  // Blocks nearest the project centre first (the start point is usually inside).
  const order:[number,number,number][]=[];for(let row=0;row<grid.rows;row++)for(let column=0;column<grid.columns;column++)order.push([column,row,Math.hypot(column-(grid.columns-1)/2,row-(grid.rows-1)/2)]);
  for(const [column,row,d]of order.sort((a,b)=>a[2]-b[2]))request(column,row,1000+d);
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
        if(minX-grid.spacing<=x+radius&&minX+span+grid.spacing>=x-radius&&minZ-grid.spacing<=z+radius&&minZ+span+grid.spacing>=z-radius)request(column,row,1000);
      }
      measure();
    },
    dispose(){disposed=true;for(const {mesh} of blocks.values())mesh.geometry.dispose();blocks.clear();material.dispose();for(const sea of [ring,near])if(sea){sea.geometry.dispose();(sea.material as THREE.Material).dispose();}group.removeFromParent();measure();},
  };
}
