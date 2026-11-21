import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMiniGame} from '../src/minigames/layouts.ts';
import {validateMiniGame,areaToWorld} from '../src/minigames/schema.ts';
import {createMiniGameManager} from '../src/minigames/manager.ts';
import {ballWorldOf} from '../src/minigames/ball/simulation.ts';

const flat={height:()=>0};
function harness(def,env=flat){
 const m=createMiniGameManager([def],{env});let tick=0,seq=0;const events=[],refusals=[];
 const actor={id:'me',x:0,y:0,z:0,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
 const send=(body,playerId='me')=>m.submit({instanceId:def.id,playerId,tick:tick+1,seq:++seq,...body});
 const step=(n=1,actors=[actor])=>{for(let k=0;k<n;k++){const r=m.tick(++tick,1/30,actors);events.push(...r.events);refusals.push(...r.refusals);}};
 const at=(x,z)=>{const p=areaToWorld(def.area,x,z);actor.x=p.x;actor.z=p.z;};
 return {m,actor,send,step,at,events,refusals,get rec(){return m.records.get(def.id);},get world(){return ballWorldOf(m.records.get(def.id).sim);}};
}
const types=(events,t)=>events.filter(e=>e.type===t);

test('football: kicks score for the attacking team, the ball resets, the match ends at the target score',async()=>{
 const def=defaultMiniGame('football',{id:'minigame:foot',x:30,z:-10,heading:.4});
 const h=harness(def);await h.m.prepare(def.id);
 h.send({type:'join',teamId:'blue'});h.send({type:'start'});h.step();
 for(let goal=1;goal<=3;goal++){
  h.at(0,-.9);h.step(2);
  h.send({type:'launch',yaw:def.area.heading,power:1});h.step(1);h.step(90,[]);
  assert.equal(types(h.events,'target:hit').length,goal,'goal '+goal);
 }
 assert.equal(h.rec.session.scores.blue,3);
 const finish=types(h.events,'game:finish')[0];assert.deepEqual(finish.winners,['blue']);assert.equal(finish.reason,'score');
 assert.equal(h.rec.state,'READY','back to READY after the match');
 const before=h.m.tick(10000,1/30,[]).stepped;assert.equal(before,0);
});
test('football: walking into the ball pushes it (contact) and reports the toucher; out of bounds resets it inside',async()=>{
 const def=defaultMiniGame('football',{id:'minigame:push',x:0,z:0});
 const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start'});h.step();
 h.actor.z=-1.2;h.actor.vz=4;for(let k=0;k<8;k++){h.actor.z+=4/30;h.step();}
 assert.ok(h.world.vz[0]>1,'pushed forward');assert.equal(types(h.events,'ball:hit')[0].playerId,'me');
 h.world.px[0]=def.area.halfWidth+5;h.world.asleep[0]=0;h.step();
 assert.equal(types(h.events,'ball:out').length,1);assert.ok(Math.abs(h.world.px[0])<def.area.halfWidth);
});
test('bowling: a throw knocks pins, fallen pins are cleared, frames rotate and the game ends after the rounds',async()=>{
 const def=defaultMiniGame('bowling',{id:'minigame:bowl',x:0,z:0});
 const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start'});h.step();
 h.at(0,-8.2);h.send({type:'launch',yaw:0,power:1});h.step(260);
 const hit=types(h.events,'target:hit').length;assert.ok(hit>=3,'pins knocked: '+hit);
 assert.equal(h.rec.session.scores.me,hit,'score = pins down');
 h.send({type:'launch',yaw:0,power:1});h.step(1);
 assert.equal(h.refusals.length,0,'aim phase restored after the roll: second throw accepted');
 h.send({type:'launch',yaw:0,power:1});h.step(1);assert.match(h.refusals.at(-1).reason,/fin du lancer/,'no throw while rolling');
 for(let k=0;k<8&&h.rec.session.status==='active';k++){h.step(260);h.send({type:'launch',yaw:.05,power:.8});h.step(1);}
 h.step(300);
 assert.equal(h.rec.session.status,'finished');assert.equal(types(h.events,'game:finish')[0].reason,'rounds');
 assert.equal(h.rec.session.round,3);
});
test('bowling: turn order and lane aim are enforced by the authority, not the client',async()=>{
 const def=defaultMiniGame('bowling',{id:'minigame:turns',x:0,z:0});
 const h=harness(def);await h.m.prepare(def.id);
 h.send({type:'join'});h.send({type:'join'},'other');h.send({type:'start'});h.step();
 const other={...h.actor,id:'other'};h.at(0,-8.2);other.x=h.actor.x;other.z=h.actor.z;
 h.send({type:'launch',yaw:0,power:1},'other');h.step(1,[h.actor,other]);
 assert.match(h.refusals.at(-1).reason,/Au tour de me/);
 h.send({type:'launch',yaw:2,power:1});h.step(1,[h.actor,other]);
 assert.ok(Math.abs(Math.atan2(h.world.vx[0],h.world.vz[0]))<=.3+1e-9,'aim clamped to the lane');
});
test('mini-golf: strokes are counted, the hole finishes the course, out-of-bounds costs a stroke',async()=>{
 const base=defaultMiniGame('minigolf',{id:'minigame:golf',x:0,z:0});
 const def=validateMiniGame({...base,elements:base.elements.filter(e=>e.kind!=='obstacle')});
 const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start'});h.step();
 const w=h.world,hole=areaToWorld(def.area,.6,7);
 const aim=()=>Math.atan2(hole.x-w.px[0],hole.z-w.pz[0]);
 h.actor.x=w.px[0];h.actor.z=w.pz[0]-.7;
 h.send({type:'launch',yaw:aim(),power:.767});h.step(1);h.step(240,[]);
 for(let k=0;k<6&&!h.rec.session.finished.includes('me');k++){
  const d=Math.hypot(hole.x-w.px[0],hole.z-w.pz[0]),v=Math.sqrt(2*1.548*d+4);
  h.actor.x=w.px[0]-Math.sin(aim())*.7;h.actor.z=w.pz[0]-Math.cos(aim())*.7;
  h.send({type:'launch',yaw:aim(),power:Math.min(1,(v-.4)/8.6)});h.step(240,[h.actor]);
 }
 assert.ok(h.rec.session.finished.includes('me'),'holed');
 const strokes=h.rec.session.scores.me;assert.ok(strokes>=1&&strokes<=3,'strokes '+strokes);
 assert.equal(h.rec.session.status,'finished');assert.deepEqual(types(h.events,'game:finish')[0].winners,['me']);
 // Water across the course: the ball comes back with a penalty.
 const wet=harness({...def,id:'minigame:wet'},{height:()=>0,water:(x,z)=>z>0?2:null});await wet.m.prepare('minigame:wet');
 wet.send({type:'join'});wet.send({type:'start'});wet.step();
 const ww=wet.world;wet.actor.x=ww.px[0];wet.actor.z=ww.pz[0]-.7;
 wet.send({type:'launch',yaw:0,power:1});wet.step(1);wet.step(120,[]);
 assert.equal(types(wet.events,'ball:out').length,1);assert.equal(wet.rec.session.scores.me,2,'stroke + penalty');assert.ok(ww.pz[0]<0,'back to last rest');
});
test('three variants, one engine: same BallWorld class and session contract; instances do not interfere',async()=>{
 const defs=['football','bowling','minigolf'].map((v,k)=>defaultMiniGame(v,{id:'minigame:'+v,x:k*40,z:0}));
 const m=createMiniGameManager(defs,{env:flat});for(const d of defs)await m.prepare(d.id);
 const worlds=defs.map(d=>ballWorldOf(m.records.get(d.id).sim));
 assert.equal(new Set(worlds.map(w=>w.constructor)).size,1);
 for(const d of defs){m.submit({instanceId:d.id,playerId:'p',tick:1,seq:1,type:'join'});m.submit({instanceId:d.id,playerId:'p',tick:1,seq:2,type:'start'});}
 m.tick(1,1/30,[]);const snap=JSON.stringify(m.snapshot('minigame:bowling'));
 m.submit({instanceId:'minigame:football',playerId:'p',tick:2,seq:3,type:'abandon'});m.tick(2,1/30,[]);
 assert.equal(m.records.get('minigame:football').state,'READY');assert.equal(m.records.get('minigame:bowling').state,'ACTIVE');
 const after=JSON.parse(JSON.stringify(m.snapshot('minigame:bowling')));delete after.session.lastTick;delete after.session.activeTicks;
 const before=JSON.parse(snap);delete before.session.lastTick;delete before.session.activeTicks;
 assert.deepEqual(after,before,'bowling untouched by football abandon');
});
test('determinism: the same command log replays to identical snapshots',async()=>{
 const run=async()=>{const def=defaultMiniGame('football',{id:'minigame:det',x:0,z:0,heading:1.1});const h=harness(def,{height:(x,z)=>Math.sin(x*.2)*.3+z*.01});await h.m.prepare(def.id);
  h.send({type:'join'});h.send({type:'start'});h.step();h.at(-.2,-.9);h.send({type:'launch',yaw:1.15,power:.9});h.step(50);h.at(1,3);h.actor.vx=3;h.step(40);
  return JSON.stringify([h.m.snapshot(def.id),h.events]);};
 assert.equal(await run(),await run());
});
test('mini-golf cup: a fast ball grazing the rim rolls on, the same speed through the centre drops',async()=>{
 const base=defaultMiniGame('minigolf',{id:'minigame:cup',x:0,z:0});
 const def=validateMiniGame({...base,elements:base.elements.filter(e=>e.kind!=='obstacle')});
 const pass=async(offset,speed)=>{
  const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start'});h.step();
  // 0.5 m before the cup (rolling loss ≈ 1.55 m/s² on grass): arrival ≈ sqrt(v² − 1.55).
  const w=h.world,start=areaToWorld(def.area,.6+offset,6.5);
  w.place(0,start.x,undefined,start.z);w.asleep[0]=0;w.vz[0]=speed;w.vx[0]=0;
  h.step(18,[]);return h.rec.session.finished.includes('me');
 };
 assert.equal(await pass(.19,2),false,'rim, arrives ≈ 1.6 m/s: lip-out');
 assert.equal(await pass(0,2.2),true,'centre, arrives ≈ 1.8 m/s: holed');
 assert.equal(await pass(0,4),false,'centre, arrives ≈ 3.8 m/s: too fast');
 assert.equal(await pass(.19,1.4),true,'rim, arrives ≈ 0.6 m/s: drops');
});
