import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {simulatePlayer,MAX_OXYGEN,GLIDE,ROLL} from '../src/player.ts';
import {glideVelocity,movementEnergy,MOTION} from '../src/physics/motion.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {captureMovement,replayMovement,restoreMovement} from '../src/physics/movement-state.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {FrameClock} from '../src/frame-clock.ts';
import {buildMotionReference} from '../tools/generate-motion-reference.mjs';
import {readFile} from 'node:fs/promises';
import {readProjectArchive,writeProjectArchive} from '../src/studio-core/archive.ts';
const input={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0,cameraPitch:0};
const actor=(y=0)=>({position:new THREE.Vector3(0,y,0),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false,climbCooldown:100});
const flat=()=>new WorldCollisionQuery(()=>0,()=>null);
const step=(p,q,n,k={})=>{for(let i=0;i<n;i++)simulatePlayer(p,{...input,...k},1/30,q);};

test('glider dive exchanges height for speed, pull-up spends momentum and cannot gain energy',()=>{
 const p=actor(500);p.mode='glide';p.velocity.z=12;p.glideReady=true;const q=flat();
 const start=movementEnergy(p.position.y,p.velocity),energy=[start];
 step(p,q,60,{forward:1,cameraPitch:.85});const diveSpeed=p.velocity.length(),low=p.position.y;
 assert.ok(diveSpeed>16&&p.velocity.y<0,'dive accelerates');
 let peak=low,up=false;
 for(let i=0;i<240;i++){
  const before=movementEnergy(p.position.y,p.velocity);simulatePlayer(p,{...input,forward:1,cameraPitch:-.75},1/30,q);
  assert.ok(movementEnergy(p.position.y,p.velocity)<=before+1e-7,'steering never creates energy');
  up ||= p.velocity.y>1;peak=Math.max(peak,p.position.y);energy.push(movementEnergy(p.position.y,p.velocity));
 }
 assert.ok(up&&peak>low+1,'can trade the dive momentum for altitude');
 assert.ok(peak-low<diveSpeed*diveSpeed/(2*MOTION.gravity)+.1,'finite kinetic reserve');
 assert.ok(energy.at(-1)<start);
});
test('neutral gliding sinks gently; stall recovers by falling, never by injecting minimum speed',()=>{
 const p={velocity:{x:0,y:0,z:11}};
 for(let i=0;i<90;i++)glideVelocity(p,0,0,0,1/30);
 assert.ok(p.velocity.y<0&&p.velocity.y>-3);assert.ok(Math.hypot(p.velocity.x,p.velocity.z)>7);
 const stall={velocity:{x:0,y:0,z:1}};glideVelocity(stall,0,-.8,0,1/30);
 assert.equal(stall.stalled,true);assert.ok(Math.hypot(stall.velocity.x,stall.velocity.y,stall.velocity.z)<2);
 for(let i=0;i<90;i++)glideVelocity(stall,0,-.8,0,1/30);
 assert.ok(stall.velocity.y<0,'full pull-up at low speed cannot hover');
 const tuned={velocity:{x:0,y:-5,z:20}};
 for(let i=0;i<90;i++)glideVelocity(tuned,0,1,0,1/30,{...GLIDE,max:14});
 assert.ok(Math.hypot(tuned.velocity.x,tuned.velocity.y,tuned.velocity.z)<=14+1e-9);
});
test('turning is progressive and dissipates energy; closing and reopening wings adds no energy',()=>{
 const p=actor(200);p.mode='glide';p.velocity.z=18;p.glideReady=true;const q=flat();
 simulatePlayer(p,{...input,cameraYaw:Math.PI},1/30,q);
 assert.ok(Math.abs(p.glideHeading)<1e-10,'camera orbit alone cannot steer flight');
 assert.ok(p.velocity.z>0,'cannot reverse instantly');
 const right=actor(200);right.mode='glide';right.velocity.z=18;simulatePlayer(right,{...input,right:1},1/30,q);assert.ok(right.velocity.x<0,'D keeps the existing screen-right convention in flight');
 const a={velocity:{x:0,y:0,z:18}},b={velocity:{x:0,y:0,z:18}};
 glideVelocity(a,0,0,0,1/30);glideVelocity(b,1,0,0,1/30);
 assert.ok(b.velocity.x*b.velocity.x+b.velocity.y*b.velocity.y+b.velocity.z*b.velocity.z<a.velocity.x*a.velocity.x+a.velocity.y*a.velocity.y+a.velocity.z*a.velocity.z);
 // Reopening after the initial impulse is not a second propulsion exploit.
 const assisted=actor(200);assisted.mode='air';assisted.velocity.z=18;assisted.glideReady=true;
 simulatePlayer(assisted,{...input,jumpPressed:true},1/30,q);
 assert.equal(assisted.mode,'glide');assert.equal(assisted.glideDeploymentUsed,true);
 assert.ok(assisted.glideDeploymentRemaining>0);
 step(assisted,q,10);
 assert.equal(assisted.glideDeploymentRemaining,0);
 simulatePlayer(assisted,{...input,jumpPressed:true},1/30,q);
 assert.equal(assisted.mode,'air');
 simulatePlayer(assisted,input,1/30,q);
 simulatePlayer(assisted,{...input,jumpPressed:true},1/30,q);
 assert.equal(assisted.mode,'glide');
 assert.equal(assisted.glideDeploymentRemaining,0,'no second assist during the same jump');
});
test('roll → jump → deploy → landing preserves momentum without an entry kick',()=>{
 const q=flat(),p=actor();simulatePlayer(p,{...input,rollPressed:true},1/30,q);
 assert.equal(p.velocity.length(),0,'rolling at rest gives no free impulse');
 step(p,q,90,{forward:1});assert.equal(p.mode,'roll');const speed=p.velocity.length();
 simulatePlayer(p,{...input,jumpPressed:true,forward:1},1/30,q);
 assert.equal(p.mode,'air');assert.ok(Math.hypot(p.velocity.x,p.velocity.z)>speed*.95);
 simulatePlayer(p,input,1/30,q);simulatePlayer(p,{...input,jumpPressed:true},1/30,q);
 assert.equal(p.mode,'glide');assert.ok(p.velocity.length()>speed*.8);
 step(p,q,300,{cameraPitch:.4});assert.equal(p.mode,'ground');assert.equal(p.position.y,0);
});
test('roll uses surfaces, loses speed in corners and climbs using acquired speed',()=>{
 const coast=surface=>{const q=flat();q.setMaterialSampler(()=>surface);const p=actor();p.mode='roll';p.velocity.z=10;step(p,q,30);return p.velocity.length();};
 assert.ok(coast('rock')>coast('grass'));assert.ok(coast('grass')>coast('sand'));assert.ok(coast('sand')>coast('mud'));
 const q=flat(),a=actor(),b=actor();for(const p of [a,b]){p.mode='roll';p.velocity.z=10;}
 step(a,q,15,{forward:1});step(b,q,15,{right:1});assert.ok(b.velocity.length()<a.velocity.length());
 const up=new WorldCollisionQuery((x,z)=>Math.max(0,z)*.5,()=>null),p=actor();p.mode='roll';p.velocity.z=12;
 step(p,up,30);assert.ok(p.position.z>3&&p.position.y>1.5,'climbs on stored momentum');assert.ok(p.velocity.length()<12);
});
test('full XYZ sweep stops thin roofs in both directions and keeps arch passages open',()=>{
 const q=flat();q.add({id:'roof',position:{x:0,y:8,z:0},size:{x:10,y:.05,z:10},shape:'box',enabled:()=>true});
 let r=q.sweep({x:0,y:20,z:0},{x:0,y:-4,z:0},.32,1.35);assert.equal(r.position.y,8.05);assert.equal(r.blockedY,true);
 r=q.sweep({x:0,y:0,z:0},{x:0,y:20,z:0},.32,1.35);assert.ok(Math.abs(r.position.y-6.65)<1e-9);
 r=q.sweep({x:0,y:0,z:-8},{x:0,y:0,z:8},.32,1.35);assert.equal(r.position.z,8);assert.equal(r.position.y,0);
 for(const hz of [10,20,30,60]){const p=actor(20);p.mode='air';p.velocity.y=-80;for(let i=0;i<hz;i++)simulatePlayer(p,input,1/hz,q);assert.ok(Math.abs(p.position.y-8.05)<.01,'landed on thin roof at '+hz+' Hz');}
 const wall=flat();wall.add({id:'thin',position:{x:0,y:0,z:5},size:{x:10,y:20,z:.03},shape:'box',enabled:()=>true});
 const p=actor(5);p.mode='glide';p.velocity.z=34;step(p,wall,20,{cameraPitch:0});assert.ok(p.position.z<5);
});
test('flight enters water and walking/rolling leave a cliff without hanging in air',()=>{
 const water=new WorldCollisionQuery(()=>-5,()=>0),p=actor(6);p.mode='glide';p.velocity.set(0,-8,10);step(p,water,90,{cameraPitch:.5});assert.equal(p.mode,'swim');
 const q=new WorldCollisionQuery((x,z)=>z<2?0:-30,()=>null);
 for(const mode of ['ground','roll']){const p=actor();p.mode=mode;p.velocity.z=10;step(p,q,30,{forward:1});assert.ok(p.position.y<-1&&p.mode==='air',mode+' fell off cliff');}
});
test('movement checkpoints replay exactly across rendering frequencies and preserve hidden mode state',()=>{
 const q=flat(),p=actor(),tape=Array.from({length:180},(_,i)=>({tick:i+1,input:{...input,forward:1,rollHeld:i<40,jumpPressed:i===30||i===36,cameraPitch:i>70?-.4:.3,cameraYaw:i>90?.3:0}}));
 const initial=captureMovement(p,0),expected=replayMovement(p,initial,tape,q);
 const restored=actor();restoreMovement(restored,JSON.parse(JSON.stringify(expected)));assert.deepEqual(captureMovement(restored,180),expected);
 for(const hz of [20,30,60,144]){
  const c=new FrameClock(),a=actor();let tick=0;c.advance(0);
  for(let i=1;i<=hz*6;i++){const f=c.advance(i*1000/hz);for(let j=0;j<f.steps;j++){simulatePlayer(a,tape[tick].input,c.step,q);tick++;}}
  assert.equal(tick,180);assert.deepEqual(captureMovement(a,tick),expected);
 }
 const bad=structuredClone(expected);bad.velocity.x=NaN;assert.throws(()=>restoreMovement(restored,bad));
});
test('motion lab source is reproducible and portable through V3',async()=>{
 const p=buildMotionReference();assert.deepEqual(p,JSON.parse(await readFile(new URL('../tests/fixtures/legacy-maps/authoring/motion-reference.project.json',import.meta.url),'utf8')));
 assert.deepEqual(readProjectArchive(writeProjectArchive(p)).world,p.world);
 assert.ok(p.world.terrain.archipelago.features.some(f=>f.id==='launch-ramp'));
 assert.equal(Object.keys(p.entityIndex).length,4);
 const root=new URL('../tests/fixtures/legacy-maps/published/motion-reference/',import.meta.url),fetcher=async url=>{try{return new Response(await readFile(new URL(new URL(url).pathname.slice(1),root)));}catch{return new Response('',{status:404});}};
 const playable=playableFromCompiled(await openCompiledWorld('file:///manifest.json',fetcher));
 assert.equal(playable.collisions.length,4);assert.ok(Math.abs(playable.collisions.find(c=>c.id==='thin-roof').size.y-.15)<1e-9);assert.deepEqual(playable.world.config.terrain,p.world.terrain);
});

