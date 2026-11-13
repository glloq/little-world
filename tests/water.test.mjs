import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWaterBody,validateWaterProfile,WaterSpatialIndex} from '../src/water/profile.ts';
import {waterRibbonData} from '../src/water/geometry.ts';
import {createTerrainSource,configureTerrain,compiledWaterBodies,waterSurface,waterDepth,terrainHeight} from '../src/terrain.ts';
import {defaultWorld,parseWorld} from '../src/world-data.ts';
import {migrateWorldToV3,toRuntimeWorld} from '../src/studio-core/migration.ts';
import {parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putWater,removeWater,putTerrainEdit} from '../src/studio-core/source.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {localFileAssetResolver} from '../tools/compile-project.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} ≠ ${b}`);
const body=()=>({id:'stream',points:[{x:-40,z:-250},{x:-40,z:-180},{x:-40,z:-100}],width:10,depth:2,level:4,profile:{mode:'terrain',offset:-.35}});

test('river profile follows uncarved relief, remains descending, and does not mutate source',()=>{
 const water=body(),before=structuredClone(water),source=createTerrainSource(defaultWorld().config),c=compileWaterBody(water,source);
 assert.deepEqual(water,before);assert.ok(c.points[0].level-c.points.at(-1).level>10);
 for(let i=1;i<c.points.length;i++){assert.ok(c.points[i].level<=c.points[i-1].level);assert.ok(c.points[i].distance-c.points[i-1].distance<=3.01);}
 assert.equal(c.diagnostics.filter(d=>d.severity==='ERROR').length,0);
});
test('invalid direction, duplicate points, self crossing and deep cuts have explicit diagnostics',()=>{
 const w=body();w.points.reverse();assert.ok(compileWaterBody(w,createTerrainSource(defaultWorld().config)).diagnostics.some(d=>d.code==='WATER_UPHILL'));
 const duplicate=body();duplicate.points[1]={...duplicate.points[0]};assert.ok(compileWaterBody(duplicate,()=>5).diagnostics.some(d=>d.code==='WATER_DUPLICATE_POINT'));
 const crossing={...body(),points:[{x:0,z:0},{x:10,z:10},{x:0,z:10},{x:10,z:0}]};assert.ok(compileWaterBody(crossing,()=>5).diagnostics.some(d=>d.code==='WATER_SELF_CROSS'));
 assert.ok(compileWaterBody(body(),(_x,z)=>z< -200?0:20).diagnostics.some(d=>d.code==='WATER_DEEP_CUT'));
});
test('manual locked heights are preserved and reject ascending, nonfinite and mismatched values',()=>{
 const w=body();w.profile={mode:'manual',levels:[24,20,16]};const c=compileWaterBody(w,()=>50);
 near(c.points[0].level,24);near(c.points.at(-1).level,16);
 for(const p of [{mode:'manual',levels:[10,12,4]},{mode:'manual',levels:[1,NaN,0]},{mode:'manual',levels:[4,3]},{mode:'terrain',offset:Infinity},{mode:'terrain',offset:0,cache:[]}])assert.throws(()=>validateWaterProfile(p,3));
});
test('logical surface, carved bed and joined 3D strip use the same profile after terrain edits',()=>{
 const config=defaultWorld().config,w=body(),edits=[{id:'bank',x:-40,z:-250,radius:15,strength:1,mode:'raise',height:0}];
 try{
  configureTerrain(config,edits,[w]);const c=compiledWaterBodies()[0],geometry=waterRibbonData(c),snapshot=structuredClone(c);
  for(const [i,p] of c.points.entries()){
   near(waterSurface(p.x,p.z),p.level);assert.ok(waterDepth(p.x,p.z)>=2);assert.ok(terrainHeight(p.x,p.z)<p.level);
   near(geometry.positions[i*6+1],p.level+.04);near(geometry.positions[i*6+4],p.level+.04);
  }
  assert.equal(geometry.indices.length,(c.points.length-1)*6);
  configureTerrain(config,edits,[w]);assert.deepEqual(compiledWaterBodies()[0],snapshot);
 }finally{configureTerrain(config);}
});
test('spatial water queries ignore distant geometry and retain legacy overlap priority',()=>{
 const a=body();delete a.profile;const b={...structuredClone(a),id:'second',level:8};
 const index=new WaterSpatialIndex([a,b],()=>30);
 assert.equal(index.query(-40,-200)[0].level,8);assert.equal(index.query(900,900).length,0);
 assert.equal(index.query(-46,-200).length,0);assert.equal(index.query(-46,-200,2).length,2);
});
test('V2 constant levels are preserved while profiled rivers round-trip through V3 ZIP',()=>{
 const world=defaultWorld(),a=body(),pool={...body(),id:'flat'};delete pool.profile;world.water=[a,pool];
 const p=migrateWorldToV3(parseWorld(world)).project,restored=readProjectArchive(writeProjectArchive(p));
 assert.deepEqual(restored.libraries.water.stream,a);assert.equal(restored.libraries.water.flat.profile,undefined);
 assert.deepEqual(toRuntimeWorld(restored).water,world.water);
});
test('water updates and removal keep all migrated sector references valid',()=>{
 const world=defaultWorld();world.water=[body()];const p=migrateWorldToV3(world).project;
 const next=structuredClone(body());next.points=[{x:-50,z:-240},{x:-50,z:-160}];putWater(p,next);parseProject(p);
 assert.deepEqual(p.libraries.water.stream,next);removeWater(p,'stream');parseProject(p);
 assert.ok(Object.values(p.chunks).every(c=>!c.waterRefs.includes('stream')));
});
test('a local preview includes upstream canonical edits, and water chunks rebuild when those edits change',async()=>{
 const world=defaultWorld();world.water=[body()];world.terrain=[{id:'upstream',x:-40,z:-245,radius:12,strength:.2,mode:'raise',height:0}];
 const p=migrateWorldToV3(world).project,id=chunkAt(p.world,-40,-110),local=toRuntimeWorld(p,[id]);
 assert.ok(local.terrain.some(e=>e.id==='upstream'));
 const options={resolveAsset:localFileAssetResolver()},a=await compileProject(p,options);
 putTerrainEdit(p,{...world.terrain[0],strength:.3});
 const b=await compileProject(p,{...options,previous:a.manifest});
 for(const c of Object.values(p.chunks).filter(c=>c.waterRefs.includes('stream')))assert.ok(b.rebuiltChunkIds.includes(c.chunkId));
 for(const c of Object.values(p.chunks).filter(c=>!c.waterRefs.includes('stream')&&!c.terrainRefs.includes('upstream')))assert.ok(!b.rebuiltChunkIds.includes(c.chunkId));
});
