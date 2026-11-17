import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {simulatePlayer,MAX_OXYGEN,BOOST_LIFT} from '../src/player.ts';
import {GLIDE,GLIDE_DEPLOY,glideDeploymentStep} from '../src/physics/motion.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {captureMovement,replayMovement,restoreMovement} from '../src/physics/movement-state.ts';
import {advanceFlightAutoCamera} from '../src/render/flight-auto-camera.ts';

const dt=1/30;
const idle={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0,cameraPitch:0};
const floor=()=>new WorldCollisionQuery(()=>0,()=>null);
const actor=(mode='glide',vx=-7,vy=0,vz=0)=>({
 position:new THREE.Vector3(0,70,0),velocity:new THREE.Vector3(vx,vy,vz),
 mode,oxygen:MAX_OXYGEN,glideReady:true,climbCooldown:100
});

test('lateral jump deploys along original velocity, regardless of camera direction',()=>{
 const q=floor(),a=actor('air',-7,7.1),b=actor('air',-7,7.1);
 simulatePlayer(a,{...idle,jumpPressed:true,cameraYaw:0,cameraPitch:-1.1},dt,q);
 simulatePlayer(b,{...idle,jumpPressed:true,cameraYaw:Math.PI,cameraPitch:1.1},dt,q);
 assert.equal(a.mode,'glide');assert.equal(b.mode,'glide');
 assert.ok(a.velocity.x<0&&Math.abs(a.velocity.x)>Math.abs(a.velocity.z)*3);
 assert.ok(Math.abs(a.glideHeading+Math.PI/2)<1e-6,'initial heading follows lateral launch');
 assert.deepEqual(a.velocity,b.velocity,'orbit view must not affect the flight physics');
 assert.equal(a.glideDeploymentUsed,true);
 assert.ok(a.glideDeploymentRemaining>0);
 for(let i=0;i<30;i++){
  simulatePlayer(a,{...idle,cameraYaw:Math.PI/2,cameraPitch:-1},dt,q);
  simulatePlayer(b,{...idle,cameraYaw:-Math.PI/2,cameraPitch:1},dt,q);
 }
 assert.deepEqual(a.velocity,b.velocity,'free-look remains passive while flying');
 assert.ok(a.velocity.x<0,'no unexpected reversal after deployment');
});

test('directional inputs steer and pitch the glider independently of the view',()=>{
 const q=floor(),neutral=actor('glide',0,0,18),turn=actor('glide',0,0,18),
 dive=actor('glide',0,0,18),climb=actor('glide',0,0,18);
 for(let i=0;i<35;i++){
  simulatePlayer(neutral,{...idle,cameraYaw:i*.15},dt,q);
  simulatePlayer(turn,{...idle,right:1,cameraYaw:i*.15},dt,q);
  simulatePlayer(dive,{...idle,forward:1,cameraPitch:-.9},dt,q);
  simulatePlayer(climb,{...idle,forward:-1,cameraPitch:.9},dt,q);
 }
 assert.ok(turn.velocity.x<-3,'D induces a right turn in the existing coordinate convention');
 assert.ok(Math.abs(neutral.velocity.x)<1e-8,'camera rotation gives zero steering');
 assert.ok(dive.velocity.y<climb.velocity.y,'forward dives and backward climbs');
 assert.ok(turn.velocity.length()<neutral.velocity.length(),'intentional turn still costs energy');
});

test('deployment bonus is bounded, unique per jump, and rearmed by actual landing',()=>{
 const q=floor(),p=actor('air',-8,7,0);
 simulatePlayer(p,{...idle,jumpPressed:true},dt,q);
 assert.equal(p.glideDeploymentUsed,true);
 assert.ok(p.glideDeploymentRemaining>0&&p.glideDeploymentRemaining<GLIDE_DEPLOY.duration);
 for(let i=0;i<12;i++)simulatePlayer(p,idle,dt,q);
 assert.equal(p.glideDeploymentRemaining,0);
 simulatePlayer(p,{...idle,jumpPressed:true},dt,q);
 simulatePlayer(p,idle,dt,q);
 simulatePlayer(p,{...idle,jumpPressed:true},dt,q);
 assert.equal(p.mode,'glide');
 assert.equal(p.glideDeploymentRemaining,0,'reopening must not refill assist');
 p.position.y=0;p.velocity.set(0,-1,0);
 simulatePlayer(p,idle,dt,q);
 assert.equal(p.mode,'ground');assert.equal(p.glideDeploymentUsed,false);
 const capped={velocity:{x:0,y:0,z:33.9},glideHeading:0,glideDeploymentRemaining:GLIDE_DEPLOY.duration};
 for(let i=0;i<10;i++)glideDeploymentStep(capped,dt);
 assert.ok(Math.hypot(capped.velocity.x,capped.velocity.y,capped.velocity.z)<=GLIDE.max+1e-9);
 assert.equal(capped.glideDeploymentRemaining,0);
});

test('replay serializes and validates deployment state across fold and re-open',()=>{
 const q=floor(),start=actor('air',-8,7,0);
 const initial=captureMovement(start,0);
 const tape=Array.from({length:32},(_,i)=>({tick:i+1,input:{...idle,
  cameraYaw:i%2?Math.PI:0,cameraPitch:i%2?-.9:.9,
  jumpPressed:i===0||i===13||i===17,right:i>19?.5:0
 }}));
 const a=replayMovement(start,initial,tape,q),b=replayMovement(actor('air',-8,7,0),initial,tape,q);
 assert.deepEqual(a,b);
 assert.equal(a.state.glideDeploymentUsed,true);
 assert.equal(a.state.glideDeploymentRemaining,0);
 const restored=actor();restoreMovement(restored,structuredClone(a));
 assert.deepEqual(captureMovement(restored,32),a);
 const bad=structuredClone(a);bad.state.glideDeploymentRemaining=1;
 assert.throws(()=>restoreMovement(restored,bad),/déploiement/);
});

