import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSurfWaveField,validateSurfZone} from '../src/surf/wave-field.ts';
import {BARREL_CREST_PHASE,barrelCrestAlong,barrelProfile,nearestBarrelCrest,
 sampleSurfBarrel,stepSurfBarrel} from '../src/surf/surf-barrel.ts';
import {surfBarrelBand,createSurfBarrelView} from '../src/render/surf-barrel-view.ts';
import {captureMovement,restoreMovement} from '../src/physics/movement-state.ts';
import {BARREL_WASH,isShelteredByDive,startBarrelWash,stepBarrelWash} from '../src/surf/barrel-wash.ts';
import {applySurfTumblePose} from '../src/render/surf-tumble-pose.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {spawnPlayer,simulatePlayer} from '../src/player.ts';

const zone={id:'surf:barrel-test',minX:-80,maxX:80,minZ:-80,maxZ:80,
 dirX:0,dirZ:1,seaLevel:0,amplitude:1.4,wavelength:31,speed:6.2,seed:11,
 shoreFadeDepth:3,edgeFade:9,barrelStrength:1};
const ground=(_,z)=>z*.1-3;
const field=createSurfWaveField(zone,ground);
function surfer(x,z){return {position:{x,y:(field.height(x,z,0)??0)+.12,z},
 velocity:{x:6,y:0,z:6.2},mode:'surf',surfStage:'ride'};}

test('wave crest used by 3D curl follows the same phase and speed as the heightfield',()=>{
 const index=0,z=barrelCrestAlong(zone,0,index);
 assert.ok(Math.abs(z)<zone.wavelength);
 const crest=nearestBarrelCrest(zone,0,z,0);
 assert.equal(crest.index,index);
 assert.ok(Math.abs(crest.distance)<1e-9);
 const height=field.height(0,z,0);
 const depth=zone.seaLevel-ground(0,z),t=Math.max(0,Math.min(1,depth/(zone.shoreFadeDepth??3)));
 const env=t*t*(3-2*t); // same bathymetric envelope as WaveField
 const expected=zone.seaLevel+zone.amplitude*env*(Math.sin(BARREL_CREST_PHASE)+.22*Math.sin(2*BARREL_CREST_PHASE));
 assert.ok(Math.abs(height-expected)<1e-8,Math.abs(height-expected));
 const futureTick=30;
 const moving=barrelCrestAlong(zone,futureTick,index);
 assert.ok(Math.abs(moving-z-zone.speed)<1e-9);
 assert.ok(Math.abs(field.height(0,moving,futureTick)-field.height(0,moving,0))>.05);
});
test('tube only forms in the shallow breaking band and closes before the sand',()=>{
 assert.ok(barrelProfile(zone,0,0,ground)?.height>2.5);
 assert.equal(barrelProfile(zone,0,-45,ground),null,'deep water stays as a plain swell');
 assert.equal(barrelProfile(zone,0,20,ground),null,'the shallow lip vanishes before land');
 assert.equal(barrelProfile(zone,0,31,ground),null,'dry beach never creates a lip');
 const old={...zone,barrelStrength:0};
 assert.equal(barrelProfile(old,0,0,ground),null,'opt-out keeps old island water');
 assert.throws(()=>validateSurfZone({...zone,barrelStrength:1.5}),/Zone/);
});
test('tube has an analytic opening that shrinks as the shore approaches',()=>{
 const z0=barrelCrestAlong(zone,0,0),initial=sampleSurfBarrel(field,ground,0,z0,0);
 assert.ok(initial&&initial.clearance>1.74,initial?.clearance);
 const afterTick=44,z1=barrelCrestAlong(zone,afterTick,0);
 const late=sampleSurfBarrel(field,ground,0,z1,afterTick);
 assert.ok(late);
 assert.ok(late.clearance<initial.clearance,'closure decreases available overhead clearance');
 assert.equal(sampleSurfBarrel(field,ground,0,80,0),null);
});
test('a surfer can enter the moving barrel, ride laterally and escape before closure',()=>{
 const start=barrelCrestAlong(zone,0,0),p=surfer(0,start);
 assert.equal(stepSurfBarrel(p,field,ground,0),'entered');
 assert.equal(p.barrelWaveIndex,0);
 p.position.x=6.2;p.position.z=barrelCrestAlong(zone,12,0);
 assert.equal(stepSurfBarrel(p,field,ground,12),'escaped');
 assert.equal(p.barrelSuccessSeq,1);
 assert.equal(p.barrelEntryTick,undefined);
 assert.equal(stepSurfBarrel(p,field,ground,13),'none','one wave cannot farm tube rewards');
});
test('a barrel closing on an active surfer causes one controlled swimming wipeout',()=>{
 const start=barrelCrestAlong(zone,0,0),p=surfer(0,start);
 assert.equal(stepSurfBarrel(p,field,ground,0),'entered');
 p.position.z=barrelCrestAlong(zone,52,0);
 const event=stepSurfBarrel(p,field,ground,52);
 assert.equal(event,'closed');assert.equal(p.mode,'swim');
 assert.equal(p.barrelCrashSeq,1);assert.equal(p.surfWipeoutSeq,1);
 assert.equal(stepSurfBarrel(p,field,ground,53),'none');
});
test('a different wave or non-surf movement cannot complete the same tube',()=>{
 const p=surfer(0,barrelCrestAlong(zone,0,0));
 assert.equal(stepSurfBarrel(p,field,ground,0),'entered');
 p.mode='air';p.surfAirborne=true;
 assert.equal(stepSurfBarrel(p,field,ground,1),'none');
 assert.equal(p.barrelEntryTick,undefined);
});
test('low-poly barrel mesh is bounded, has one GPU buffer and tracks moving crests',()=>{
 const root=new THREE.Group(),view=createSurfBarrelView(root,field,ground);
 assert.ok(surfBarrelBand(zone,ground));
 assert.equal(view.mesh.name,'SurfBarrelLip');
 // Full-crest lips (72 columns × 4 crests): strict budget, drawn only for active crests.
 assert.ok(view.stats.vertices<=3300);
 assert.ok(view.stats.triangles<=6000);
 assert.equal(view.mesh.geometry.getAttribute('position').usage,THREE.DynamicDrawUsage);
 view.update(0,{x:0,z:4});
 assert.equal(view.mesh.visible,true);
 assert.ok(view.stats.activeFronts>0);
 const buffer=view.mesh.geometry.getAttribute('position').array;
 assert.ok([...buffer].every(Number.isFinite));
 const first=Array.from(buffer.slice(0,100));
 view.update(10,{x:0,z:4});
 assert.notDeepEqual(Array.from(buffer.slice(0,100)),first,'mesh follows advancing swells');
 view.dispose();assert.equal(root.children.length,0);
});
test('tube movement state is validated and restored by the existing replay snapshot',()=>{
 const a=spawnPlayer();
 a.barrelEntryTick=21;a.barrelWaveIndex=-4;a.barrelEntryAcross=5.7;
 a.barrelSuccessSeq=2;a.barrelCrashSeq=0;a.barrelCooldownUntilTick=80;
 const snapshot=captureMovement(a,22),other=spawnPlayer();
 restoreMovement(other,snapshot);
 for(const key of ['barrelEntryTick','barrelWaveIndex','barrelEntryAcross','barrelSuccessSeq','barrelCrashSeq','barrelCooldownUntilTick'])
   assert.equal(other[key],a[key]);
 assert.throws(()=>restoreMovement(other,{...snapshot,state:{...snapshot.state,barrelSuccessSeq:-1}}),/Événement surf invalide/);
});

