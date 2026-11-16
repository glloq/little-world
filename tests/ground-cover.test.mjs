import test from 'node:test';
import assert from 'node:assert/strict';
import {groundCover} from '../src/geography/ground-cover.ts';
import {materialColor} from '../src/geography/materials.ts';
import * as THREE from 'three';
import {LinearColor} from '../src/render/linear-color.ts';
import {configureTerrain,terrainHeight} from '../src/terrain.ts';
import {islandPreset} from '../src/terrain-generator.ts';
import {configureGeography,updateGeographyMasks,classifyAt,geoContext} from '../src/geography/engine.ts';
import {EMPTY_MASK,setMaskCell,maskCell} from '../src/geography/layers.ts';
import {createChunkData} from '../src/terrain-data.ts';
import {horizonBlockData,horizonGrid} from '../src/horizon-data.ts';
import {generatedGrass} from '../src/biomes.ts';
const sample={height:35,slope:.1,coast:500,cliff:0,volcanic:0,moisture:.6,geology:'soil',biome:'meadow',material:'grass',occupation:'none',underwater:false};
test('ground cover is deterministic, seeded and varies in broad continuous masses',()=>{
 const colors=new Set();
 for(let x=-1000;x<1000;x+=16){const a=groundCover(sample,x,32,42);assert.deepEqual(a,groundCover(sample,x,32,42));colors.add(a.color);
 const b=groundCover(sample,x+.01,32,42);for(const shift of [0,8,16])assert.ok(Math.abs((a.color>>shift&255)-(b.color>>shift&255))<=1);}
 assert.ok(colors.size>30);assert.notEqual(groundCover(sample,48,48,42).color,groundCover(sample,48,48,99).color);
 assert.equal(groundCover({...sample,biome:'wetland',moisture:.9},0,0).type,'wetland');
 assert.equal(groundCover({...sample,biome:'forest',material:'forest-floor'},0,0).type,'forest-floor');
 assert.ok(groundCover({...sample,slope:1.19},0,0).density<.03);
});
test('all occupation/mineral/water exclusions suppress wild cover even with an authored grass material',()=>{
 for(const occupation of ['road','built','farm','exclusion'])assert.equal(groundCover({...sample,occupation},0,0).density,0);
 for(const material of ['sand','pebbles','rock','gravel','basalt','ash'])assert.equal(groundCover({...sample,material},0,0).density,0);
 assert.equal(groundCover({...sample,underwater:true},0,0).density,0);
});
function setup(){
 configureTerrain({seed:42,density:1,width:1024,length:1024,seaLevel:0,chunkSize:64,viewDistance:240,terrain:islandPreset(1024,1024)});
 const grid={minX:-512,minZ:-512,chunkSizeM:64,columns:16,rows:16};
 configureGeography({seed:42,grid,masks:{},biomeStrokes:[{x:0,z:0,radius:500,biome:'meadow'}]});return grid;
}
test('tufts share ground-cover colour/density and immediately see Studio mask revisions at the same coordinate',()=>{
 const grid=setup();let x,z,g;
 outer:for(x=-350;x<=350;x+=25)for(z=-350;z<=350;z+=25){g=generatedGrass(x,z);if(g)break outer;}
 const s=classifyAt(x,z),c=groundCover(s,x,z,geoContext().seed);
 assert.ok(g);assert.equal(g.color,c.color);assert.equal(g.share,c.density);
 const cell=maskCell(grid,x,z),occupation=setMaskCell(EMPTY_MASK,cell.index,'x');
 updateGeographyMasks({[cell.chunkId]:{occupation}});assert.equal(generatedGrass(x,z),null,'same-point cache invalidated');
 updateGeographyMasks({[cell.chunkId]:undefined});assert.deepEqual(generatedGrass(x,z),g,'Undo/restore returns same tufts');
 const out=new LinearColor();materialColor(s,0,out,x,z,42);const base=new LinearColor().setHex(g.color);
 assert.ok(Math.abs(out.g-base.g)<.03,'same unlit green channel at low altitude');
});
test('shared detail LOD and horizon vertices have identical packed colours without changing the relief',()=>{
 setup();const bounds={width:1024,length:1024,seaLevel:0},grid=horizonGrid(1024,1024),horizon=horizonBlockData(bounds,grid,0,0);
 const detailNormals=new Map();
 const boundsTile={minX:192,maxX:256,minZ:128,maxZ:192},byPoint=new Map();
 for(const lod of [0,1,2]){
  const d=createChunkData(boundsTile,lod);
  for(let i=0;i<d.surfaceVertices;i++){
   const x=d.positions[i*3],z=d.positions[i*3+2],key=x+':'+z,color=Array.from(d.colors.slice(i*3,i*3+3));
   assert.ok(Math.abs(d.positions[i*3+1]-terrainHeight(x,z))<1e-4);
   if(byPoint.has(key))assert.deepEqual(color,byPoint.get(key));else byPoint.set(key,color);
   detailNormals.set(key,Array.from(d.normals.slice(i*3,i*3+3)));
  }
 }
 // Horizon block containing this tile (8 m grid, blocks of 256 m).
 const block=horizonBlockData(bounds,grid,2,2);let compared=0;
 for(let i=0;i<block.positions.length/3;i++){
  const key=block.positions[i*3]+':'+block.positions[i*3+2],expected=byPoint.get(key);if(!expected)continue;
  const color=Array.from(block.colors.slice(i*3,i*3+3),v=>Math.round(Math.max(0,Math.min(1,v))*65535));
  assert.deepEqual(color,expected);
  const normals=Array.from(block.normals.slice(i*3,i*3+3),v=>Math.round(Math.max(-1,Math.min(1,v))*32767));
  assert.deepEqual(normals,detailNormals.get(key),'same lighting normal at the detail/horizon boundary');compared++;
 }
 assert.ok(compared>0,'actually compared shared horizon vertices');assert.ok(horizon.index.length>0);
});

test('palette lookup keeps exact Three.js sRGB-to-linear values for every byte channel',()=>{
 for(let i=0;i<256;i++){
  const hex=(i<<16)|((255-i)<<8)|((i*37)%256),actual=new LinearColor().setHex(hex),expected=new THREE.Color(hex);
  for(const channel of ['r','g','b'])assert.ok(Math.abs(actual[channel]-expected[channel])<1e-15);
 }
});
