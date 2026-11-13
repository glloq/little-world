import * as THREE from 'three';
import {terrainColor,terrainHeight,isLegacyTerrain} from './terrain.ts';

/** HZ-1: geographic horizon independent from detailed tiles.
 * The whole project rectangle is covered by a coarse heightfield split into blocks
 * (frustum-culled, rebuilt locally after edits). Where a detailed tile is displayed,
 * a tiny coverage texture discards the horizon fragments, so the two never overlap
 * and no depth bias or fog is needed. Generated islands also get a camera-centred
 * ocean outside the project rectangle; far water is folded into the horizon mesh
 * (sea-clamped vertices), avoiding coplanar water/terrain fighting at kilometres.
 * Purely derived visuals: no collision, simulation or source data depends on it.
 */
export interface HorizonGrid {spacing:number;blockCells:number;columns:number;rows:number}
export interface CoverageSource {version:number;tileSize:number;forEachActive(visit:(column:number,row:number)=>void):void}
export interface HorizonStats {blocks:number;triangles:number;bytes:number;buildMs:number;rebuilt:number;coverageUpdates:number;oceanVisible:boolean}
export interface HorizonView {group:THREE.Group;stats:HorizonStats;update(focus:{x:number;z:number}):void;refresh(x:number,z:number,radius:number):void;dispose():void}

const SEA_COLOR=0x6aa9b3;
/** Target ≤ ~32k horizon vertices whatever the project size (measured budget, not a contract). */
export function horizonGrid(width:number,length:number):HorizonGrid{
  const raw=Math.sqrt(width*length/32768),spacing=Math.max(8,Math.ceil(raw/8)*8),blockCells=32;
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
  return {positions,normals,colors,index,minX,minZ,maxX:clampX(minX+cellsX*step),maxZ:clampZ(minZ+cellsZ*step)};
}
function coverageShader(material:THREE.Material,uniforms:Record<string,THREE.IUniform>,mode:'hide-covered'|'ocean'){
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vHorizonXZ;').replace('#include <begin_vertex>','#include <begin_vertex>\nvHorizonXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
    const test=mode==='hide-covered'?'if(inside&&covered)discard;':'if(inside&&!covered)discard;';
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vHorizonXZ;uniform sampler2D coverageMap;uniform vec4 coverageRect;')
      .replace('void main() {','void main() {\nvec2 cuv=(vHorizonXZ-coverageRect.xy)/coverageRect.zw;bool inside=all(greaterThanEqual(cuv,vec2(0.0)))&&all(lessThan(cuv,vec2(1.0)));bool covered=inside&&texture2D(coverageMap,cuv).r>0.5;\n'+test);
  };
  material.customProgramCacheKey=()=>'horizon-'+mode;
}
export function createHorizonView(root:THREE.Group,bounds:Bounds,coverage:CoverageSource):HorizonView{
  const group=new THREE.Group();group.name='HorizonProxy';root.add(group);
  const grid=horizonGrid(bounds.width,bounds.length),legacy=isLegacyTerrain();
  const columns=Math.ceil(bounds.width/coverage.tileSize),rows=Math.ceil(bounds.length/coverage.tileSize);
  const mask=new Uint8Array(columns*rows),texture=new THREE.DataTexture(mask,columns,rows,THREE.RedFormat,THREE.UnsignedByteType);
  texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  // The coverage rectangle is the tile grid (may extend past the bounds on partial tiles).
  const uniforms={coverageMap:{value:texture},coverageRect:{value:new THREE.Vector4(-bounds.width/2,-bounds.length/2,columns*coverage.tileSize,rows*coverage.tileSize)}};
  const material=new THREE.MeshLambertMaterial({vertexColors:true});coverageShader(material,uniforms,'hide-covered');
  const blocks=new Map<string,THREE.Mesh>(),stats:HorizonStats={blocks:0,triangles:0,bytes:0,buildMs:0,rebuilt:0,coverageUpdates:0,oceanVisible:!legacy};
  function build(column:number,row:number){
    const begin=performance.now(),data=horizonBlockData(bounds,grid,column,row),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(data.normals,3));geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3));
    geometry.setIndex(new THREE.BufferAttribute(data.index,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const key=column+':'+row,old=blocks.get(key);if(old){old.geometry.dispose();old.removeFromParent();}
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Horizon '+key;mesh.userData.horizonBlock=key;mesh.matrixAutoUpdate=false;group.add(mesh);blocks.set(key,mesh);
    stats.buildMs+=performance.now()-begin;stats.rebuilt++;
  }
  function measure(){stats.blocks=blocks.size;stats.triangles=0;stats.bytes=mask.byteLength;for(const mesh of blocks.values()){const g=mesh.geometry;stats.triangles+=(g.index?.count??0)/3;for(const a of Object.values(g.attributes))stats.bytes+=(a as THREE.BufferAttribute).array.byteLength;stats.bytes+=g.index?.array.byteLength??0;}}
  for(let row=0;row<grid.rows;row++)for(let column=0;column<grid.columns;column++)build(column,row);
  measure();
  // Ocean beyond the project rectangle (and over displayed detail tiles), recentred on the focus.
  let ocean:THREE.Mesh|null=null;
  if(!legacy){
    const oceanMaterial=new THREE.MeshLambertMaterial({color:SEA_COLOR,transparent:true,opacity:.82,depthWrite:false});coverageShader(oceanMaterial,uniforms,'ocean');
    const size=horizonFar(bounds.width,bounds.length)*2;ocean=new THREE.Mesh(new THREE.PlaneGeometry(size,size,1,1),oceanMaterial);
    ocean.rotation.x=-Math.PI/2;ocean.position.y=bounds.seaLevel+.02;ocean.frustumCulled=false;ocean.renderOrder=1;ocean.name='Ocean';group.add(ocean);
  }
  let coverageVersion=-1;
  return {group,stats,
    update(focus){
      if(ocean)ocean.position.set(Math.round(focus.x/64)*64,bounds.seaLevel+.02,Math.round(focus.z/64)*64);
      if(coverage.version===coverageVersion)return;coverageVersion=coverage.version;mask.fill(0);
      coverage.forEachActive((column,row)=>{if(column>=0&&row>=0&&column<columns&&row<rows)mask[row*columns+column]=255;});
      texture.needsUpdate=true;stats.coverageUpdates++;
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
    dispose(){for(const mesh of blocks.values())mesh.geometry.dispose();blocks.clear();material.dispose();texture.dispose();if(ocean){ocean.geometry.dispose();(ocean.material as THREE.Material).dispose();}group.removeFromParent();measure();},
  };
}
