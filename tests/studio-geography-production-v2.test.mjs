import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWatersheds} from '../src/studio-core/watershed-analysis.ts';
import {proposeWatershedRivers} from '../src/studio-core/watershed-rivers.ts';
import {proposeBasinLakes} from '../src/studio-core/basin-lakes.ts';
import {planLakeOutflow} from '../src/studio-core/lake-outflow.ts';
import {hydroOverviewProjection} from '../src/studio/hydro-preview-map.ts';
import {analyzeDepressions} from '../src/studio-core/depression-fill.ts';
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
 const extreme=analyzeWatersheds({minX:0,maxX:3,minZ:0,maxZ:1e9},(x,z)=>100-z*1e-8,-50,{maxCells:256});
 assert.ok(extreme.sampled<=256);
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

test('proposed shallow basin lakes are bounded, validated and leave original sources intact',()=>{
 const basins=[{outlet:{x:0,z:0},areaM2:20000,cells:20,kind:'pit'}],
   height=(x,z)=>12+Math.hypot(x,z)*.3,
   context={height,seaLevel:-10,bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},existing:[]};
 const original=structuredClone(basins);
 const first=proposeBasinLakes(basins,context);
 assert.deepEqual(first,proposeBasinLakes(basins,context));
 assert.deepEqual(basins,original);
 assert.equal(first.proposals.length,1);
 const water=first.proposals[0].water;
 assert.equal(water.kind,'lake');
 assert.equal(water.points.length,12);
 assert.ok(water.level<=100&&water.level>height(0,0));
 assert.ok(compileWaterNetwork([water],height,-10).every(w=>!w.diagnostics.some(d=>d.severity==='ERROR')));
 const failed=proposeBasinLakes(basins,{...context,height:()=>12});
 assert.equal(failed.proposals.length,0);
});

test('priority flood identifies a true enclosed bowl and computes a stable spill level',()=>{
 const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100},height=(x,z)=>8+Math.hypot(x,z)*.15;
 const a=analyzeDepressions(bounds,height,0,{maxCells:2048,minAreaM2:300});
 assert.ok(a.sampled<=2048&&a.depressions.length>=1);
 assert.deepEqual(a,analyzeDepressions(bounds,height,0,{maxCells:2048,minAreaM2:300}));
 const pit=a.depressions[0];
 assert.ok(Math.hypot(pit.outlet.x,pit.outlet.z)<16);
 assert.ok(pit.spillLevelM>15&&pit.spillLevelM<30);
 assert.ok(pit.depthM>5&&pit.areaM2>500);
 if(pit.spillway){
  assert.ok(pit.spillway.dropM>.75&&pit.spillway.distanceM>0);
  assert.ok(height(pit.spillway.crest.x,pit.spillway.crest.z)>=
    height(pit.spillway.downstream.x,pit.spillway.downstream.z)+.75);
 }
 const review=proposeBasinLakes(a.depressions,{height,bounds,existing:[],seaLevel:0},{maxLakes:1});
 assert.equal(review.proposals.length,1,JSON.stringify(review.rejected));
 assert.ok(review.proposals[0].water.points.length>=16);
 assert.ok(review.proposals[0].water.points.every(p=>height(p.x,p.z)>=review.proposals[0].water.level-.5));
 assert.deepEqual(review,proposeBasinLakes(a.depressions,{height,bounds,existing:[],seaLevel:0},{maxLakes:1}));
});
test('closed volcanic bowl exposes a downstream spillway without routing a river uphill',()=>{
 const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100};
 const height=(x,z)=>{
  if(x>=0)return 8+(100-x)*.05+Math.abs(z)*.01;
  const r=Math.hypot(x+50,z);
  return 8+r*.08+10*Math.exp(-(((r-30)/7)**2));
 };
 const result=analyzeDepressions(bounds,height,0,{stepM:3,maxCells:4096,minDepthM:1.5,minAreaM2:200});
 const basin=result.depressions.find(b=>b.spillway);
 assert.ok(basin,'A ringed depression must reveal a downstream spillway after priority flooding');
 assert.ok(height(basin.spillway.crest.x,basin.spillway.crest.z)>
   height(basin.spillway.downstream.x,basin.spillway.downstream.z)+.75);
 assert.ok(basin.spillway.distanceM>0);
 assert.ok(basin.spillLevelM>basin.bottomM+1.5);
});
test('priority flood refuses false pits on open sloping terrain and obeys cap',()=>{
 const bounds={minX:0,maxX:400,minZ:0,maxZ:400};
 const drainage=analyzeDepressions(bounds,(x,z)=>100-x*.12-z*.08,0,{maxCells:400});
 assert.equal(drainage.depressions.length,0);
 const skinny=analyzeDepressions({minX:0,maxX:4,minZ:0,maxZ:10000},(x,z)=>100-z*.01,0,{maxCells:256});
 assert.ok(skinny.sampled<=256);
 const extreme=analyzeDepressions({minX:0,maxX:3,minZ:0,maxZ:1e9},(x,z)=>100-z*1e-8,0,{maxCells:256});
 assert.ok(extreme.sampled<=256);
});
test('optional overflow river starts at lake edge and stays linked to the native WATER network',()=>{
 const height=(x,z)=>50-x*.1;
 const lake={id:'source-lake',kind:'lake',points:[{x:-2,z:-3},{x:2,z:-3},{x:2,z:3},{x:-2,z:3}],width:6,level:50,depth:3};
 const context={height,water:()=>null,inWorld:(x,z)=>x>-400&&x<400&&z>-400&&z<400,
   seaLevel:-20,existing:[lake]};
 const original=structuredClone(lake),spillway={crest:{x:2.4,z:0},downstream:{x:12,z:0},dropM:1,distanceM:12};
 const planned=planLakeOutflow(lake,spillway,context,{id:'source-outflow',width:5,depth:1.5,maxLengthM:180});
 assert.equal(planned.water.from.kind,'lake');
 assert.equal(planned.water.from.id,'source-lake');
 assert.ok(planned.water.points.length>=3&&planned.water.points[1].x>2);
 assert.deepEqual(lake,original);
 const checked=compileWaterNetwork([lake,planned.water],height,-20);
 assert.ok(checked.every(w=>!w.diagnostics.some(d=>d.severity==='ERROR')),JSON.stringify(checked.map(w=>w.diagnostics)));
 assert.throws(()=>planLakeOutflow(lake,{...spillway,crest:{x:200,z:0}},context,
   {id:'not-near-shore',width:5,depth:1.5,maxLengthM:180}),/éloigné/);
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

test('2D hydro overview preserves geographical aspect ratio and stays in bounds',()=>{
 const bounds={minX:-1500,maxX:1500,minZ:-4000,maxZ:4000};
 const project=hydroOverviewProjection(bounds,420,230);
 const a=project({x:-1500,z:-4000}),b=project({x:1500,z:4000});
 assert.ok(a.x>=12&&a.y>=12&&b.x<=420-12+1e-8&&b.y<=230-12+1e-8);
 assert.ok(Math.abs((b.x-a.x)/(b.y-a.y)-3000/8000)<1e-10);
 assert.deepEqual(project({x:0,z:0}),{x:210,y:115});
 assert.throws(()=>hydroOverviewProjection(bounds,12,12),/invalide/);
});
