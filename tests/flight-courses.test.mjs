import test from 'node:test';
import assert from 'node:assert/strict';
import {beginFlightCourse,stepFlightCourse,FLIGHT_COURSES} from '../src/gameplay/flight-courses.ts';
const start={x:0,y:100,z:0},prev={...start},velocity={x:0,y:0,z:20};
const update=(session,position,vel=velocity,dt=1/30)=>stepFlightCourse(session,{position,previous:prev,velocity:vel,mode:'glide',pulseSeq:0,dt});
test('all three solo trials can be started without world/network dependencies',()=>{
 for(const id of FLIGHT_COURSES)assert.ok(beginFlightCourse(id,start,0,()=>0));
 assert.equal(beginFlightCourse('rings',start,0,()=>0,{minX:-100,maxX:100,minZ:-100,maxZ:100}),null);
});
test('five rings are crossed once in their defined order and complete',()=>{
 const session=beginFlightCourse('rings',start,0,()=>0);
 assert.equal(session.rings.length,5);
 assert.equal(update(session,session.rings[1]),0,'cannot skip ring 1');
 for(let i=0;i<5;i++){
  assert.equal(update(session,session.rings[i]),i===4?2:1);
  assert.equal(session.nextRing,i+1);
 }
 assert.equal(session.status,'success');
 assert.equal(update(session,session.rings[4]),0,'completed trial does not award twice');
});
test('dive trial needs high speed followed by 22m gain',()=>{
 const session=beginFlightCourse('dive',start,0,()=>0);
 assert.equal(update(session,{x:0,y:70,z:10},{x:0,y:-30,z:20}),0,'must reach minimum dive speed first');
 assert.equal(update(session,{x:0,y:60,z:20},{x:0,y:-45,z:30}),0);
 assert.equal(update(session,{x:0,y:84,z:30},{x:0,y:10,z:50}),2);
 assert.equal(session.status,'success');
});
test('economy trial awards only three allowed pulses and 450m distance',()=>{
 const session=beginFlightCourse('economy',start,0,()=>0);
 let result=0;
 for(let i=1;i<=60;i++){
  result=stepFlightCourse(session,{previous:{x:0,y:100,z:(i-1)*8},position:{x:0,y:100,z:i*8},velocity:{x:0,y:0,z:40},mode:'glide',pulseSeq:i===12?1:i>=40?2:0,dt:1/30});
  if(result===2)break;
 }
 assert.equal(result,2);assert.ok(session.usedPulses<=3);
 const fail=beginFlightCourse('economy',start,0,()=>0);
 assert.equal(stepFlightCourse(fail,{position:start,previous:start,velocity,mode:'glide',pulseSeq:4,dt:1/30}),-1);
 assert.equal(fail.status,'failed');
});
test('all courses abort when glider folds or 60s time limit elapses',()=>{
 const a=beginFlightCourse('dive',start,0,()=>0);
 assert.equal(stepFlightCourse(a,{position:start,previous:start,velocity,mode:'air',pulseSeq:0,dt:1/30}),-1);
 const b=beginFlightCourse('dive',start,0,()=>0);
 assert.equal(stepFlightCourse(b,{position:start,previous:start,velocity,mode:'glide',pulseSeq:0,dt:60.1}),-1);
});
