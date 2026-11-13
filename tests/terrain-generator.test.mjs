import test from 'node:test';
import assert from 'node:assert/strict';
import {islandPreset,parseTerrainGenerator,islandHeight,volcanoProfile} from '../src/terrain-generator.ts';
import {configureTerrain,terrainHeight,waterSurface,insideWorld,isLegacyTerrain,createTerrainSource,smoothstep,lerp} from '../src/terrain.ts';
import {createProject,parseProject,parseWorldV3} from '../src/studio-core/schema.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {defaultWorld,parseWorld} from '../src/world-data.ts';

const W=3000,L=8000,preset=islandPreset(W,L),world={seed:4242,seaLevel:0,width:W,length:L};
test('island preset is a valid, bounded generator for a 3 × 8 km project',()=>{
  const parsed=parseTerrainGenerator(preset,{width:W,length:L});
  assert.deepEqual(parsed,preset);
  assert.equal(preset.kind,'island');
  assert.throws(()=>parseTerrainGenerator({...preset,island:{...preset.island,volcano:{...preset.island.volcano,x:1400}}},{width:W,length:L}),/dépasse/);
  assert.throws(()=>parseTerrainGenerator({...preset,extra:1},{width:W,length:L}),/inconnu/);
  assert.throws(()=>parseTerrainGenerator({kind:'voxels',version:1},{width:W,length:L}),/inconnu/);
});
test('island relief is deterministic per seed and closed by the sea on every edge',()=>{
  const a=islandHeight(world,preset.island),b=islandHeight(world,preset.island),c=islandHeight({...world,seed:4243},preset.island);
  let differs=false;
  for(let i=0;i<200;i++){const x=(i*37%300-150)*9,z=(i*53%800-400)*9;assert.equal(a(x,z),b(x,z));if(Math.abs(a(x,z)-c(x,z))>.01)differs=true;}
  assert.ok(differs,'the seed changes the coastline/hills');
  for(let t=0;t<=1;t+=1/400){
    for(const [x,z] of [[-W/2+t*W,-L/2],[-W/2+t*W,L/2],[-W/2,-L/2+t*L],[W/2,-L/2+t*L]])assert.ok(a(x,z)<world.seaLevel-5,`edge (${x},${z}) is open sea`);
  }
  assert.ok(a(0,L/4)>world.seaLevel+5,'lowland interior is dry land');
});
test('volcano dominates the silhouette with a crater below its rim',()=>{
  const h=islandHeight(world,preset.island),v=preset.island.volcano;
  const rim=Math.max(...Array.from({length:16},(_,i)=>h(v.x+Math.cos(i/16*Math.PI*2)*v.craterRadiusM,v.z+Math.sin(i/16*Math.PI*2)*v.craterRadiusM)));
  assert.ok(rim>v.heightM*.75,`rim ${rim}`);
  assert.ok(h(v.x,v.z)<rim-v.craterDepthM*.7,'crater floor below the rim');
  assert.equal(volcanoProfile(v,v.radiusM+1),0);
  assert.ok(volcanoProfile(v,v.radiusM*.5)>0);
});
test('runtime terrain dispatches island sea/water rules without legacy valley features',()=>{
  configureTerrain({seed:4242,density:1,width:W,length:L,seaLevel:0,chunkSize:64,viewDistance:240,terrain:preset});
  assert.equal(isLegacyTerrain(),false);
  assert.equal(waterSurface(-W/2+10,0),0,'offshore is sea');
  assert.equal(waterSurface(0,L/4),null,'inland is dry');
  assert.equal(insideWorld(0,L/2-5),true);
  assert.equal(insideWorld(0,L/2-1),false);
  configureTerrain(defaultWorld().config);
  assert.equal(isLegacyTerrain(),true);
});
test('bucketed terrain edits match ordered brute-force application',()=>{
  const edits=Array.from({length:120},(_,i)=>({id:'e'+i,x:(i*97%600)-300,z:(i*71%600)-300,radius:5+i%70,strength:(i%10)+.5,mode:['raise','lower','flatten','smooth'][i%4],height:(i%30)-5}));
  const config={seed:7,density:1,width:3000,length:8000,seaLevel:0,terrain:preset},fast=createTerrainSource(config,edits),base=createTerrainSource(config,[]);
  for(let i=0;i<400;i++){const x=(i*13%640)-320,z=(i*29%640)-320;let h=base(x,z);
    for(const s of edits){const d=Math.hypot(x-s.x,z-s.z);if(d>=s.radius)continue;const w=1-smoothstep(0,s.radius,d);if(s.mode==='raise'||s.mode==='lower')h+=(s.mode==='raise'?1:-1)*s.strength*w;else h=lerp(h,s.height,w*Math.min(1,s.strength/4));}
    assert.ok(Math.abs(fast(x,z)-h)<1e-9);}
});
test('V3 sources carry the generator; legacy sources and V2 contracts stay unchanged',()=>{
  const island=createProject({name:'Île',width:W,length:L,seed:4242,terrain:preset});
  const parsed=parseProject(structuredClone(island));
  assert.deepEqual(parsed.world.terrain,preset);
  assert.deepEqual(toRuntimeWorld(parsed).config.terrain,preset);
  const legacy=createProject({name:'Vallée'});
  assert.equal(parseProject(structuredClone(legacy)).world.terrain,undefined);
  assert.equal(toRuntimeWorld(legacy).config.terrain,undefined);
  assert.throws(()=>parseWorldV3({...island.world,terrain:{kind:'island',version:2,island:preset.island}}),/inconnu/);
  const v2=defaultWorld();v2.config.terrain=preset;
  assert.throws(()=>parseWorld(v2),/V3/);
});
