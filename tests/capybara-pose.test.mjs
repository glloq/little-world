import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPYBARA_STATES,initialCapybaraPose,advanceCapybaraPose} from '../src/capybara/capybara-pose.ts';

test('capybara visual states are stable and deterministic',()=>{
  assert.deepEqual(CAPYBARA_STATES,['idle','walk','follow','rest','sleep','wake']);
  let a=initialCapybaraPose(),b=initialCapybaraPose();
  for(let i=0;i<60;i++) {
    a=advanceCapybaraPose(a,{dt:1/60,speed:0,state:'sleep'});
    b=advanceCapybaraPose(b,{dt:1/60,speed:0,state:'sleep'});
  }
  assert.deepEqual(a,b);
  assert.ok(a.roll>1.0,'sleep rolls sideways');
  assert.ok(a.eyesClosed>.9,'eyes close for sleep');
  assert.ok(a.breathing<.03 && a.breathing>-.03);
});
test('wake returns towards upright and open eyes',()=>{
  let pose=initialCapybaraPose();
  for(let i=0;i<90;i++)pose=advanceCapybaraPose(pose,{dt:1/60,speed:0,state:'sleep'});
  for(let i=0;i<120;i++)pose=advanceCapybaraPose(pose,{dt:1/60,speed:0,state:'wake'});
  assert.ok(pose.roll<.01);
  assert.ok(pose.eyesClosed<.01);
});
test('tracking clamps yaw and pitch without modifying caller input',()=>{
  const input={dt:1/60,speed:0,state:'follow',lookYaw:99,lookPitch:-99};
  const pose=advanceCapybaraPose(initialCapybaraPose(),input);
  assert.ok(pose.headYaw>0 && pose.headYaw<.55);
  assert.ok(pose.headPitch<0 && pose.headPitch>-.24);
  assert.equal(input.lookYaw,99);
});
test('walking overrides side-lying intent, and invalid delta time is harmless',()=>{
  const p=advanceCapybaraPose(initialCapybaraPose(),{dt:1/60,speed:1,state:'sleep'});
  assert.equal(p.state,'walk');
  assert.equal(p.roll,0);
  const invalid=advanceCapybaraPose(initialCapybaraPose(),{dt:Infinity,speed:0,state:'sleep'});
  assert.equal(invalid.time,0);
  assert.equal(invalid.roll,0);
});
