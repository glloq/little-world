import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMiniGame,areaToWorld,worldToArea} from '../src/minigames/schema.ts';
import {defaultMiniGame} from '../src/minigames/layouts.ts';
import {MINIGAME_VARIANT_IDS} from '../src/minigames/catalog.ts';
import {createSession,joinSession,leaveSession,startSession,tickSession,finishSession,canStart,sessionSeconds} from '../src/minigames/session.ts';
import {finishReason} from '../src/minigames/rules.ts';
import {LocalMiniGameAuthority,COMMAND_STALE_TICKS} from '../src/minigames/authority.ts';
import {MiniGameRegistry} from '../src/minigames/registry.ts';
import {createMiniGameManager} from '../src/minigames/manager.ts';

const env={height:()=>0};
const place=(id,x=0,z=0)=>({id:'minigame:'+id,x,z});
const cmd=(instanceId,playerId,tick,seq,body)=>({instanceId,playerId,tick,seq,...body});

test('every variant template validates, round-trips JSON and rejects malformed data',()=>{
 for(const v of MINIGAME_VARIANT_IDS){
  const g=defaultMiniGame(v,place(v,10,-20));
  assert.deepEqual(validateMiniGame(JSON.parse(JSON.stringify(g))),g);
 }
 const g=defaultMiniGame('football',place('f'));
 assert.throws(()=>validateMiniGame({...g,id:'f'}),/identifiant/);
 assert.throws(()=>validateMiniGame({...g,extra:1}),/champ inconnu/);
 assert.throws(()=>validateMiniGame({...g,variant:'tennis'}),/variante/);
 assert.throws(()=>validateMiniGame({...g,elements:g.elements.filter(e=>e.kind!=='ball')}),/ball/);
 assert.throws(()=>validateMiniGame({...g,elements:[...g.elements,{id:'p',kind:'pin',x:0,z:0}]}),/non utilisé/);
 assert.throws(()=>validateMiniGame({...g,elements:g.elements.map(e=>e.kind==='ball'?{...e,x:99}:e)}),/hors de la zone/);
 assert.throws(()=>validateMiniGame({...g,teams:g.teams.slice(0,1)}),/équipe/);
 assert.throws(()=>validateMiniGame(g,{minX:-5,maxX:5,minZ:-5,maxZ:5}),/hors de la carte/);
 assert.throws(()=>validateMiniGame({...g,rules:{}}),/requise scoreTarget/);
 assert.throws(()=>validateMiniGame({...g,playersMax:99}),/joueurs/);
});
test('area frame transforms are inverse rotations',()=>{
 const area={x:5,z:-3,heading:.7,halfWidth:3,halfLength:6};
 const w=areaToWorld(area,1.5,-2),l=worldToArea(area,w.x,w.z);
 assert.ok(Math.abs(l.x-1.5)<1e-12&&Math.abs(l.z+2)<1e-12);
 const fwd=areaToWorld(area,0,1);assert.ok(Math.abs(Math.atan2(fwd.x-5,fwd.z+3)-.7)<1e-12,'local +Z = heading (yaw 0 = +Z)');
});
test('session: balanced teams, practice start, score/time rules, leaving abandons an empty game',()=>{
 const def=defaultMiniGame('football',place('f')),s=createSession(def,'s1'),ev=[];
 assert.ok(joinSession(s,def,'a',0,ev));assert.ok(joinSession(s,def,'b',0,ev));assert.ok(!joinSession(s,def,'a',0,ev),'no duplicate');
 assert.deepEqual(s.players.map(p=>p.teamId),['blue','red']);
 assert.equal(canStart(s,def),null);startSession(s,def,10,ev);
 tickSession(s,11);assert.throws(()=>tickSession(s,11),/non croissant/);
 s.scores.red=3;assert.equal(finishReason(s,def),'score');
 finishSession(s,def,'score',12,ev);assert.deepEqual(s.result.winners,['red']);
 assert.deepEqual(ev.map(e=>e.seq),ev.map((_,i)=>i+1),'monotonic seq');
 const t=createSession(def,'s2'),e2=[];joinSession(t,def,'solo',0,e2);startSession(t,def,0,e2);
 for(let k=1;k<=30*180;k++)tickSession(t,k);assert.equal(sessionSeconds(t),180);assert.equal(finishReason(t,def),'time');
 leaveSession(t,'solo',5401,e2);assert.equal(t.status,'abandoned');
 const strict=createSession({...def,rules:{...def.rules,practice:false}},'s3');joinSession(strict,def,'x',0,[]);
 assert.match(canStart(strict,{...def,rules:{...def.rules,practice:false}}),/2 joueur/);
 const draw=createSession(def,'s4');joinSession(draw,def,'a',0,[]);joinSession(draw,def,'b',0,[]);startSession(draw,def,0,[]);finishSession(draw,def,'time',1,[]);
 assert.deepEqual(draw.result.winners,[],'a team draw has no winner');
});
test('local authority orders commands by tick, player and seq; drops stale and replayed ones',()=>{
 const a=new LocalMiniGameAuthority();
 assert.ok(a.submit(cmd('minigame:x','b',5,1,{type:'start'})));
 assert.ok(a.submit(cmd('minigame:x','a',4,6,{type:'join'})));
 assert.ok(a.submit(cmd('minigame:x','a',5,7,{type:'launch',yaw:0,power:.5})));
 assert.ok(!a.submit(cmd('minigame:x','a',6,6,{type:'leave'})),'replayed seq refused');
 assert.ok(!a.submit(cmd('minigame:x','a',6,9,{type:'launch',yaw:0,power:2})),'power out of range');
 assert.ok(!a.submit(cmd('minigame:x','a',6,10,{type:'teleport'})),'unknown intent');
 assert.deepEqual(a.drain(5).map(c=>c.type),['join','launch','start']);
 a.submit(cmd('minigame:x','c',1,1,{type:'join'}));assert.equal(a.drain(1+COMMAND_STALE_TICKS+1).length,0,'stale dropped');
});
test('registry: single flight, no import before need, unknown family refused',async()=>{
 let calls=0;const fake={family:'ball',createSimulation:()=>{throw Error('x');},loadView:async()=>({create(){}})};
 const r=new MiniGameRegistry({ball:async()=>{calls++;return fake;}});
 assert.deepEqual(r.loaded(),[]);
 const [a,b]=await Promise.all([r.load('ball'),r.load('ball')]);assert.equal(a,b);assert.equal(calls,1);
 assert.deepEqual(r.loaded(),['ball']);
 await assert.rejects(r.load('tennis'),/inconnue/);
});
test('manager: an island without mini-games imports nothing; only needed families load',async()=>{
 let loads=0;const registry=new MiniGameRegistry({ball:async()=>{loads++;return (await import('../src/minigames/ball/family.ts')).default;}});
 const empty=createMiniGameManager([],{env,registry});empty.tick(1,1/30,[]);assert.equal(loads,0);empty.dispose();
 const m=createMiniGameManager([defaultMiniGame('football',place('far',500,500))],{env,registry});
 assert.deepEqual(m.proximity(0,0),{prepare:[],release:[]});assert.equal(loads,0,'far activity stays UNLOADED');
 assert.deepEqual(m.proximity(500,470).prepare,['minigame:far']);
 await m.prepare('minigame:far');assert.equal(loads,1);assert.equal(m.records.get('minigame:far').state,'READY');
 assert.deepEqual(m.proximity(0,0).release,['minigame:far'],'hysteresis release far away');
 m.release('minigame:far');assert.equal(m.records.get('minigame:far').state,'UNLOADED');assert.equal(m.records.get('minigame:far').sim,null);
});
test('manager: READY instances are never stepped; ACTIVE ones are; independent instances; colliders added and removed',async()=>{
 const added=new Set();const colliders={add:c=>added.add(c.id),remove:id=>added.delete(id)};
 const defs=Array.from({length:10},(_,k)=>defaultMiniGame('football',place('f'+k,k*60,0)));
 const m=createMiniGameManager(defs,{env,colliders});
 for(const d of defs)await m.prepare(d.id);
 assert.equal(added.size,120,'4 goal posts + 8 wall pieces (gates and goal mouths) per closed pitch while loaded');
 let stepped=0;for(let t=1;t<=60;t++)stepped+=m.tick(t,1/30,[]).stepped;
 assert.equal(stepped,0,'ten READY activities: no simulation work');
 m.submit(cmd('minigame:f3','me',61,1,{type:'join'}));m.submit(cmd('minigame:f3','me',61,2,{type:'start'}));
 const r=m.tick(61,1/30,[]);assert.equal(r.stepped,0,'first step on the next tick');assert.deepEqual(r.events.map(e=>e.type),['player:join','game:start']);
 assert.equal(m.tick(62,1/30,[]).stepped,1);
 assert.equal(m.records.get('minigame:f3').state,'ACTIVE');assert.equal(m.records.get('minigame:f4').state,'READY');
 assert.equal(m.records.get('minigame:f4').session,null,'other instance untouched');
 m.suspend('minigame:f3');assert.equal(m.tick(63,1/30,[]).stepped,0,'suspended: no work');
 m.resume('minigame:f3',64);assert.equal(m.tick(65,1/30,[]).stepped,1);
 m.dispose();assert.equal(added.size,0,'no orphan collider');assert.equal(m.stats().listeners,0);
 assert.throws(()=>m.tick(66,1/30,[]),/libéré/);
 assert.ok([...m.records.values()].every(r=>r.state==='DISPOSED'&&r.sim===null&&r.session===null));
});
test('manager: an exception in one activity is isolated (FAILED) while others keep running',async()=>{
 const good=defaultMiniGame('football',place('good')),bad=defaultMiniGame('football',place('bad',100));
 const errors=[];const m=createMiniGameManager([good,bad],{env,onError:id=>errors.push(id)});
 await m.prepare(good.id);await m.prepare(bad.id);
 for(const d of [good,bad]){m.submit(cmd(d.id,'p',1,1,{type:'join'}));m.submit(cmd(d.id,'p',1,2,{type:'start'}));}
 m.tick(1,1/30,[]);m.tick(2,1/30,[]);
 m.records.get(bad.id).sim.step=()=>{throw Error('boom');};
 const r=m.tick(3,1/30,[]);
 assert.deepEqual(errors,[bad.id]);assert.equal(m.records.get(bad.id).state,'FAILED');assert.equal(m.records.get(good.id).state,'ACTIVE');assert.equal(r.stepped,1);
 await m.prepare(bad.id);assert.equal(m.records.get(bad.id).state,'READY','a failed activity can be prepared again');
});
test('manager: re-preparing / reloading never duplicates listeners or colliders',async()=>{
 const added=[];const colliders={add:c=>added.push(c.id),remove:id=>added.splice(added.indexOf(id),1)};
 const d=defaultMiniGame('football',place('x'));const m=createMiniGameManager([d],{env,colliders});
 for(let k=0;k<5;k++){await m.prepare(d.id);await m.prepare(d.id);m.release(d.id);}
 assert.equal(added.length,0);await m.prepare(d.id);assert.equal(added.length,12);
 const off=m.subscribe(()=>{});off();off();assert.equal(m.stats().listeners,0);m.dispose();
});
