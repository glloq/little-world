import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN,ROLL} from '../src/player.ts';

const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const actor=(x=0,z=0,y=0)=>({position:new THREE.Vector3(x,y,z),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false,body:{radius:.32,height:1.35,step:.4},climbCooldown:1e9});
const run=(p,q,s,k={})=>{for(let i=0;i<Math.round(s*30);i++)simulatePlayer(p,{...keys,...k},1/30,q);return p;};
const flat=()=>new WorldCollisionQuery(()=>0,()=>null);

test('ROLL — toggle enters the ball, accelerates progressively above running speed, toggle leaves it',()=>{
  const q=flat(),p=actor();simulatePlayer(p,{...keys,forward:1,rollPressed:true},1/30,q);assert.equal(p.mode,'roll');
  run(p,q,.5,{forward:1});const early=p.rollSpeed;run(p,q,2.5,{forward:1});
  assert.ok(early<p.rollSpeed,'progressive acceleration');assert.ok(p.rollSpeed>8.7&&p.rollSpeed<=ROLL.max+1e-9,'faster than running, capped: '+p.rollSpeed.toFixed(2));
  simulatePlayer(p,{...keys,forward:1,rollPressed:true},1/30,q);assert.equal(p.mode,'ground','second press leaves the roll');
});
test('ROLL — turns less sharply than walking, rolls on then stops by itself without getting stuck',()=>{
  const q=flat(),p=actor();simulatePlayer(p,{...keys,forward:1,rollPressed:true},1/30,q);run(p,q,2,{forward:1});
  const h0=p.rollHeading;run(p,q,.5,{right:1});const turned=Math.abs(p.rollHeading-h0);assert.ok(turned<=ROLL.turnRate*.5+1e-6&&turned>.5,'limited turn rate: '+turned.toFixed(2));
  const z=p.position.z;run(p,q,1,{});assert.equal(p.mode,'roll');assert.ok(p.position.z!==z,'rolls on without input');
  run(p,q,14,{});assert.equal(p.mode,'ground','stops and leaves the ball');
  run(p,q,1,{forward:1});assert.ok(Math.hypot(p.velocity.x,p.velocity.z)>3,'walks again right after the roll');
});
test('ROLL — slopes: downhill speeds up, uphill slows; obstacles slow down; jump keeps momentum; cliffs and water exit',()=>{
  const down=new WorldCollisionQuery((x,z)=>-z*.25,()=>null),up=new WorldCollisionQuery((x,z)=>z*.25,()=>null);
  const a=actor(0,0,0),b=actor(0,0,0);for(const [p,q]of [[a,down],[b,up]]){simulatePlayer(p,{...keys,forward:1,rollPressed:true},1/30,q);run(p,q,1.5,{});}
  assert.ok(a.rollSpeed>b.rollSpeed+1,'downhill '+a.rollSpeed.toFixed(2)+' > uphill '+(b.rollSpeed??0).toFixed(2));
  const q=flat();q.add({id:'wall',shape:'box',position:{x:0,y:0,z:6},size:{x:20,y:3,z:1},enabled:()=>true});
  const w=actor();simulatePlayer(w,{...keys,forward:1,rollPressed:true},1/30,q);run(w,q,2,{forward:1});assert.ok(w.position.z<5.6&&w.rollSpeed<3,'the wall stops the ball, no tunnelling: '+w.position.z.toFixed(2));
  const j=actor();simulatePlayer(j,{...keys,forward:1,rollPressed:true},1/30,flat());run(j,flat(),2,{forward:1});const sp=Math.hypot(j.velocity.x,j.velocity.z);
  simulatePlayer(j,{...keys,forward:1,jumpPressed:true},1/30,flat());assert.equal(j.mode,'air');assert.ok(j.velocity.y>0&&Math.hypot(j.velocity.x,j.velocity.z)>sp*.8,'jump keeps the momentum');
  const cliff=new WorldCollisionQuery((x,z)=>z>4?-20:0,()=>null),c=actor();simulatePlayer(c,{...keys,forward:1,rollPressed:true},1/30,cliff);run(c,cliff,1.5,{forward:1});assert.ok(c.mode==='air'||c.position.y<-1,'rolls off the cliff edge and falls');
  const lake=new WorldCollisionQuery((x,z)=>z>4?-3:0,(x,z)=>z>4?0:null),l=actor();simulatePlayer(l,{...keys,forward:1,rollPressed:true},1/30,lake);run(l,lake,3,{forward:1});assert.ok(l.mode==='swim','water ends the roll: '+l.mode);
});
test('ROLL — holding Shift while moving rolls fast, releasing it puts the hamster back on its paws',()=>{
  const q=flat(),p=actor();
  run(p,q,.5,{rollHeld:true});assert.equal(p.mode,'ground','Shift alone, standing still: no ball');
  run(p,q,1/30,{forward:1,rollHeld:true});assert.equal(p.mode,'roll','Shift + forward: ball');assert.equal(p.rollByHold,true);
  run(p,q,3,{forward:1,rollHeld:true});assert.ok(p.rollSpeed>8.7,'faster than running on foot: '+p.rollSpeed.toFixed(2));
  const z=p.position.z;run(p,q,1/30,{forward:1});assert.equal(p.mode,'ground','released: back on the paws');
  assert.ok(Math.hypot(p.velocity.x,p.velocity.z)>4&&p.position.z>z,'momentum kept when unrolling');
  // A jump from the held ball keeps momentum, and the ball comes back on landing while Shift is held.
  const j=actor();run(j,q,2,{forward:1,rollHeld:true});simulatePlayer(j,{...keys,forward:1,rollHeld:true,jumpPressed:true},1/30,q);assert.equal(j.mode,'air');
  run(j,q,2,{forward:1,rollHeld:true});assert.equal(j.mode,'roll','rolls again after landing');
  // The X toggle is not undone by releasing Shift.
  const t=actor();simulatePlayer(t,{...keys,forward:1,rollPressed:true},1/30,q);run(t,q,1,{forward:1});assert.equal(t.mode,'roll');assert.equal(t.rollByHold,false);
});
