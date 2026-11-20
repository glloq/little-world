/** Doc 105 L3: seamless terrain representations (geomorph targets, adaptive skirts, rising
 * skirts towards the horizon, timed blends in the terrain view). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {configureTerrain,terrainHeight} from '../src/terrain.ts';
import {islandPreset} from '../src/terrain-generator.ts';
import {configureGeography} from '../src/geography/engine.ts';
import {createChunkData} from '../src/terrain-data.ts';
import {horizonBlockData,horizonGrid,horizonVertexAt,createHorizonSampler} from '../src/horizon-data.ts';
import {createTerrainView} from '../src/terrain-view.ts';

function setup(){
 configureTerrain({seed:42,density:1,width:1024,length:1024,seaLevel:0,chunkSize:64,viewDistance:240,terrain:islandPreset(1024,1024)});
 configureGeography({seed:42,grid:{minX:-512,minZ:-512,chunkSizeM:64,columns:16,rows:16},masks:{},biomeStrokes:[{x:0,z:0,radius:500,biome:'meadow'}]});
}
const bounds={width:1024,length:1024,seaLevel:0};
const context=spacing=>({...bounds,spacing});
const tile={minX:192,maxX:256,minZ:128,maxZ:192};

test('horizon lattice vertices match the horizon blocks exactly',()=>{
 setup();
 for(const spacing of [8,32]){
  const grid={...horizonGrid(1024,1024),spacing,columns:Math.ceil(1024/(spacing*32)),rows:Math.ceil(1024/(spacing*32))};
  const block=horizonBlockData(bounds,grid,1,1),v={};
  for(let j=0;j<=block.cellsZ;j+=7)for(let i=0;i<=block.cellsX;i+=5){
   const k=(j*(block.cellsX+1)+i)*3;horizonVertexAt(bounds,spacing,32+i,32+j,v);
   assert.ok(Math.abs(v.y-block.positions[k+1])<1e-5);
   for(const [a,b] of [[v.r,block.colors[k]],[v.g,block.colors[k+1]],[v.b,block.colors[k+2]],[v.nx,block.normals[k]],[v.ny,block.normals[k+1]],[v.nz,block.normals[k+2]]])assert.ok(Math.abs(a-b)<1e-6);
  }
 }
});
test('LOD 0/1 morph targets reproduce the next coarser tile exactly at its own vertices and edges',()=>{
 setup();
 for(const lod of [0,1]){
  const fine=createChunkData(tile,lod,context(32)),coarse=createChunkData(tile,lod+1,context(32));
  const coarseY=new Map();for(let i=0;i<coarse.surfaceVertices;i++)coarseY.set(coarse.positions[i*3]+':'+coarse.positions[i*3+2],coarse.positions[i*3+1]);
  let shared=0;
  for(let i=0;i<fine.surfaceVertices;i++){
   const key=fine.positions[i*3]+':'+fine.positions[i*3+2];
   if(coarseY.has(key)){assert.ok(Math.abs(fine.morphY[i]-coarseY.get(key))<1e-4);shared++;}
  }
  assert.ok(shared>=coarse.surfaceVertices);
  // Midpoints of coarse edges morph to the average of their two coarse neighbours.
  const n=Math.sqrt(fine.surfaceVertices)-1,at=(ix,iz)=>iz*(n+1)+ix;
  assert.ok(Math.abs(fine.morphY[at(1,0)]-(fine.positions[at(0,0)*3+1]+fine.positions[at(2,0)*3+1])/2)<1e-4);
  assert.ok(Math.abs(fine.morphY[at(1,1)]-(fine.positions[at(2,0)*3+1]+fine.positions[at(0,2)*3+1])/2)<1e-4,'cell centre on the coarse diagonal');
 }
});
test('LOD 2 morph target is the horizon surface (blend to/from the horizon without a jump)',()=>{
 setup();
 const d=createChunkData(tile,2,context(32)),sample=createHorizonSampler(bounds,32),v={};
 for(let i=0;i<d.surfaceVertices;i++){sample(d.positions[i*3],d.positions[i*3+2],v);assert.ok(Math.abs(d.morphY[i]-v.y)<1e-4);}
});
test('skirts reach below every representation a neighbour can show on the shared edge',()=>{
 setup();
 const d=createChunkData(tile,2,context(32)),sample=createHorizonSampler(bounds,32),v={};
 assert.ok(d.skirtDepth>=12);
 for(let k=0;k<=32;k++){
  const x=tile.minX+2*k,h=terrainHeight(x,tile.minZ),hy=sample(x,tile.minZ,v).y;
  // The 8 m edge of this tile vs the 2 m truth or the horizon line: covered by the skirt.
  const a=Math.floor(k/4)*4,b=Math.min(32,a+4),i8=terrainHeight(tile.minX+2*a,tile.minZ)+(terrainHeight(tile.minX+2*b,tile.minZ)-terrainHeight(tile.minX+2*a,tile.minZ))*(k-a)/4;
  assert.ok(d.skirtDepth>=Math.abs(i8-h)&&d.skirtDepth>=Math.abs(i8-hy)&&d.skirtDepth>=Math.abs(h-hy));
 }
 // Rising skirts start collapsed on their edge vertex and know the horizon height there.
 for(let k=0;k<d.upSource.length;k++){const s=d.upSource[k],u=d.upStart+k;assert.equal(d.positions[u*3+1],d.positions[s*3+1]);assert.equal(d.positions[u*3],d.positions[s*3]);}
 assert.equal(d.upHorizon.length,d.upEdges.reduce((a,b)=>a+b,0));
});
const focus=(over={})=>({playerX:0,playerZ:0,cameraX:0,cameraY:15,cameraZ:-13,forwardX:0,forwardZ:1,halfFovH:0.9,focalPx:493,velocityX:0,velocityZ:0,groundY:2,quality:0,...over});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('the terrain view blends coarser replacements and raises skirts only towards the horizon',async()=>{
 setup();
 const view=createTerrainView(new THREE.Group(),{width:1024,length:1024,chunkSize:64,viewDistance:240},{maxBuildsPerUpdate:64,morphSeconds:.15});
 let guard=0;do view.update(0,0,focus());while(view.stats.pending&&guard++<200);
 const meshes=()=>new Map(view.terrain.children.map(m=>[m.userData.chunkId,m]));
 // Borders of the detailed area are raised towards the horizon, inner sides are not.
 let raised=0,inner=0;
 for(const m of view.terrain.children){
  const g=m.geometry,u=g.userData,pos=g.getAttribute('position');if(u.upStart===undefined)continue;
  for(let k=0;k<u.upSource.length;k++){const dy=pos.getY(u.upStart+k)-pos.getY(u.upSource[k]);if(dy>1e-6)raised++;else inner++;}
 }
 assert.ok(raised>0&&inner>0,`rising skirts: ${raised} raised, ${inner} collapsed`);
 // Move the camera away: near tiles become coarser, but the finer mesh stays displayed while
 // it blends (same chunk id, finer LOD), then the coarser one replaces it.
 const before=meshes(),lod0=[...before.values()].find(m=>m.userData.lod===0);
 assert.ok(lod0);
 const away=focus({cameraY:100,groundY:2});
 guard=0;do view.update(0,0,away);while(view.stats.pending&&guard++<200);
 view.update(0,0,away);
 const during=meshes().get(lod0.userData.chunkId);
 assert.equal(during.userData.lod,0,'the finer tile is still shown while blending');
 assert.notEqual(during.material,lod0.material===during.material?null:lod0.material);
 for(let i=0;i<20;i++){await sleep(20);view.update(0,0,away);}
 const after=meshes().get(lod0.userData.chunkId);
 assert.ok(after.userData.lod>0,'replaced by its coarser tile after the blend');
 assert.ok(view.terrain.children.every(m=>m.material===view.terrain.children[0].material||m.material.customProgramCacheKey()==='terrain-geomorph-v1'));
 view.dispose();
});
