import test from 'node:test';
import assert from 'node:assert/strict';
import {planPortN1,portActorPresence} from '../src/archipelago/port-n1-plan.ts';

const height=(x,z)=>z<0?.9:-2.7;
const depth=(x,z)=>Math.max(0,-height(x,z));
const survey={origin:{x:0,z:-6},width:120,length:130,seaLevel:0,height,depth};

test('port N1: deterministic dry and walkable shore beside actual water',()=>{
  const p=planPortN1(survey);
  assert.ok(p,'a flat coastal site must produce one compact port');
  assert.deepEqual(planPortN1(survey),p,'identical island inputs must yield identical placement');
  assert.ok(p.stand.y>0&&depth(p.stand.x,p.stand.z)===0);
  assert.ok(depth(p.boat.x,p.boat.z)>1.3);
  assert.equal(p.boarding.y,p.dockBaseY+1,'boarding is on the real dock deck');
  assert.ok(Math.hypot(p.boat.x-p.boarding.x,p.boat.z-p.boarding.z)<5,
    'boat must be within boarding reach of the dock tip');
  assert.equal(p.rower.y,p.boarding.y);
  assert.ok(Math.hypot(p.stand.x-p.rower.x,p.stand.z-p.rower.z)>5);
  assert.ok(Math.hypot(p.trade.x-p.boarding.x,p.trade.z-p.boarding.z)>4);
});

test('port N1: refuse a world with no sea approach',()=>{
  assert.equal(planPortN1({...survey,depth:()=>0}),null);
  assert.equal(planPortN1({...survey,width:20}),null);
});

test('port N1: refuse steep and flooded merchant platforms',()=>{
  const underwater=()=>-2;
  assert.equal(planPortN1({...survey,height:underwater,depth:()=>2}),null);
});

test('merchant and rower: one ferry clock, different level policies',()=>{
  assert.deepEqual(portActorPresence(1,false),{rower:false,merchant:false});
  assert.deepEqual(portActorPresence(1,true),{rower:true,merchant:true});
  assert.deepEqual(portActorPresence(2,false),{rower:false,merchant:true});
  assert.deepEqual(portActorPresence(3,false),{rower:false,merchant:true});
  assert.deepEqual(portActorPresence(3,true),{rower:true,merchant:true});
});
