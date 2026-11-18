import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/studio-core/schema.ts';
import {createRaceCorridorIndex} from '../src/gameplay/race-corridors.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {authoredRaceFromTrace,putAuthoredRace,sourceRaceKey} from '../src/studio-core/race-authoring.ts';
import {createRaceTrackSampler} from '../src/gameplay/race-track.ts';

const track={width:8,material:'dirt',smooth:true,
 points:[{x:-50,z:-40},{x:-30,z:-10},{x:0,z:10},{x:15,z:45},{x:20,z:100}],
 features:[]};
test('race corridor spatial mask clears the roadbed and not the surrounding forest',()=>{
 const index=createRaceCorridorIndex([track]);
 assert.ok(index.segmentCount>0);
 const sampler=createRaceTrackSampler(track,{height:()=>0});
 for(const d of [5,35,75,110]){
  const c=sampler.station(d,0);
  assert.equal(index.contains(c.x,c.z),true,'road centre always reserved');
 }
 assert.equal(index.contains(250,250),false);
 assert.equal(index.contains(0,80),false,'distant neighbouring slopes untouched');
});
test('V3 race roads are visible in Studio geography occupancy without painting masks or terrain',()=>{
 const p=createProject({name:'Course en forêt',width:600,length:600,seed:42,worldId:'corridor-world'});
 const race=authoredRaceFromTrace(p.world,{id:'race:corridor-test',name:'Course visible',kind:'roll',
  points:[{x:-50,z:-40},{x:-15,z:0},{x:15,z:45},{x:20,z:100}],height:()=>0});
 const withRoad={...race,track};
 withRoad.layoutKey=sourceRaceKey(withRoad);
 putAuthoredRace(p,withRoad);
 const geo=projectGeography(p).ctx;
 assert.equal(geo.occupancy(0,10),'road');
 assert.equal(geo.occupancy(250,250),'none');
 assert.equal(p.world.terrain,undefined,'adding a road does not modify the terrain source');
 assert.equal(Object.keys(p.chunks).length,0,'no extra chunks to store a route');
});
test('many long routes use sparse corridor stations rather than exceeding 64 course budget',()=>{
 const long={...track,points:[{x:0,z:-1200},{x:0,z:1200}],smooth:false};
 const all=Array.from({length:40},(_,i)=>({...long,points:long.points.map(p=>({x:p.x+i*15,z:p.z}))}));
 const index=createRaceCorridorIndex(all);
 assert.ok(index.segmentCount>0);
 assert.ok(index.segmentCount<45000);
 assert.equal(index.contains(15,-1000),true);
});
