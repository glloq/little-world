import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GAS,gasLevel,gasBoostStep,refillGas,gasShots,gasMaxShots,gasCapacity,upgradeGas} from '../src/physics/gas-propulsion.ts';
import {glideVelocity,GLIDE,movementEnergy} from '../src/physics/motion.ts';
import {simulatePlayer} from '../src/player.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {captureMovement,replayMovement,restoreMovement} from '../src/physics/movement-state.ts';
import {parseGameSave} from '../src/gameplay/save.ts';
import {foodGasValue} from '../src/gameplay/food-effects.ts';
import {parsePresentationState} from '../src/hamster/presentation-state.ts';
const dt=1/30;
const input={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const flat=new WorldCollisionQuery(()=>0,()=>null);
const actor=(mode='glide')=>({position:new THREE.Vector3(0,120,0),velocity:new THREE.Vector3(0,-2,12),mode,oxygen:90,glideReady:true,gasReserve:75});

test('default reserve gives ten shots, capacity upgrades to twenty without refilling',()=>{
 const p={};
 assert.equal(gasLevel(p),150);assert.equal(gasShots(p),10);
 assert.equal(gasMaxShots(p),14);assert.equal(gasCapacity(p),200);
 p.gasReserve=150;
 for(const expected of [16,18,20]){
  assert.equal(upgradeGas(p,'capacity'),true);
  assert.equal(gasMaxShots(p),expected);
  assert.equal(gasLevel(p),150,'upgrade does not generate fuel');
 }
 assert.equal(upgradeGas(p,'capacity'),false);
 assert.equal(refillGas(p,500),130);
 assert.equal(gasLevel(p),280);
 assert.equal(upgradeGas(p,'power'),true);
 assert.equal(upgradeGas(p,'control'),true);
});

test('one press costs fourteen once, held repeats at bounded interval, no half-shot',()=>{
 const p={gasReserve:42};
 assert.equal(gasBoostStep(p,true,false,dt),0,'no boost without planeur');
 assert.equal(p.gasReserve,42);
 assert.equal(gasBoostStep(p,true,true,dt),0,'held prior to deploying must not auto-fire');
 gasBoostStep(p,false,true,dt);
 const first=gasBoostStep(p,true,true,dt);
 assert.ok(first>0&&first<GAS.acceleration);
 assert.equal(p.gasPulseSeq,1);assert.equal(p.gasReserve,28);
 for(let i=0;i<12;i++)gasBoostStep(p,false,true,dt);
 assert.equal(p.gasReserve,28,'release does not create more pulses');
 assert.equal(p.gasBoosting,false,'existing pulse finishes even when button released');
 gasBoostStep(p,true,true,dt);
 assert.equal(p.gasPulseSeq,1,'cooldown blocks early second shot');
 for(let i=0;i<22;i++)gasBoostStep(p,true,true,dt);
 assert.ok((p.gasPulseSeq??0)>=2,'holding repeats after cooldown');
 const seq=p.gasPulseSeq;
 for(let i=0;i<40;i++)gasBoostStep(p,true,true,dt);
 assert.equal(p.gasReserve,0);assert.equal(p.gasPulseSeq,3);
 assert.ok(p.gasPulseSeq>=seq);
 assert.equal(gasBoostStep(p,true,true,dt),0);
 p.gasReserve=13;assert.equal(gasBoostStep(p,true,true,dt),0,'remainder cannot pay for pulse');
 assert.equal(gasShots(p),0);
 assert.equal(refillGas(p,150),150);
});

test('boost raises speed with retained inertia and obeys the 60 m/s ceiling',()=>{
 const p={velocity:{x:0,y:-2,z:18},gasReserve:GAS.initial};
 let peak=0;
 for(let i=0;i<120;i++){
  const thrust=gasBoostStep(p,true,true,dt);
  glideVelocity(p,0,0,0,dt,GLIDE,thrust);
  peak=Math.max(peak,Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z));
 }
 assert.ok(peak>=120/3.6,'boost should exceed the prior cap');
 assert.ok(peak<=GLIDE.max+1e-9);
 const before=Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z);
 for(let i=0;i<20;i++){gasBoostStep(p,false,true,dt);glideVelocity(p,0,0,0,dt);}
 const after=Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z);
 assert.equal(p.gasThrust,0);
 assert.ok(after<before&&after>before-15,'release only dissipates momentum gradually');
});

