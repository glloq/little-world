import test from 'node:test';
import assert from 'node:assert/strict';
import {residentRoute} from '../src/npc-life/schedule.ts';
import {residentRouteClearance,residentRouteAheadClear,residentRouteStepClear,residentRoutineStepClear,residentRecoveryNeedsRetarget,residentRecoverySpeed} from '../src/npc-life/dynamic-route.ts';

test('scripted NPC route lookahead samples active geometry instead of trusting old paths',()=>{
 const route=residentRoute([{x:0,z:0},{x:10,z:0}]);
 const safe=()=>true;
 assert.equal(residentRouteAheadClear(route,0,safe,3),true);
 const barrier=(x)=>x<3;
 assert.equal(residentRouteAheadClear(route,0,barrier,2),true);
 assert.equal(residentRouteAheadClear(route,0,barrier,3.5),false);
 assert.equal(residentRouteAheadClear(route,5,barrier,3),false);
 assert.equal(residentRouteAheadClear(route,10,barrier,3),true);
});
test('scripted NPC lookahead is bounded and rejects invalid inputs',()=>{
 const route=residentRoute([{x:0,z:0},{x:100,z:0}]);
 let calls=0;
 assert.equal(residentRouteAheadClear(route,0,()=>{calls++;return true;},10000),true);
 assert.ok(calls<=24,'At most 12 m of lookahead with 0.5 m checks');
 assert.equal(residentRouteAheadClear(route,NaN,()=>true),false);
 assert.equal(residentRouteAheadClear(route,0,()=>true,0),false);
});

test('actual movement interval cannot leap across a newly blocked section',()=>{
 const route=residentRoute([{x:0,z:0},{x:10,z:0}]);
 const barrier=(x)=>x<3||x>4;
 assert.equal(residentRouteStepClear(route,0,2,barrier),true);
 assert.equal(residentRouteStepClear(route,0,5,barrier),false);
 assert.equal(residentRouteStepClear(route,5,6,barrier),true);
 assert.equal(residentRouteStepClear(route,0,13,()=>true),false);
 assert.equal(residentRouteStepClear(route,7,5,()=>true),false);
});
test('movement interval is strictly capped after long inactive browser frames',()=>{
 const route=residentRoute([{x:0,z:0},{x:100,z:0}]);
 assert.equal(residentRouteStepClear(route,0,13,()=>true),false);
 assert.equal(residentRouteStepClear(route,0,12,()=>true),true);
 assert.equal(residentRouteStepClear(route,0,12,()=>true,NaN),false);
});

test('lookahead follows both sides of a sharp corner without cutting diagonally',()=>{
 const route=residentRoute([{x:0,z:0},{x:2,z:0},{x:2,z:4}]);
 const onlyOrthogonal=(x,z,px,pz)=>Math.abs(x-px)<1e-6||Math.abs(z-pz)<1e-6;
 assert.equal(residentRouteAheadClear(route,1.5,onlyOrthogonal,2),true);
 assert.equal(residentRouteStepClear(route,1.5,3.5,onlyOrthogonal),true);
});
test('caller cannot bypass the physical 12m sampling limit',()=>{
 const route=residentRoute([{x:0,z:0},{x:30,z:0}]);
 assert.equal(residentRouteStepClear(route,0,13,()=>true,50),false);
});

test('near-camera daily routines reject teleports and changed walls',()=>{
 const from={x:0,z:0};
 assert.equal(residentRoutineStepClear(from,{x:.1,z:0},()=>true,.25),true);
 assert.equal(residentRoutineStepClear(from,{x:5,z:0},()=>true,.25),false);
 assert.equal(residentRoutineStepClear(from,{x:.2,z:0},(x)=>x<.15,.25),false);
 assert.equal(residentRoutineStepClear(from,{x:.2,z:0},()=>true,Infinity),false);
 assert.equal(residentRoutineStepClear(from,{x:NaN,z:0},()=>true,.25),false);
});
test('near-camera daily routine cannot bypass physical cap with author parameters',()=>{
 assert.equal(residentRoutineStepClear({x:0,z:0},{x:3.1,z:0},()=>true,50),false);
 assert.equal(residentRoutineStepClear({x:0,z:0},{x:2,z:0},()=>true,50),true);
});

test('daily recovery retargets only after cadence when the scheduled goal moves',()=>{
 const a={x:0,z:0},near={x:1,z:0},far={x:10,z:0};
 assert.equal(residentRecoveryNeedsRetarget(a,far,5,4),false);
 assert.equal(residentRecoveryNeedsRetarget(a,far,6,4),true);
 assert.equal(residentRecoveryNeedsRetarget(a,near,6,4),false);
 assert.equal(residentRecoveryNeedsRetarget(a,far,2,4),true,'clock rewind');
 assert.equal(residentRecoveryNeedsRetarget(a,far,6,4,2,NaN),false);
 assert.equal(residentRecoveryNeedsRetarget(a,{x:NaN,z:0},6,4),false);
});

test('catch-up speed is faster than the schedule but bounded',()=>{
 assert.equal(residentRecoverySpeed(1),1.35);
 assert.equal(residentRecoverySpeed(2.5),3);
 assert.equal(residentRecoverySpeed(0),.27);
 assert.equal(residentRecoverySpeed(NaN),.27);
});

test('F01 clearance returns the last certified metre before a new obstruction',()=>{
 const route=residentRoute([{x:0,z:0},{x:10,z:0}]);
 const result=residentRouteClearance(route,0,(x)=>x<3,6);
 assert.deepEqual(result,{clear:false,safeDistance:2.5});
 assert.equal(residentRouteAheadClear(route,0,(x)=>x<3,6),false);
 assert.deepEqual(residentRouteClearance(route,4,()=>true,3),{clear:true,safeDistance:7});
});

test('F01 clearance never skips a sharp corner or accepts an invalid route',()=>{
 const route=residentRoute([{x:0,z:0},{x:2,z:0},{x:2,z:4}]);
 const pathOnly=(x,z,px,pz)=>Math.abs(x-px)<1e-6||Math.abs(z-pz)<1e-6;
 assert.deepEqual(residentRouteClearance(route,1.5,pathOnly,2),
   {clear:true,safeDistance:3.5});
 const blocked=(x,z)=>!(z>=1);
 assert.deepEqual(residentRouteClearance(route,1.5,blocked,3),
   {clear:false,safeDistance:2.5});
 assert.equal(residentRouteClearance(route,route.length+1,()=>true).clear,false);
 assert.equal(residentRouteClearance(route,-1,()=>true).clear,false);
 const bad={...route,distances:[0,2,Infinity]};
 assert.equal(residentRouteClearance(bad,1,()=>true).clear,false);
});

test('F01 clearance obeys bounded work even for very long routes',()=>{
 const route=residentRoute([{x:0,z:0},{x:1000,z:0}]);
 let probes=0;
 const result=residentRouteClearance(route,0,()=>{probes++;return true;},500);
 assert.deepEqual(result,{clear:true,safeDistance:12});
 assert.ok(probes<=24);
});
