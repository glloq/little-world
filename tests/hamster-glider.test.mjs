import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBackpackGlider, GLIDER_MOTION} from '../src/hamster/backpack-glider.ts';
import {buildHamster} from '../src/hamster/hamster.ts';
import {parsePresentationState,interpolatePresentation} from '../src/hamster/presentation-state.ts';

const signal=(mode='ground',overrides={})=>({mode,speed:13,stalled:false,turnRate:0,pitch:0,brake:0,boosting:false,pulseSeq:0,...overrides});
const advance=(glider,input,seconds)=>{for(let i=0;i<Math.ceil(seconds*30);i++)glider.update(input,1/30);};
test('V glider: completely invisible when stowed, emerges from back socket, closes reversibly',()=>{
  const back=new THREE.Group(),g=createBackpackGlider(back);
  assert.equal(g.group.parent,back);
  assert.equal(g.group.visible,false);
  assert.equal(g.deployment,0);
  assert.equal(g.group.getObjectByName('GliderWings').children.length,2);
  g.update(signal('glide'),1/30);
  assert.equal(g.group.visible,true,'first airborne tick exposes the emerging assembly');
  assert.ok(g.deployment>0&&g.deployment<1);
  const opening=g.deployment;
  g.update(signal('air'),1/30);
  assert.ok(g.deployment<opening,'reversing midway preserves the current fraction');
  advance(g,signal('glide'),GLIDER_MOTION.openSeconds+.2);
  assert.equal(g.deployment,1);
  assert.ok(Math.abs(g.group.getObjectByName('GliderWingLeft').rotation.y)<.02);
  advance(g,signal('ground'),GLIDER_MOTION.closeSeconds+.2);
  assert.equal(g.deployment,0);
  assert.equal(g.group.visible,false,'nothing left visible on the back when stowed');
  g.dispose();assert.equal(g.group.parent,null);
});
test('V glider: stall, turn, boost and air brake are additive visual cues, not exclusive modes',()=>{
  const g=createBackpackGlider(new THREE.Group());
  advance(g,signal('glide'),.7);
  const l=g.group.getObjectByName('GliderWingLeft');
  const w=g.group.getObjectByName('GliderWings');
  const normal={leftY:l.rotation.y,roll:w.rotation.z,flap:l.rotation.x};
  advance(g,signal('glide',{brake:1}),.3);
  assert.ok(l.rotation.y<normal.leftY-.09,'braking partially folds wing without closing the glider');
  advance(g,signal('glide',{turnRate:1.2}),.3);
  assert.ok(Math.abs(w.rotation.z-normal.roll)>.02,'turn tilts the common wing assembly');
  advance(g,signal('glide',{stalled:true,speed:3}),.25);
  assert.ok(Math.abs(l.rotation.x-normal.flap)>.02,'stall visibly changes wing attitude');
  const before=w.rotation.x;
  g.update(signal('glide',{pulseSeq:1}),1/30);
  assert.ok(Math.abs(w.rotation.x-before)>.01,'boost impulse creates a short pitch kick');
  assert.equal(g.deployment,1,'visual cues never fold the main wing or change flight state');
  g.setStyle('unknown-paid-skin'); // must always fall back to free classic
  assert.equal(g.deployment,1);
  g.dispose();
});
test('HAMSTER runtime: old body membranes stay hidden even when GLIDE_OPEN is active',()=>{
  const h=buildHamster();
  const p={position:new THREE.Vector3(),velocity:new THREE.Vector3(0,-1,11),mode:'air',stalled:false,gasPulseSeq:0};
  assert.equal(h.group.getObjectByName('BackpackVGlider').visible,false);
  p.mode='glide';
  for(let i=0;i<20;i++)h.update(p,1/30,i/30);
  const g=h.group.getObjectByName('BackpackVGlider');
  assert.equal(g.visible,true);
  assert.equal(h.rig.joints.MembraneLeft.scale.x,0);
  assert.equal(h.rig.joints.MembraneRight.scale.x,0);
  assert.equal(h.rig.accessories.backpack.visible,true,'functional pack visible while gliding');
  p.mode='ground';
  for(let i=0;i<15;i++)h.update(p,1/30,(20+i)/30);
  assert.equal(g.visible,false,'glider hidden after landing and folding');
  h.dispose();
});
test('Flight presentation cues are optional and backwards-compatible',()=>{
  const base={v:1,t:1,x:0,y:0,z:0,yaw:0,mode:'ground',speed:0,verticalSpeed:0,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null};
  assert.deepEqual(parsePresentationState(base),base);
  const a={...base,mode:'glide',glideStalled:false,glideBrake:0,glidePitch:.2,glideTurnRate:0};
  const b={...a,t:2,glideStalled:true,glideBrake:1,glidePitch:-.3,glideTurnRate:1};
  const mid=interpolatePresentation(parsePresentationState(a),parsePresentationState(b),1.5);
  assert.equal(mid.glideBrake,.5);
  assert.ok(Math.abs(mid.glidePitch+.05)<1e-9);
  assert.equal(mid.glideStalled,true);
  for(const invalid of [{glideBrake:-1},{glideBrake:2},{glidePitch:NaN},{glideTurnRate:9},{glideStalled:1}])
    assert.throws(()=>parsePresentationState({...a,...invalid}));
});