test('a surface swimmer inside a breaking tube is briefly carried toward shore, never switched to ground roll',()=>{
 const z=barrelCrestAlong(zone,0,0);
 const p={position:{x:0,y:-.42,z},velocity:{x:0,y:0,z:0},mode:'swim',diving:false};
 const first=stepBarrelWash(p,field,ground,0,1/30);
 assert.equal(first.caught,true);
 assert.equal(first.active,true);
 assert.equal(p.mode,'swim','keep buoyancy and oxygen simulation');
 assert.equal(p.barrelTumbleSeq,1);
 assert.ok(p.velocity.z>5,'whitewater pushes in wave travel direction');
 assert.ok(Math.hypot(p.velocity.x,p.velocity.z)<=BARREL_WASH.maxSpeed);
 for(let tick=1;tick<=35;tick++)stepBarrelWash(p,field,ground,tick,1/30);
 assert.equal(p.barrelTumbleRemaining,0);
 assert.ok(Math.abs(p.barrelTumbleAngle-4*Math.PI)<.001,'ends after two complete spins');
 assert.equal(p.barrelTumbleSeq,1,'no repeated whitewater farming within cooldown');
});
test('explicit diving, held Ctrl and truly submerged swimming all evade the tube wash',()=>{
 const z=barrelCrestAlong(zone,0,0);
 for(const settings of [
   {mode:'dive',diving:true,y:-1.3,key:false},
   {mode:'swim',diving:true,y:-.35,key:false},
   {mode:'swim',diving:false,y:-.35,key:true},
   {mode:'swim',diving:false,y:-1.5,key:false},
 ]){
   const p={position:{x:0,y:settings.y,z},velocity:{x:0,y:0,z:0},mode:settings.mode,diving:settings.diving};
   assert.equal(isShelteredByDive(p,zone,settings.key),true);
   assert.equal(stepBarrelWash(p,field,ground,0,1/30,settings.key).caught,false);
   assert.equal(p.barrelTumbleSeq??0,0);
 }
 const p={position:{x:0,y:-.35,z},velocity:{x:0,y:0,z:0},mode:'swim',diving:false};
 assert.equal(stepBarrelWash(p,field,ground,0,1/30).caught,true);
 p.diving=true;p.mode='dive';
 const s=stepBarrelWash(p,field,ground,1,1/30);
 assert.equal(s.active,false,'diving stops an ongoing tumble immediately');
 assert.equal(p.barrelTumbleRemaining,0);
});
test('closed tube wipeout starts one shoreward wash without snapping onto terrain',()=>{
 const z=barrelCrestAlong(zone,0,0),p=surfer(0,z);
 assert.equal(stepSurfBarrel(p,field,ground,0),'entered');
 p.position.z=barrelCrestAlong(zone,52,0);
 assert.equal(stepSurfBarrel(p,field,ground,52),'closed');
 assert.equal(p.mode,'swim');
 assert.ok(p.position.y<=zone.seaLevel-.3);
 assert.equal(startBarrelWash(p,zone,52),true);
 assert.ok(p.velocity.z>zone.speed*.4);
 assert.equal(startBarrelWash(p,zone,53),false,'no duplicate impulse');
 assert.equal(p.barrelTumbleSeq,1);
});
test('real swim simulation keeps wash momentum, yields to dive, and respects the standard waterline',()=>{
 const z=barrelCrestAlong(zone,0,0),collision=new WorldCollisionQuery(ground,()=>0);
 const p=spawnPlayer();
 p.mode='swim';p.diving=false;p.position.set(0,-.42,z);p.velocity.set(0,0,0);
 const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0,cameraPitch:0};
 simulatePlayer(p,keys,1/30,collision,field,0);
 assert.equal(p.mode,'swim');
 assert.equal(p.barrelTumbleSeq,1);
 const startZ=p.position.z;
 for(let tick=1;tick<13;tick++)simulatePlayer(p,keys,1/30,collision,field,tick);
 assert.ok(p.position.z>startZ+1,'breaking water transports swimmer shoreward over time');
 assert.ok(p.position.y<=.06,'the flat swimming datum remains in force');
 assert.equal(p.mode,'swim');
 simulatePlayer(p,{...keys,jumpPressed:true},1/30,collision,field,13);
 assert.equal(p.diving,true);
 assert.equal(p.barrelTumbleRemaining,0);
 assert.ok(Number.isFinite(p.velocity.z));
});
test('tumble spin is a post-pose visual overlay with no movement-state mutations',()=>{
 const j=Object.fromEntries(['HamsterBody','Head','Tail','ArmLeft','ArmRight','FootLeft','FootRight','EarLeft','EarRight']
  .map(k=>[k,new THREE.Group()]));
 const character={rig:{joints:j}},p={mode:'swim',barrelTumbleRemaining:.5,barrelTumbleAngle:2.4};
 applySurfTumblePose(character,p);
 assert.ok(j.HamsterBody.rotation.x>2.35);
 assert.ok(j.ArmLeft.scale.x<1);
 assert.equal(p.barrelTumbleAngle,2.4);
 p.mode='dive';
 j.HamsterBody.rotation.x=0;
 applySurfTumblePose(character,p);
 assert.equal(j.HamsterBody.rotation.x,0,'no tumble pose while underwater');
});
test('wash state survives movement replay snapshots with strict bounds',()=>{
 const p=spawnPlayer();
 p.barrelTumbleRemaining=.6;p.barrelTumbleAngle=3.1;p.barrelTumbleSeq=5;
 p.barrelTumbleCooldownUntilTick=150;
 const snapshot=captureMovement(p,120),next=spawnPlayer();
 restoreMovement(next,snapshot);
 assert.equal(next.barrelTumbleRemaining,.6);
 assert.equal(next.barrelTumbleAngle,3.1);
 assert.equal(next.barrelTumbleCooldownUntilTick,150);
 for(const [fieldName,val] of [['barrelTumbleRemaining',-2],['barrelTumbleAngle',100],['barrelTumbleSeq',-1]])
  assert.throws(()=>restoreMovement(next,{...snapshot,state:{...snapshot.state,[fieldName]:val}}),/roulade|surf/i);
});
