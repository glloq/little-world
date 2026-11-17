import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GAS,gasLevel,gasBoostStep,refillGas} from '../src/physics/gas-propulsion.ts';
import {glideVelocity,GLIDE,movementEnergy} from '../src/physics/motion.ts';
import {simulatePlayer} from '../src/player.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {captureMovement,replayMovement} from '../src/physics/movement-state.ts';
import {parseGameSave} from '../src/gameplay/save.ts';
import {foodGasValue} from '../src/gameplay/food-effects.ts';
import {parsePresentationState} from '../src/hamster/presentation-state.ts';
const dt=1/30;
const input={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const flat=new WorldCollisionQuery(()=>0,()=>null);
const actor=(mode='glide')=>({position:new THREE.Vector3(0,120,0),velocity:new THREE.Vector3(0,-2,12),mode,oxygen:90,glideReady:true,gasReserve:75});
test('flight-only gate, pulse counter and bounded reserve',()=>{
 const p={gasReserve:4};
 assert.equal(gasBoostStep(p,true,false,dt),0);
 assert.equal(p.gasReserve,4);
 const first=gasBoostStep(p,true,true,dt);assert.ok(first>0&&first<GAS.acceleration,'thrust ramps instead of kicking instantly');
 assert.equal(p.gasPulseSeq,1);
 let n=0;while(p.gasReserve>0&&n++<50)gasBoostStep(p,true,true,dt);
 assert.equal(p.gasReserve,0);
 assert.equal(gasBoostStep(p,true,true,dt),0);
 assert.equal(p.gasBoosting,false);
 assert.ok(p.gasPulseSeq>=1);
 assert.equal(refillGas(p,150),100);
 assert.equal(refillGas(p,5),0);
 assert.equal(gasLevel({}),GAS.initial);
});
test('sustained boost reaches 120 km/h and releasing preserves momentum',()=>{
 const p={velocity:{x:0,y:-2,z:18}},gasReserve:GAS.initial;
 let peak=0;
 for(let i=0;i<120;i++){
  const thrust=gasBoostStep(p,true,true,dt);
  glideVelocity(p,0,0,0,dt,GLIDE,thrust);
  peak=Math.max(peak,Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z));
 }
 assert.ok(peak>=120/3.6-1e-6,'boost should reach 120 km/h with the initial tank');
 assert.ok(peak<=GLIDE.max+1e-9);
 const before=Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z);
 gasBoostStep(p,false,true,dt);
 for(let i=0;i<15;i++)glideVelocity(p,0,0,0,dt);
 const after=Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z);
 assert.equal(p.gasThrust,0);
 assert.ok(after<before&&after>before-5,'release dissipates speed gradually');
});
test('thrust adds kinetic energy only while fueled; speed cap still applies',()=>{
 const unpowered={velocity:{x:0,y:-2,z:12}},powered={velocity:{x:0,y:-2,z:12}};
 const before=movementEnergy(100,unpowered.velocity);
 glideVelocity(unpowered,0,0,0,dt);
 glideVelocity(powered,0,0,0,dt,GLIDE,5);
 const v=p=>Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z);
 assert.ok(v(powered)>v(unpowered));
 assert.ok(movementEnergy(100,powered.velocity)>movementEnergy(100,unpowered.velocity));
 assert.ok(movementEnergy(100,unpowered.velocity)<before);
 for(let i=0;i<500;i++)glideVelocity(powered,0,0,0,dt,GLIDE,5);
 assert.ok(v(powered)<=GLIDE.max+1e-9);
});
test('actor refuses boost on ground, in air and in water, then applies in glide',()=>{
 for(const mode of ['ground','air','swim','dive','climb','roll']){
  const p=actor(mode);p.gasReserve=90;
  simulatePlayer(p,{...input,boostHeld:true},dt,flat);
  assert.equal(p.gasReserve,90,mode);
  assert.equal(p.gasBoosting,false,mode);
 }
 const p=actor();simulatePlayer(p,{...input,boostHeld:true},dt,flat);
 assert.ok(p.gasReserve<75&&p.gasBoosting);
 simulatePlayer(p,{...input,boostHeld:false},dt,flat);
 assert.equal(p.gasBoosting,false);
});
test('boost replay uses the same tick commands, validates unexpected state',()=>{
 const p=actor(),start=captureMovement(p,0);
 const tape=Array.from({length:32},(_,i)=>({tick:i+1,input:{...input,boostHeld:i<25}}));
 const a=replayMovement(p,start,tape,flat);
 const b=replayMovement(actor(),start,tape,flat);
 assert.deepEqual(b,a);
 assert.ok(a.state.gasReserve<75);
 const damaged=structuredClone(a);damaged.state.gasReserve=200;
 assert.throws(()=>replayMovement(actor(),damaged,[],flat),/Gaz invalide/);
 assert.throws(()=>replayMovement(actor(),start,[{tick:1,input:{...input,boostHeld:'yes'}}],flat),/Commande/);
});
test('only whitelisted existing food can refill gas',()=>{
 assert.equal(foodGasValue('food:apple'),25);
 assert.equal(foodGasValue('food:cherry'),12);
 assert.equal(foodGasValue('forage:mushroom'),0);
 assert.equal(foodGasValue('tool:axe'),0);
});
test('old save migrates with initial fuel and new fuel is validated',()=>{
 const old={schemaVersion:1,worldId:'w',worldBuildVersion:'b1',slotId:'slot-1',savedAt:1,time:0,position:{x:0,y:0,z:0},inventory:{},variables:{},objectives:{},entities:{},executed:{},cooldowns:{},dialogueFlags:{},pending:[]};
 assert.equal(parseGameSave(old).gasReserve,GAS.initial);
 assert.equal(parseGameSave({...old,schemaVersion:2,gasReserve:19}).gasReserve,19);
 assert.throws(()=>parseGameSave({...old,schemaVersion:2,gasReserve:101}),/gaz invalide/);
});
test('remote state accepts optional boost cue but rejects invalid sequence',()=>{
 const s={v:1,t:0,x:0,y:2,z:0,yaw:0,mode:'glide',speed:12,verticalSpeed:-1,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null,gasBoosting:true,gasPulseSeq:8};
 assert.equal(parsePresentationState(s).gasPulseSeq,8);
 assert.throws(()=>parsePresentationState({...s,gasPulseSeq:-1}),/Séquence de propulsion/);
});