test('visual camera recenters only after inactivity, and never during drag',()=>{
 const camera={yaw:Math.PI,pitch:1,idleSeconds:0,wasGliding:false};
 const step=(drag=false,enabled=true,boosting=false)=>advanceFlightAutoCamera(camera,dt,true,drag,enabled,0,20,0,boosting);
 for(let i=0;i<28;i++)step();
 assert.equal(camera.yaw,Math.PI,'camera waits at high speed for 1 second');
 for(let i=0;i<110;i++)step();
 assert.ok(Math.abs(camera.yaw)<.01,'camera follows velocity behind player');
 assert.ok(Math.abs(camera.pitch-.32)<.01,'camera also regains comfortable elevation');
 camera.yaw=Math.PI;step(true);
 assert.equal(camera.yaw,Math.PI);assert.equal(camera.idleSeconds,0);
 for(let i=0;i<20;i++)step(false,false);
 assert.equal(camera.yaw,Math.PI,'setting disables auto-follow');
 advanceFlightAutoCamera(camera,dt,false,false,true,0,20,0,false);
 assert.equal(camera.wasGliding,false);
});

test('a gas pulse lifts a glider close to terrain instead of driving it into the ground',()=>{
 const q=floor(),p=actor('glide',0,-7,16);p.position.y=.8;p.gasReserve=56;
 const start=p.position.y;
 simulatePlayer(p,{...idle,boostHeld:true},dt,q);
 assert.equal(p.mode,'glide');
 assert.ok(p.velocity.y>0,'gas pulse actively arrests the descent');
 assert.equal(p.gasPulseSeq,1);
 for(let i=0;i<12;i++)simulatePlayer(p,{...idle,boostHeld:false},dt,q);
 assert.equal(p.mode,'glide','boost does not drop the hamster directly on the ground');
 assert.ok(p.position.y>start+.35,'gas pulse generates positive altitude');
});
test('stationary hold on Boost takes off, consumes one gas pulse, and preserves glide availability',()=>{
 const q=floor(),p=actor('ground',0,0,0);p.position.y=0;p.gasReserve=56;
 for(let i=0;i<9;i++)simulatePlayer(p,{...idle,boostHeld:true,run:true},dt,q);
 assert.equal(p.mode,'ground','quick tap never makes a gas launch');
 assert.equal(p.gasReserve,56);
 for(let i=0;i<3;i++)simulatePlayer(p,{...idle,boostHeld:true,run:true},dt,q);
 assert.equal(p.mode,'air','holding still launches vertically');
 assert.ok(p.velocity.y>BOOST_LIFT.launchVy-1,'launch maintains positive vertical speed');
 assert.equal(p.gasPulseSeq,1);
 assert.equal(p.gasReserve,42);
 assert.equal(p.airBoostUsed,true,'launch consumes the freefall bonus for this take-off');
 assert.equal(p.glideReady,true);
 simulatePlayer(p,{...idle,jumpPressed:true},dt,q);
 assert.equal(p.mode,'glide','can deploy the wings after gas launch');
});
test('freefall gas boost acts as a single double jump; later pulses are reserved for the glider',()=>{
 const q=floor(),p=actor('air',0,-3,9);p.gasReserve=70;
 simulatePlayer(p,{...idle,boostHeld:true},dt,q);
 assert.equal(p.gasPulseSeq,1);assert.equal(p.airBoostUsed,true);
 assert.ok(p.velocity.y>0,'air boost reverses a modest fall');
 for(let i=0;i<24;i++)simulatePlayer(p,{...idle,boostHeld:false},dt,q);
 const first=p.gasPulseSeq;
 for(let i=0;i<10;i++)simulatePlayer(p,{...idle,boostHeld:true},dt,q);
 assert.equal(p.gasPulseSeq,first,'freefall cannot trigger infinite extra jumps');
 simulatePlayer(p,{...idle,jumpPressed:true,boostHeld:false},dt,q);
 assert.equal(p.mode,'glide');
 simulatePlayer(p,{...idle,boostHeld:true},dt,q);
 assert.ok(p.gasPulseSeq>first,'ordinary powered glide still has multiple consumable pulses');
});
test('mobile short tap converts held roll into a persistent ball, and a second tap leaves it',()=>{
 const q=floor(),p=actor('ground',0,0,0);p.position.y=0;
 simulatePlayer(p,{...idle,forward:1,rollHeld:true},dt,q);
 assert.equal(p.mode,'roll');assert.equal(p.rollByHold,true);
 simulatePlayer(p,{...idle,forward:1,rollHeld:false,rollPressed:true},dt,q);
 assert.equal(p.mode,'roll');assert.equal(p.rollByHold,false,'tap locks the ball instead of cancelling it');
 simulatePlayer(p,{...idle,rollPressed:true},dt,q);
 assert.equal(p.mode,'ground','one more tap unlocks the ball');
});
test('new airborne boost state survives deterministic snapshots and rejects invalid charge',()=>{
 const p=actor('air',0,1,9),q=floor();p.gasReserve=70;
 const start=captureMovement(p,0),tape=Array.from({length:24},(_,i)=>({tick:i+1,input:{...idle,boostHeld:i>=2&&i<8,jumpPressed:i===14}}));
 const x=replayMovement(p,start,tape,q),y=replayMovement(actor('air',0,1,9),start,tape,q);
 assert.deepEqual(x,y);assert.equal(x.state.airBoostUsed,true);
 const broken=structuredClone(x);broken.state.groundBoostCharge=1;
 assert.throws(()=>restoreMovement(actor(),broken),/Charge de décollage/);
});