test('surface cache is position-based and repeatable after a rewind',async()=>{
 const {createMaterialSampler}=await import('../src/physics/surface-material.ts');let calls=0;
 const sampler=createMaterialSampler((x,z)=>{calls++;return x<0?'sand':z<0?'basalt':'mud';});
 assert.equal(sampler(-.1,0),'sand');assert.equal(sampler(-.2,0),'sand');assert.equal(calls,1);
 assert.equal(sampler(0,0),'mud');assert.equal(sampler(-.1,0),'sand');assert.equal(sampler(0,-.1),'rock');
});
test('a descending ramp transfers its tangent to takeoff and repeated commands reject gaps',()=>{
 const h=(x,z)=>z<=0?z*.4:z<1?.4*z:-20,q=new WorldCollisionQuery(h,()=>null),p=actor(h(0,-2));p.position.z=-2;p.mode='roll';p.velocity.z=12;
 let takeoff=false;for(let i=0;i<30&&!takeoff;i++){simulatePlayer(p,input,1/30,q);if(p.mode==='air'){assert.ok(p.velocity.y>0,'upward launch tangent');takeoff=true;}}
 assert.ok(takeoff);
 const s=captureMovement(p,30),copy=actor();assert.throws(()=>replayMovement(copy,s,[{tick:32,input}],q));
});

test('dive efficiency is tunable and can only remove potential-energy conversion',()=>{
 const a={velocity:{x:0,y:-8,z:12},glidePitch:-.8},b=structuredClone(a);
 for(let i=0;i<30;i++){glideVelocity(a,0,.8,0,1/30);glideVelocity(b,0,.8,0,1/30,{...GLIDE,diveEfficiency:.4});}
 assert.ok(Math.hypot(a.velocity.y,a.velocity.z)>Math.hypot(b.velocity.y,b.velocity.z));
});

test('a flat bridge deck uses its support rather than the hill beneath it',()=>{
 const q=new WorldCollisionQuery((x,z)=>x*.4+z*.4,()=>null);
 q.add({id:'deck',shape:'box',position:{x:0,y:9,z:0},size:{x:40,y:1,z:40},enabled:()=>true});
 const p=actor(10);p.mode='roll';p.velocity.z=8;p.stalled=true;
 step(p,q,30);assert.ok(Math.abs(p.position.x)<1e-9);assert.equal(p.position.y,10);assert.equal(p.stalled,false);
});
