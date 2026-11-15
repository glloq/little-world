import test from 'node:test';
import assert from 'node:assert/strict';
import {linePattern,areaPattern} from '../src/studio-core/placement-patterns.ts';
const near=(a,b)=>Math.abs(a-b)<1e-6;
test('linear placement keeps regular distance across polyline corners',()=>{
  const p=linePattern([{x:0,z:0},{x:10,z:0},{x:10,z:10}],5);
  assert.equal(p.length,5);
  assert.deepEqual(p.map(({x,z})=>[x,z]),[[0,0],[5,0],[10,0],[10,5],[10,10]]);
  assert.ok(near(p.at(-1).yaw,Math.PI/2));
});
test('linear placement validates length, spacing and limit',()=>{
  assert.throws(()=>linePattern([{x:0,z:0},{x:0,z:0}],3));
  assert.throws(()=>linePattern([{x:0,z:0},{x:2000,z:0}],1));
  assert.throws(()=>linePattern([{x:0,z:0},{x:1,z:0}],0));
});
test('area fill is deterministic, polygon-clipped and bounded',()=>{
  const polygon=[{x:0,z:0},{x:11,z:0},{x:11,z:11},{x:0,z:11}];
  const a=areaPattern(polygon,5),b=areaPattern(polygon,5);
  assert.deepEqual(a,b);assert.equal(a.length,9);
  assert.ok(a.every(p=>p.x>=0&&p.x<=11&&p.z>=0&&p.z<=11));
  assert.throws(()=>areaPattern(polygon,.2));
  assert.throws(()=>areaPattern([{x:0,z:0},{x:500,z:0},{x:500,z:500},{x:0,z:500}],2));
});
test('pattern algorithms handle repeated intermediate vertices',()=>{
  const line=linePattern([{x:0,z:0},{x:10,z:0},{x:10,z:0},{x:10,z:10}],5);
  assert.equal(line.length,5);
  assert.ok(line.every(p=>Number.isFinite(p.yaw)));
});
