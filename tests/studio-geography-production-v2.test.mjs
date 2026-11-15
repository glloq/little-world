import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWatersheds} from '../src/studio-core/watershed-analysis.ts';
import {proposeWatershedRivers} from '../src/studio-core/watershed-rivers.ts';
import {reviewHydroNetwork,planHydroFalls} from '../src/studio-core/hydro-network-assistant.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
import {ECOLOGY_PROFILES,applyEcologyProfile} from '../src/studio-core/ecology-profiles.ts';
import {newRegion,validateRegionRecipe} from '../src/studio-core/region-recipes.ts';
import {createProject} from '../src/studio-core/schema.ts';
import {geographyReadiness} from '../src/studio-core/geography-readiness.ts';
import {wallModules} from '../src/studio-core/modular-construction.ts';

test('D8 headwater suggestions are reproducible and bounded on slender worlds',()=>{
 const bounds={minX:-300,maxX:300,minZ:-300,maxZ:300};
 const height=(x,z)=>120+Math.abs(x)*.55-z*.12;
 const a=analyzeWatersheds(bounds,height,-50,{stepM:20,maxCells:1024});
 assert.deepEqual(a,analyzeWatersheds(bounds,height,-50,{stepM:20,maxCells:1024}));
 assert.ok(a.headwaters.length>0&&a.headwaters.length<=12);
 assert.ok(a.headwaters.every(h=>h.upstreamAreaM2>0&&h.dropM>=3&&h.lengthM>=35));
 const narrow=analyzeWatersheds({minX:0,maxX:4,minZ:0,maxZ:10000},(x,z)=>100-z*.01,-50,{maxCells:256});
 assert.ok(narrow.sampled<=256);
});

test('headwater river previews are validated without mutating context or sources',()=>{
 const source={source:{x:0,z:0},toward:{x:0,z:30},upstreamAreaM2:20000,elevationM:120,dropM:35,lengthM:500};
 const height=(x,z)=>120-z*.1;
 const context={height,water:()=>null,inWorld:(x,z)=>Math.abs(x)<500&&z>-500&&z<800,seaLevel:-100,existing:[]};
 const original=structuredClone(source);
 const first=proposeWatershedRivers([source],context,{maxLengthM:500,maxRivers:1,idPrefix:'test-basin-'});
 assert.deepEqual(first,proposeWatershedRivers([source],context,{maxLengthM:500,maxRivers:1,idPrefix:'test-basin-'}));
 assert.deepEqual(source,original);
 assert.ok(first.proposals.length===1,JSON.stringify(first.rejected));
 assert.ok(first.proposals[0].plan.water.points.length>=2);
 assert.ok(compileWaterNetwork([first.proposals[0].plan.water],height,-100).every(w=>!w.diagnostics.some(d=>d.severity==='ERROR')));
});

test('fall batch never mutates input and only returns compiler-approved changes',()=>{
 const height=(x,z)=>100-z*.25;
 const waters=[{id:'river-a',kind:'river',points:[{x:0,z:0},{x:0,z:30},{x:0,z:60},{x:0,z:90}],width:6,depth:2,level:100,profile:{mode:'terrain',offset:-.35}}];
 const before=structuredClone(waters),advice=reviewHydroNetwork(waters,height,-10).falls;
 const preview=planHydroFalls(waters,advice,height,-10);
 assert.deepEqual(waters,before);
 assert.deepEqual(preview,planHydroFalls(waters,advice,height,-10));
 assert.ok(preview.changes.length<=1);
 if(preview.changes.length){
  assert.ok(preview.changes[0].falls.length<=8);
  assert.ok(compileWaterNetwork(preview.changes,height,-10).every(w=>!w.diagnostics.some(d=>d.severity==='ERROR')));
 }
});

test('regional ecology profiles respect V1 limits and preserve explicitly chosen species',()=>{
 const p=createProject({name:'Écologie',width:1000,length:1000});
 const source=newRegion(p);
 const original=structuredClone(source.vegetation);
 for(const profile of Object.keys(ECOLOGY_PROFILES)){
  const value=applyEcologyProfile(source.vegetation,profile);
  validateRegionRecipe({...source,vegetation:value},p.world.bounds);
  assert.ok(value.trees>=0&&value.trees<=2);
 }
 assert.deepEqual(source.vegetation,original);
});

test('geographic readiness is a non-mutating source-only diagnostic',()=>{
 const p=createProject({name:'Readiness',width:1000,length:1000}),before=structuredClone(p);
 const report=geographyReadiness(p);
 assert.equal(report.counts.entities,0);
 assert.ok(report.checks.length>=6);
 assert.equal(report.sectors.hydrated,Object.keys(p.chunks).length);
 assert.deepEqual(p,before);
});

test('long modular walls use one bounded sampling pass and keep geometry',()=>{
 const poses=wallModules([{x:0,z:0},{x:120,z:0}],1);
 assert.equal(poses.length,120);
 assert.ok(Math.abs(poses[0].x-.5)<1e-6);
 assert.ok(Math.abs(poses.at(-1).x-119.5)<1e-6);
 assert.ok(poses.every(p=>Math.abs(p.yaw)<1e-8&&p.scaleX===1));
});