test('no boost means no free kinetic energy',()=>{
 const unpowered={velocity:{x:0,y:-2,z:12}},powered={velocity:{x:0,y:-2,z:12}};
 const before=movementEnergy(100,unpowered.velocity);
 glideVelocity(unpowered,0,0,0,dt);
 glideVelocity(powered,0,0,0,dt,GLIDE,5);
 const v=p=>Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z);
 assert.ok(v(powered)>v(unpowered));
 assert.ok(movementEnergy(100,powered.velocity)>movementEnergy(100,unpowered.velocity));
 assert.ok(movementEnergy(100+unpowered.velocity.y*dt,unpowered.velocity)<before,'account for the altitude traversed during this integration tick');
 for(let i=0;i<500;i++)glideVelocity(powered,0,0,0,dt,GLIDE,5);
 assert.ok(v(powered)<=GLIDE.max+1e-9);
});

test('actor rejects propulsion outside glide and completes pulse after release',()=>{
 for(const mode of ['ground','air','swim','dive','climb','roll']){
  const p=actor(mode);p.gasReserve=90;
  simulatePlayer(p,{...input,boostHeld:true},dt,flat);
  assert.equal(p.gasReserve,90,mode);assert.equal(p.gasBoosting,false,mode);
 }
 const p=actor();simulatePlayer(p,{...input,boostHeld:true},dt,flat);
 assert.equal(p.gasReserve,61);assert.ok(p.gasBoosting);
 simulatePlayer(p,{...input,boostHeld:false},dt,flat);
 assert.ok(p.gasBoosting,'one-shot already started finishes even when released');
 for(let i=0;i<10;i++)simulatePlayer(p,{...input,boostHeld:false},dt,flat);
 assert.equal(p.gasBoosting,false);
});

test('boost replay captures cooldown, levels and inputs and rejects tampered state',()=>{
 const p=actor(),start=captureMovement(p,0);
 const tape=Array.from({length:32},(_,i)=>({tick:i+1,input:{...input,boostHeld:i<25}}));
 const a=replayMovement(p,start,tape,flat);
 const b=replayMovement(actor(),start,tape,flat);
 assert.deepEqual(b,a);assert.ok(a.state.gasReserve<75);
 const copy=actor();restoreMovement(copy,structuredClone(a));
 assert.deepEqual(captureMovement(copy,32),a);
 const damaged=structuredClone(a);damaged.state.gasReserve=281;
 assert.throws(()=>replayMovement(actor(),damaged,[],flat),/Gaz invalide/);
 const badLevel=structuredClone(a);badLevel.state.gasPowerLevel=9;
 assert.throws(()=>restoreMovement(actor(),badLevel),/Niveau de propulsion invalide/);
 assert.throws(()=>replayMovement(actor(),start,[{tick:1,input:{...input,boostHeld:'yes'}}],flat),/Commande/);
});

test('existing food refill whitelist remains unchanged',()=>{
 assert.equal(foodGasValue('food:apple'),25);
 assert.equal(foodGasValue('food:cherry'),12);
 assert.equal(foodGasValue('forage:mushroom'),0);
 assert.equal(foodGasValue('tool:axe'),0);
});

test('old saves keep their numeric fuel without granting free fuel',()=>{
 const old={schemaVersion:1,worldId:'w',worldBuildVersion:'b1',slotId:'slot-1',savedAt:1,time:0,position:{x:0,y:0,z:0},inventory:{},variables:{},objectives:{},entities:{},executed:{},cooldowns:{},dialogueFlags:{},pending:[]};
 assert.equal(parseGameSave(old).gasReserve,GAS.legacyInitial);
 assert.equal(parseGameSave({...old,schemaVersion:2,gasReserve:19}).gasReserve,19);
 assert.throws(()=>parseGameSave({...old,schemaVersion:2,gasReserve:201}),/gaz invalide/);
});

test('remote state accepts optional boost cue but rejects invalid sequence',()=>{
 const s={v:1,t:0,x:0,y:2,z:0,yaw:0,mode:'glide',speed:12,verticalSpeed:-1,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null,gasBoosting:true,gasPulseSeq:8};
 assert.equal(parsePresentationState(s).gasPulseSeq,8);
 assert.throws(()=>parsePresentationState({...s,gasPulseSeq:-1}),/Séquence de propulsion/);
});
