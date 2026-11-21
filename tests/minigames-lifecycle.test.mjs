/** Doc 107 §4–5 — lifecycle, asynchronous loading, sessions, authority and the game host. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMiniGameManager} from '../src/minigames/manager.ts';
import {MiniGameRegistry} from '../src/minigames/registry.ts';
import {defaultMiniGame} from '../src/minigames/layouts.ts';
import {LocalMiniGameAuthority} from '../src/minigames/authority.ts';
import {createMiniGameHost,LOCAL_PLAYER} from '../src/minigames/game-host.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {areaToWorld} from '../src/minigames/schema.ts';
import {ballWorldOf} from '../src/minigames/ball/simulation.ts';

const env={height:()=>0};
const realFamily=async()=>(await import('../src/minigames/ball/family.ts')).default;
const gated=()=>{let open;const gate=new Promise(r=>{open=r;});return {open,registry:new MiniGameRegistry({ball:async()=>{await gate;return realFamily();}})};};
const tracker=()=>{const ids=new Set();return {ids,colliders:{add:c=>{assert.ok(!ids.has(c.id),'collider added twice: '+c.id);ids.add(c.id);},remove:id=>ids.delete(id)}};};
const cmd=(instanceId,playerId,tick,seq,body)=>({instanceId,playerId,tick,seq,...body});

test('release while LOADING, then prepare again: one simulation, no duplicated collider',async()=>{
 const {open,registry}=gated(),t=tracker(),d=defaultMiniGame('football',{id:'minigame:f',x:0,z:0});
 const m=createMiniGameManager([d],{env,registry,colliders:t.colliders});
 const a=m.prepare(d.id);assert.equal(m.records.get(d.id).state,'LOADING');
 m.release(d.id);assert.equal(m.records.get(d.id).state,'UNLOADED');
 const b=m.prepare(d.id);open();await Promise.all([a,b]);
 assert.equal(m.records.get(d.id).state,'READY');assert.equal(t.ids.size,4);
 m.release(d.id);assert.equal(t.ids.size,0);
});
test('release while LOADING without coming back: nothing is created when the module arrives',async()=>{
 const {open,registry}=gated(),t=tracker(),d=defaultMiniGame('bowling',{id:'minigame:b',x:0,z:0});
 const m=createMiniGameManager([d],{env,registry,colliders:t.colliders});
 const a=m.prepare(d.id);m.release(d.id);open();await a;
 assert.equal(m.records.get(d.id).state,'UNLOADED');assert.equal(m.records.get(d.id).sim,null);
});
test('dispose (island change) during loading: no simulation, no collider, no listener',async()=>{
 const {open,registry}=gated(),t=tracker(),d=defaultMiniGame('football',{id:'minigame:f',x:0,z:0});
 const m=createMiniGameManager([d],{env,registry,colliders:t.colliders});m.subscribe(()=>{});
 const a=m.prepare(d.id);m.dispose();open();await a;
 assert.equal(t.ids.size,0);assert.equal(m.records.get(d.id).sim,null);assert.equal(m.stats().listeners,0);
 await assert.rejects(m.prepare(d.id),/libéré/);
});
test('a failing module load is isolated (FAILED) and can be retried',async()=>{
 let fail=true;const errors=[];
 const registry=new MiniGameRegistry({ball:async()=>{if(fail)throw Error('réseau');return realFamily();}});
 const d=defaultMiniGame('minigolf',{id:'minigame:g',x:0,z:0}),m=createMiniGameManager([d],{env,registry,onError:id=>errors.push(id)});
 await m.prepare(d.id);assert.equal(m.records.get(d.id).state,'FAILED');assert.deepEqual(errors,[d.id]);
 fail=false;await m.prepare(d.id);assert.equal(m.records.get(d.id).state,'READY');
});
test('commands after the end of a game: launch refused, join opens a NEW session, events not repeated',async()=>{
 const d=defaultMiniGame('football',{id:'minigame:f',x:0,z:0}),m=createMiniGameManager([d],{env});await m.prepare(d.id);
 const all=[];m.subscribe(r=>all.push(...r.events));
 m.submit(cmd(d.id,'p',1,1,{type:'join'}));m.submit(cmd(d.id,'p',1,2,{type:'start'}));m.tick(1,1/30,[]);
 m.submit(cmd(d.id,'p',2,3,{type:'abandon'}));m.tick(2,1/30,[]);
 m.submit(cmd(d.id,'p',3,4,{type:'abandon'}));m.submit(cmd(d.id,'p',3,5,{type:'launch',yaw:0,power:1}));const r=m.tick(3,1/30,[]);
 assert.equal(all.filter(e=>e.type==='game:abandon').length,1,'abandon emitted once');
 assert.ok(r.refusals.some(f=>/non commencée/.test(f.reason)));
 m.submit(cmd(d.id,'p',4,6,{type:'join'}));m.tick(4,1/30,[]);
 assert.equal(m.records.get(d.id).session.sessionId,d.id+':s2');assert.equal(m.records.get(d.id).session.status,'ready');
});
test('players leaving: the game continues while someone remains, then abandons once',async()=>{
 const d=defaultMiniGame('bowling',{id:'minigame:b',x:0,z:0}),m=createMiniGameManager([d],{env});await m.prepare(d.id);
 const ev=[];m.subscribe(r=>ev.push(...r.events));
 for(const [p,s] of [['a',1],['b',1]])m.submit(cmd(d.id,p,1,s,{type:'join'}));m.submit(cmd(d.id,'a',1,2,{type:'start'}));m.tick(1,1/30,[]);
 m.submit(cmd(d.id,'a',2,3,{type:'leave'}));m.tick(2,1/30,[]);assert.equal(m.records.get(d.id).state,'ACTIVE');
 assert.equal(m.records.get(d.id).session.players.map(p=>p.id).join(),'b');
 m.submit(cmd(d.id,'b',3,2,{type:'leave'}));m.tick(3,1/30,[]);
 assert.equal(m.records.get(d.id).state,'READY');assert.equal(ev.filter(e=>e.type==='game:abandon').length,1);
});
test('snapshot / restore on another authority with another tick base resumes identically',async()=>{
 const d=defaultMiniGame('football',{id:'minigame:f',x:0,z:0,heading:.4});
 const a=createMiniGameManager([d],{env}),b=createMiniGameManager([d],{env});await a.prepare(d.id);await b.prepare(d.id);
 const actor={id:'p',x:0,y:0,z:-1,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
 a.submit(cmd(d.id,'p',1,1,{type:'join'}));a.submit(cmd(d.id,'p',1,2,{type:'start'}));a.tick(1,1/30,[]);
 a.submit(cmd(d.id,'p',2,3,{type:'launch',yaw:.4,power:.8}));a.tick(2,1/30,[actor]);for(let k=3;k<=20;k++)a.tick(k,1/30,[]);
 const snap=JSON.parse(JSON.stringify(a.snapshot(d.id)));b.restore(d.id,snap,5000);
 for(let k=21;k<=80;k++)a.tick(k,1/30,[]);for(let k=5001;k<=5060;k++)b.tick(k,1/30,[]);
 const sa=a.snapshot(d.id),sb=b.snapshot(d.id);
 assert.deepEqual(sb.sim,sa.sim);assert.equal(sb.session.activeTicks,sa.session.activeTicks);assert.deepEqual(sb.session.scores,sa.session.scores);
});
test('authority: per-player sequences, stale and future commands, forget on dispose',()=>{
 const a=new LocalMiniGameAuthority();
 assert.ok(a.submit(cmd('minigame:x','p',10,5,{type:'join'})));
 assert.ok(!a.submit(cmd('minigame:x','p',11,5,{type:'start'})),'same seq = replay');
 assert.ok(!a.submit(cmd('minigame:x','p',11,4,{type:'start'})),'lower seq after a higher one: refused (clients send in order)');
 assert.ok(a.submit(cmd('minigame:y','p',10,1,{type:'join'})),'sequences are per instance');
 assert.ok(a.submit(cmd('minigame:x','p',20,6,{type:'start'})));
 assert.equal(a.drain(10).length,2);assert.equal(a.pending,1,'future command kept until its tick');
 a.forget('minigame:x');assert.equal(a.pending,0);assert.ok(a.submit(cmd('minigame:x','p',30,1,{type:'join'})),'sequence reset after forget');
});

function hostFixture(variant='minigolf'){
 const def=defaultMiniGame(variant,{id:'minigame:h',x:20,z:10,heading:.5}),scene=new THREE.Group(),infos=[],emitted=[];
 const collision=new WorldCollisionQuery(()=>0,()=>null);
 const host=createMiniGameHost({parent:scene,defs:[def],collision,height:()=>0,water:()=>null,showInfo:t=>infos.push(t),emit:e=>emitted.push(e),hudHost:null});
 const player={position:new THREE.Vector3(),velocity:new THREE.Vector3(),mode:'ground'};
 const at=(lx,lz)=>{const p=areaToWorld(def.area,lx,lz);player.position.set(p.x,0,p.z);};
 let tick=0;const step=(f=false,n=1,yaw=def.area.heading)=>{for(let k=0;k<n;k++)host.tick(++tick,1/30,player,f,yaw);};
 const flush=()=>new Promise(r=>setTimeout(r,0));
 return {def,scene,host,player,at,step,flush,infos,emitted,collision,get rec(){return host.manager.records.get(def.id);},skip(n){tick+=n;}};
}
test('host: approach loads the activity and its view; F starts; the starting press never launches',async()=>{
 const h=hostFixture('minigolf');h.at(0,-8.6);h.step(false,15);
 for(let k=0;k<20&&!h.scene.children.length;k++){await h.flush();h.step(false,1);}
 assert.equal(h.rec.state,'READY');assert.ok(h.scene.children.length>=1,'view created');
 assert.ok(h.host.capturesAction(h.player),'F belongs to the mini-game inside its area');
 h.step(true,5);h.step(false,1);
 assert.equal(h.rec.state,'ACTIVE');assert.equal(h.rec.session.attempts[LOCAL_PLAYER]??0,0,'no stroke from the start press');
 const ball=ballWorldOf(h.rec.sim);h.player.position.set(ball.px[0]-Math.sin(h.def.area.heading)*.7,0,ball.pz[0]-Math.cos(h.def.area.heading)*.7);
 h.step(true,20);h.step(false,1);assert.equal(h.rec.session.attempts[LOCAL_PLAYER],1,'charged press = one stroke');
 h.host.dispose();assert.equal(h.scene.children.length,0,'view removed');
});
test('host: time outside the host (lift ride) is not match time; leaving abandons; dispose leaves nothing',async()=>{
 const h=hostFixture('football');h.at(0,-3);h.step(false,15);for(let k=0;k<20&&!h.scene.children.length;k++){await h.flush();h.step(false,1);}
 assert.ok(h.collision.solidsNear(-1e4,1e4,-1e4,1e4).length>=4,'goal posts registered for the player');
 h.step(true,2);h.step(false,1);assert.equal(h.rec.state,'ACTIVE');
 const before=h.rec.session.activeTicks;h.skip(900);h.step(false,1);
 assert.equal(h.rec.session.activeTicks-before,1,'a 30 s gap counts as one tick');
 h.player.position.set(h.def.area.x+200,0,h.def.area.z);h.step(false,1);
 assert.equal(h.rec.state,'READY');assert.ok(h.infos.some(t=>/abandonnée/.test(t)));
 h.host.dispose();assert.equal(h.collision.solidsNear(-1e4,1e4,-1e4,1e4).length,0,'no orphan collider');
 assert.equal(h.scene.children.length,0);
});
test('host: walking into another activity abandons the current game; F then starts the new one',async()=>{
 const a=defaultMiniGame('minigolf',{id:'minigame:a',x:0,z:0}),b=defaultMiniGame('cans',{id:'minigame:b',x:14,z:0});
 const scene=new THREE.Group(),host=createMiniGameHost({parent:scene,defs:[a,b],collision:null,height:()=>0,water:()=>null,showInfo:()=>{},hudHost:null});
 const player={position:new THREE.Vector3(0,0,-8.6),velocity:new THREE.Vector3(),mode:'ground'};
 let tick=0;const step=(f,n=1)=>{for(let k=0;k<n;k++)host.tick(++tick,1/30,player,f,0);};
 step(false,15);for(let k=0;k<30&&[...host.manager.records.values()].some(r=>r.state!=='READY');k++){await new Promise(r=>setTimeout(r,0));step(false,1);}
 step(true,2);step(false,1);assert.equal(host.manager.records.get(a.id).state,'ACTIVE');
 const t=areaToWorld(b.area,0,-4.6);player.position.set(t.x,0,t.z);step(false,1);
 assert.equal(host.manager.records.get(a.id).state,'READY','golf abandoned on entering the cans area');
 step(true,2);step(false,1);assert.equal(host.manager.records.get(b.id).state,'ACTIVE','F starts the cans game');
 host.dispose();
});
test('personal bests: same local mechanism as race records, keyed by layout, direction from the ranking',async()=>{
 const {minigameRecord}=await import('../src/minigames/records.ts');
 const {readPracticeBest,writePracticeBest}=await import('../src/gameplay/race-records.ts');
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const golf=defaultMiniGame('minigolf',{id:'minigame:g',x:0,z:0}),r=minigameRecord(golf);
 assert.equal(r.better,'lower');assert.ok(writePracticeBest(storage,r,5));assert.ok(!writePracticeBest(storage,r,6));assert.ok(writePracticeBest(storage,r,3));
 assert.equal(readPracticeBest(storage,r),3);
 const moved=minigameRecord({...golf,elements:golf.elements.map(e=>e.kind==='hole'?{...e,x:-1}:e)});
 assert.notEqual(moved.key,r.key,'editing the course starts a new record');
 assert.equal(minigameRecord(defaultMiniGame('bowling',{id:'minigame:b',x:0,z:0})).better,'higher');
 assert.equal(minigameRecord(defaultMiniGame('football',{id:'minigame:f',x:0,z:0})),null,'no personal best for team scores');
});
