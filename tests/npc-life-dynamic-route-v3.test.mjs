import test from 'node:test';
import assert from 'node:assert/strict';
import {residentRoute} from '../src/npc-life/schedule.ts';
import {residentRouteAheadClear} from '../src/npc-life/dynamic-route.ts';

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
