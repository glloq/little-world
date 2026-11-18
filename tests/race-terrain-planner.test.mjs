import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {projectRaceTerrainEnvironment} from '../src/studio-core/race-terrain-context.ts';
import {findRaceTerrainPlacements,inspectRaceTerrain,raceFromTerrainPlacement} from '../src/studio-core/race-terrain-planner.ts';
import {putAuthoredRace,sourceRaceKey} from '../src/studio-core/race-authoring.ts';
const clearEnv={
 bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000},seaLevel:0,
 height:(x,z)=>150-z*.11,water:()=>null,occupation:()=> 'none'
};
const flatEnv={...clearEnv,height:(x,z)=>80+Math.sin(x/120)*.5+Math.cos(z/100)*.7};
test('deterministic bounded search finds true downhill routes with whole-width clearance',()=>{
 const request={anchor:{x:0,z:0},style:'downhill',targetLength:210,width:8,maxResults:3,seed:123};
 const a=findRaceTerrainPlacements(clearEnv,request),b=findRaceTerrainPlacements(clearEnv,request);
 assert.deepEqual(a,b,'no clock, network, random or browser dependence');
 assert.equal(a.checked,72,'bounded 12 sites times three headings times two bends');
 assert.ok(a.candidates.length>0,'synthetic hill must yield downhill candidates');
 for(const candidate of a.candidates){
  assert.ok(candidate.metrics.dropM>7);
  assert.ok(inspectRaceTerrain(candidate.track,clearEnv,'downhill').valid);
  assert.ok(candidate.track.features.length<=4);
 }
});
test('flatland tracks favor limited elevation change and retain valid landings',()=>{
 const r=findRaceTerrainPlacements(flatEnv,{anchor:{x:0,z:0},style:'flat',width:8,seed:42});
 assert.ok(r.candidates.length>0);
 for(const p of r.candidates){
  assert.ok(Math.abs(p.metrics.dropM)<=Math.max(9,p.metrics.lengthM*.07));
  assert.ok(inspectRaceTerrain(p.track,flatEnv,'flat').valid);
 }
});
test('occupation and water exclude the whole corridor; failures return an explainable count',()=>{
 const blocked={...clearEnv,occupation:()=> 'built'};
 const r=findRaceTerrainPlacements(blocked,{anchor:{x:0,z:0},style:'downhill'});
 assert.equal(r.candidates.length,0);
 assert.ok(r.rejected.OCCUPIED>0);
 const drowned={...flatEnv,water:()=>200};
 const sea=findRaceTerrainPlacements(drowned,{anchor:{x:0,z:0},style:'flat'});
 assert.equal(sea.candidates.length,0);
 assert.ok(sea.rejected.WATER>0);
});
test('accepted proposal is an authored V3 race with timed start and distinct source layout',()=>{
 const p=createProject({name:'Pistes automatiques',width:2000,length:2000,worldId:'terrain-world'}),
    env={...clearEnv,bounds:p.world.bounds},
    found=findRaceTerrainPlacements(env,{anchor:{x:0,z:0},style:'downhill'});
 const a=found.candidates[0];
 assert.ok(a);
 const race=raceFromTerrainPlacement(p.world,'race:autoplace-test','Descente de test',a,env);
 assert.equal(race.gates.length,5);
 assert.equal(race.track.features.length,a.track.features.length);
 assert.equal(race.gates[0].allowedModes[0],'roll');
 assert.equal(race.startOnFirstGate,true);
 assert.equal(race.layoutKey,sourceRaceKey(race));
 putAuthoredRace(p,race);
 assert.deepEqual(parseProject(p).libraries.races[race.id],race);
 const altered=structuredClone(race);
 altered.track.points[2].x+=2;
 assert.notEqual(sourceRaceKey(altered),race.layoutKey,'geography edits isolate records');
});
test('planner rejects unwalkable transverse slopes and never invents a bridge across open water',()=>{
 const env={...clearEnv,height:(x,z)=>100+x*.92};
 const result=findRaceTerrainPlacements(env,{anchor:{x:0,z:0},style:'flat'});
 assert.equal(result.candidates.length,0);
 assert.ok((result.rejected.STEEP??0)+(result.rejected.CROSS_SLOPE??0)>0);
 const river={...clearEnv,water:(x,z)=>z>20&&z<400?220:null};
 const r=findRaceTerrainPlacements(river,{anchor:{x:0,z:0},style:'downhill'});
 for(const candidate of r.candidates)assert.ok(inspectRaceTerrain(candidate.track,river,'downhill').valid);
});

test('real V3 source adapter uses the project geography, not the mutable runtime singleton',()=>{
 const p=createProject({name:'Terrain V3',worldId:'world-v3',width:1200,length:1200,seed:100});
 const adapter=projectRaceTerrainEnvironment(p),geo=projectGeography(p).ctx;
 for(const q of [{x:0,z:0},{x:-120,z:240},{x:280,z:-190}]){
  assert.equal(adapter.height(q.x,q.z),geo.height(q.x,q.z));
  assert.equal(adapter.water(q.x,q.z,adapter.height(q.x,q.z)),geo.water(q.x,q.z,geo.height(q.x,q.z)));
 }
});
