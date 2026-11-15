import test from 'node:test';
import assert from 'node:assert/strict';
import {wallModules,bridgePlan} from '../src/studio-core/modular-construction.ts';
test('muret modulaire : centres et écarts calculés depuis la dimension X du GLB',()=>{
  const parts=wallModules([{x:0,z:0},{x:8,z:0}],2);
  assert.equal(parts.length,4);
  assert.deepEqual(parts.map(p=>p.x),[1,3,5,7]);
  assert.ok(parts.every(p=>p.yaw===0&&p.scaleX===1&&p.lift===0));
});
test('muret courbe : nombre plafonné et transformations finies',()=>{
  const parts=wallModules([{x:0,z:0},{x:6,z:0},{x:6,z:6}],2);
  assert.ok(parts.every(p=>Object.values(p).every(Number.isFinite)));
  assert.throws(()=>wallModules([{x:0,z:0},{x:2000,z:0}],2));
});
test('pont entre deux rives : longueur, rotation et hauteur au-dessus de eau',()=>{
  const plan=bridgePlan({x:0,z:0},{x:8,z:0},8.3,(x,z)=>x===0||x===8?4:0,
    (x,z)=>x>1&&x<7?2:0,1);
  assert.ok(Math.abs(plan.pose.scaleX-8/8.3)<1e-6);
  assert.equal(plan.pose.x,4);assert.equal(plan.pose.z,0);
  assert.equal(plan.pose.lift,5);
  assert.equal(plan.warnings.length,0);
});
test('pont : refuse sans eau, trop long ou rives incompatibles',()=>{
  const height=()=>0,water=()=>0;
  assert.throws(()=>bridgePlan({x:0,z:0},{x:8,z:0},8,height,water));
  assert.throws(()=>bridgePlan({x:0,z:0},{x:40,z:0},8,height,()=>2));
  assert.throws(()=>bridgePlan({x:0,z:0},{x:8,z:0},8,x=>x===0?0:9,()=>2));
});
