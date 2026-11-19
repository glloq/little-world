import test from 'node:test';
import assert from 'node:assert/strict';
import {residentRoute} from '../src/npc-life/schedule.ts';
import {residentRouteAheadClear,residentRouteStepClear} from '../src/npc-life/dynamic-route.ts';

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
