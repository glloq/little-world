import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRace,beginRace,gateCrossing,validateRace} from '../src/gameplay/races.ts';
import {DEMO_RACES,makeDemoRace} from '../src/gameplay/race-demos.ts';
const gate=(id,z,shape='circle')=>({id,center:{x:0,y:0,z},normal:{x:0,y:0,z:1},shape,width:6,height:6});
const def=(kind='flight')=>({id:'test',version:1,name:'Circuit test',worldId:'island',layoutKey:'fixed-1',kind,classification:'practice',maxTicks:300,gates:[gate('a',10),gate('b',20)]});
const at=(z,x=0,y=0)=>({x,y,z});
const step=(session,from,to,mode='glide',props={})=>advanceRace(session,{tick:session.lastTick+1,previous:from,position:to,mode,pulseSeq:0,...props});
test('segment crosses the oriented plane even when no sample is inside the ring',()=>{
 assert.equal(gateCrossing(gate('a',10),at(9),at(11)),.5);
 assert.equal(gateCrossing(gate('a',10),at(11),at(9)),null,'wrong direction');
 assert.equal(gateCrossing(gate('a',10),at(9,4),at(11,4)),null,'missed the opening');
 assert.equal(gateCrossing({...gate('b',10),shape:'rectangle'},at(9,2),at(11,2)),.5);
});
test('ordered checkpoint progress and sub-tick finish time',()=>{
 const s=beginRace(def(),100);
 assert.equal(step(s,at(19),at(21)),null,'cannot skip first gate');
 assert.deepEqual(step(s,at(9),at(11)),{kind:'checkpoint',gateIndex:0});
 assert.equal(step(s,at(19),at(21)).kind,'finish');
 assert.equal(s.status,'finished');
 assert.ok(Math.abs(s.finishSeconds-2.5/30)<1e-8);
 assert.equal(step(s,at(19),at(21)),null);
});
test('race rejects wrong mode, teleports and nonconsecutive ticks',()=>{
 const a=beginRace(def(),0);
 assert.equal(step(a,at(0),at(1),'roll').kind,'failed');
 const b=beginRace(def('mixed'),0);
 assert.equal(step(b,at(0),at(22),'roll').kind,'failed');
 const c=beginRace(def(),0);
 assert.throws(()=>advanceRace(c,{tick:2,previous:at(0),position:at(1),mode:'glide',pulseSeq:0}),/Tick/);
});
test('track validation rejects invalid normal, out of bounds and duplicate gates',()=>{
 assert.throws(()=>validateRace({...def(),gates:[{...gate('a',10),normal:{x:0,y:0,z:5}},gate('b',20)]}),/Checkpoint/);
 assert.throws(()=>validateRace(def(),{minX:-2,maxX:2,minZ:-2,maxZ:15}),/hors/);
 assert.throws(()=>validateRace({...def(),gates:[gate('a',10),gate('a',20)]}),/Checkpoint/);
});
test('demo circuits keep stable layouts and avoid edges',()=>{
 const bounds={minX:-2000,maxX:2000,minZ:-1500,maxZ:1500},p=at(0,0,70);
 for(const d of DEMO_RACES){
  const a=makeDemoRace(d.id,p,0,()=>0,bounds,'island'),
    b=makeDemoRace(d.id,{...p,x:1},.01,()=>0,bounds,'island');
  assert.ok(a);assert.equal(a.gates.length,5);assert.equal(a.layoutKey,b.layoutKey);
 }
 assert.equal(makeDemoRace('flight',at(1490,0,50),0,()=>0,bounds,'island'),null);
});
test('a rolling course accepts an airborne jump, but not gliding',()=>{
 const s=beginRace(def('roll'),0);
 assert.equal(step(s,at(9),at(11),'air').kind,'checkpoint');
 assert.equal(step(s,at(19),at(21),'glide').kind,'failed');
});
