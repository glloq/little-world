import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {simulatePlayer,spawnPlayer,SWIM} from '../src/player.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {captureMovement,replayMovement} from '../src/physics/movement-state.ts';
const zone={id:'surf:compat',minX:-250,maxX:250,minZ:-250,maxZ:250,dirX:0,dirZ:1,
 seaLevel:0,amplitude:1.5,wavelength:29,speed:6,seed:10,shoreFadeDepth:3,edgeFade:9,barrelStrength:1};
const q=()=>new WorldCollisionQuery(()=>-6,()=>0);
const wave=()=>createSurfWaveField(zone,()=>-6);
const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,
 dive:false,cameraYaw:0,cameraPitch:0,surfEnabled:false};
const actor=(mode,y)=>({position:new THREE.Vector3(0,y,0),velocity:new THREE.Vector3(),
 mode,oxygen:30,glideReady:false,stamina:30,climbCooldown:1000,body:{radius:.32,height:1.35,step:.4}});
function sample(a){return {mode:a.mode,pos:a.position.toArray(),vel:a.velocity.toArray(),
 diving:!!a.diving,oxygen:a.oxygen,glideReady:a.glideReady};}
function unchanged(mode,y,steps,extra={}){
 const c=q(),a=actor(mode,y),b=actor(mode,y),f=wave();
 for(let i=1;i<=steps;i++){
  const input={...keys,...extra,jumpPressed:i===2&&extra.jumpPressed===true};
  simulatePlayer(a,input,1/30,c,undefined,i);
  simulatePlayer(b,input,1/30,c,f,i);
  assert.deepEqual(sample(b),sample(a),'surf field must not perturb non-opt-in '+mode+' tick '+i);
 }
 return sample(a);
}
test('flat-water swimming remains byte-for-byte equivalent with an unselected surf field',()=>{
 const out=unchanged('swim',-SWIM.sink,100,{forward:1});
 assert.equal(out.mode,'swim');
});
test('diving controls and oxygen remain equivalent with surf field disabled',()=>{
 const out=unchanged('swim',-SWIM.sink,100,{forward:1,jumpPressed:true,cameraPitch:.6});
 assert.ok(['dive','swim'].includes(out.mode));
});
test('regular glide and snow fallback remain independent of surf fields',()=>{
 unchanged('air',7,70,{forward:1,run:true});
 unchanged('glide',9,90,{forward:1,run:true});
 unchanged('snow',2,35,{forward:1,snowEquipment:'skis'});
});
test('stowing or unequipping surfboard restores regular water behaviour on next tick',()=>{
 const c=q(),p=actor('surf',-.3),f=wave();
 p.surfStage='ride';p.surfHeading=0;
 simulatePlayer(p,{...keys,surfEnabled:false},1/30,c,f,1);
 assert.equal(p.mode,'swim');
 assert.equal(p.surfStage,undefined);
 assert.equal(p.surfAirborne,false);
});
test('surf fixed-tick snapshot replays deterministically when given the same wave and collision sources',()=>{
 const c=q(),f=wave(),p=spawnPlayer();
 p.position.set(0,.12,0);p.mode='surf';p.surfStage='paddle';p.surfHeading=0;
 const start=captureMovement(p,0),commands=[];
 for(let tick=1;tick<=80;tick++){
  const input={...keys,forward:1,surfEnabled:true};
  commands.push({tick,input});
  simulatePlayer(p,input,1/30,c,f,tick);
 }
 const expected=captureMovement(p,80),other=spawnPlayer();
 const got=replayMovement(other,start,commands,c,f);
 assert.deepEqual(got,expected);
});
