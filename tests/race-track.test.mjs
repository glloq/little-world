import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceTrackSampler,trackLength,trackDiagnostics,validateRaceTrack} from '../src/gameplay/race-track.ts';
import {availableTrackFeature,roadbedFromGates,showcaseTrack} from '../src/gameplay/race-track-presets.ts';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {authoredRaceFromTrace,putAuthoredRace,sourceRaceKey} from '../src/studio-core/race-authoring.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
const road={
 width:8,material:'dirt',smooth:false,
 points:[{x:0,z:0},{x:0,z:120}],
 features:[
  {id:'feature:bank',kind:'bank',at:10,length:20,height:0,bankDeg:25},
  {id:'feature:bumps',kind:'bumps',at:35,length:10,height:.8},
  {id:'feature:bridge',kind:'bridge',at:60,length:20,height:1},
  {id:'feature:ramp',kind:'ramp',at:90,length:12,height:1.8}
 ]};
const valley=(x,z)=>z>=66&&z<=74?-3:0;
test('track uses native path centerline and builds all four gameplay modules on one physical surface',()=>{
 const length=trackLength(road);
 assert.ok(Math.abs(length-120)<1e-8);
 assert.equal(validateRaceTrack(road),road);
 const r=createRaceTrackSampler(road,{height:valley});
 assert.equal(r.sample(7,20),null,'outside the road width');
 const left=r.sample(-3,20),right=r.sample(3,20);
 assert.ok(right.y>left.y+.9,'bank raises the intended side');
 assert.ok(r.sample(0,38).y>r.sample(0,35).y);
 assert.ok(r.sample(0,70).y>0.9,'bridge deck spans the ravine');
 assert.ok(r.sample(0,101).y>r.sample(0,90).y+1);
 assert.ok(Math.abs(r.station(101,0).y-r.sample(0,101).y)<1e-7);
 const near=r.sample(0,100.5);
 assert.ok(near.along>100&&near.along<101);
});
test('invalid or ambiguous modular track layouts cannot be published',()=>{
 assert.throws(()=>validateRaceTrack({...road,width:1}),/paramètres/);
 assert.throws(()=>validateRaceTrack({...road,points:[{x:0,z:0},{x:0,z:1}]}),/points trop proches/);
 assert.throws(()=>validateRaceTrack({...road,features:[road.features[0],{...road.features[1],at:12}]}),/superposés/);
 assert.throws(()=>validateRaceTrack({...road,features:[{...road.features[0],bankDeg:65}]}),/inclinaison/);
 assert.throws(()=>validateRaceTrack({...road,features:[],points:[{x:-1,z:0},{x:0,z:50}]},{minX:0,maxX:100,minZ:0,maxZ:100}),/en dehors/);
});
test('existing outdoor collision query samples bridge from above, not from below',()=>{
 const sampler=createRaceTrackSampler(road,{height:valley});
 const collision=new WorldCollisionQuery(valley,()=>null);
 collision.setOutdoorCourseSurface((x,z)=>sampler.sample(x,z)?.y??null);
 const above=collision.surfaceAt({x:0,y:5,z:70});
 const under=collision.surfaceAt({x:0,y:-1,z:70});
 assert.ok(above.floorY>2,'bridge deck is solid from above');
 assert.equal(under.floorY,-3,'standing below a bridge does not teleport the character on top');
 assert.equal(collision.surfaceAt({x:10,y:5,z:70}).floorY,-3,'no track outside roadbed');
});
test('flat rolling demos gain rideable modular sections and records change after adding a ramp',()=>{
 const p=createProject({name:'Roads',worldId:'road-world',width:1000,length:1000});
 const race=authoredRaceFromTrace(p.world,{id:'race:road-test',name:'Course libre',kind:'roll',
   points:[{x:0,z:0},{x:10,z:35},{x:-5,z:75},{x:0,z:120}],height:()=>0});
 const roadbed=roadbedFromGates(race);
 assert.equal(roadbed.features.length,0);
 const demo=showcaseTrack(race);
 assert.ok(demo.features.some(f=>f.kind==='ramp'));
 assert.ok(demo.features.some(f=>f.kind==='bridge'));
 assert.ok(demo.features.some(f=>f.kind==='bank'));
 assert.ok(demo.features.some(f=>f.kind==='bumps'));
 const stamped={...race,track:demo};
 putAuthoredRace(p,stamped);
 assert.equal(parseProject(p).libraries.races[race.id].layoutKey,sourceRaceKey(stamped));
 assert.notEqual(sourceRaceKey(stamped),sourceRaceKey(race));
 const added=availableTrackFeature({...demo,features:[]},'ramp','feature:extra');
 assert.equal(added.kind,'ramp');
});
test('unsafe sharp corners are surfaced to the editor without changing player motion',()=>{
 const hairpin={...road,features:[],smooth:false,points:[{x:0,z:0},{x:0,z:20},{x:6,z:21},{x:7,z:41}]};
 assert.ok(trackDiagnostics(hairpin,{height:()=>0}).some(d=>d.code==='TRACK_TIGHT_TURN'));
});
