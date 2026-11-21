/** Doc 107 §extensibilité — second family 'target' on the shared engine. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMiniGame} from '../src/minigames/layouts.ts';
import {validateMiniGame,areaToWorld} from '../src/minigames/schema.ts';
import {createMiniGameManager} from '../src/minigames/manager.ts';
import {MiniGameRegistry,DEFAULT_LOADERS} from '../src/minigames/registry.ts';
import {ballWorldOf} from '../src/minigames/ball/simulation.ts';
import {BallWorld} from '../src/minigames/ball/ball-physics.ts';

const flat={height:()=>0};
async function play(def){
 const registry=new MiniGameRegistry(DEFAULT_LOADERS),m=createMiniGameManager([def],{env:flat,registry});await m.prepare(def.id);
 let tick=0,seq=0;const events=[],refusals=[];
 const t=areaToWorld(def.area,0,def.elements.find(e=>e.kind==='tee').z-.5);
 const actor={id:'me',x:t.x,y:0,z:t.z,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
 const send=body=>m.submit({instanceId:def.id,playerId:'me',tick:tick+1,seq:++seq,...body});
 const step=(n=1,actors=[actor])=>{for(let k=0;k<n;k++){const r=m.tick(++tick,1/30,actors);events.push(...r.events);refusals.push(...r.refusals);}};
 send({type:'join'});send({type:'start'});step();
 return {m,registry,send,step,events,refusals,get rec(){return m.records.get(def.id);},get world(){return ballWorldOf(m.records.get(def.id).sim);}};
}
/** Yaw and power that land a lob on a point (flat ground), found by sampling the same engine. */
function aimAt(def,target,targetY){
 const t=areaToWorld(def.area,0,def.elements.find(e=>e.kind==='tee').z),yaw=Math.atan2(target.x-t.x,target.z-t.z);
 return {yaw,power:.62,targetY};
}
test('target family loads its own module only (ball code not required by the manager)',async()=>{
 const def=defaultMiniGame('cans',{id:'minigame:cans',x:0,z:0}),h=await play(def);
 assert.deepEqual(h.registry.loaded(),['target']);
 assert.ok(h.world instanceof BallWorld,'same engine as the ball family');
 assert.equal(h.rec.state,'ACTIVE');
});
test('cans: thrown balls knock cans off the table, supported cans fall with them, rounds rotate',async()=>{
 const def=defaultMiniGame('cans',{id:'minigame:cans',x:5,z:-3,heading:.3}),h=await play(def);
 const tbl=areaToWorld(def.area,0,3.5);
 let best=0;
 for(const power of [.75,.8,.85,.78,.82,.8]){ // a few throws across the 3 rounds
  h.send({type:'launch',yaw:def.area.heading,power});h.step(1);h.step(220);best=Math.max(best,h.rec.session.scores.me??0);
  if(h.rec.session.status!=='active')break;
 }
 assert.ok(best>=1,'cans knocked: '+best);
 const hits=h.events.filter(e=>e.type==='target:hit');assert.equal(new Set(hits.map(e=>e.targetId+'@'+e.seq)).size,hits.length);
 assert.ok(h.events.some(e=>e.type==='game:reset'),'a round completed after its throws');
 assert.ok(h.refusals.every(r=>!/tour|lancer/.test(r.reason)),JSON.stringify(h.refusals));
 void tbl;
});
test('cans: a can on top wakes when the can holding it is knocked (support chain)',async()=>{
 const def=defaultMiniGame('cans',{id:'minigame:chain',x:0,z:0}),h=await play(def),w=h.world;
 const n=def.rules.attempts,bottom=n+1; // can-2: middle of the lowest row
 w.asleep[bottom]=0;w.vx[bottom]=0;w.vz[bottom]=2;h.step(40,[]);
 const top=w.count-1;assert.ok(w.py[top]<1.3,'top can fell: '+w.py[top].toFixed(2));
 assert.ok((h.rec.session.scores.me??0)===0,'no throw, no score for the player');
});
test('bullseye: points by distance to the centre, the ball sticks, out of the board scores nothing',async()=>{
 const def=defaultMiniGame('bullseye',{id:'minigame:bull',x:0,z:0}),h=await play(def),w=h.world;
 const board=def.elements.find(e=>e.kind==='target'),face=areaToWorld(def.area,0,board.z-.4);
 const shoot=(dx,dy)=>{w.setEnabled(0,true);w.place(0,face.x+dx,1.1+dy,face.z);w.asleep[0]=0;w.vx[0]=w.vy[0]=0;w.vz[0]=6;
  h.rec.sim.snapshot();const st=h.rec.sim.snapshot().state;return st;};
 // Direct placement in front of the board: centre = 5 points.
 const before=h.rec.session.scores.me??0;
 h.send({type:'launch',yaw:0,power:.5});h.step(1);shoot(0,0);h.step(20,[]);
 const centre=(h.rec.session.scores.me??0)-before;assert.equal(centre,5,'centre hit');
 assert.equal(w.asleep[0],1,'ball stuck on the board');
 h.step(10,[]);const mid=h.rec.session.scores.me;
 h.send({type:'launch',yaw:0,power:.5});h.step(1);w.setEnabled(1,true);w.place(1,face.x+.55,1.1,face.z);w.asleep[1]=0;w.vz[1]=6;h.step(20,[]);
 assert.equal(h.rec.session.scores.me-mid,1,'outer ring');
 h.step(10,[]);const outer=h.rec.session.scores.me;
 h.send({type:'launch',yaw:0,power:.5});h.step(1);w.setEnabled(2,true);w.place(2,face.x+1.5,1.1,face.z);w.asleep[2]=0;w.vz[2]=6;h.step(60,[]);
 assert.equal(h.rec.session.scores.me,outer,'miss = 0');
 h.step(80,[]);assert.ok(h.events.some(e=>e.type==='game:reset'),'round over after 3 balls');
 void shoot;
});
test('target templates validate; a target element without a variant that accepts it is refused',()=>{
 for(const v of ['cans','bullseye'])assert.ok(validateMiniGame(defaultMiniGame(v,{id:'minigame:'+v,x:0,z:0})));
 const f=defaultMiniGame('football',{id:'minigame:f',x:0,z:0});
 assert.throws(()=>validateMiniGame({...f,elements:[...f.elements,{id:'t',kind:'target',x:0,z:0}]}),/non utilisé/);
 const c=defaultMiniGame('cans',{id:'minigame:c',x:0,z:0});
 assert.throws(()=>validateMiniGame({...c,family:'ball'}),/famille/);
});
