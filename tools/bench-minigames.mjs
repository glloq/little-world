/** Doc 107 — CPU / memory benchmark of mini-games (Node, no GPU, fixed 30 Hz ticks).
 *  - BallWorld step with 1, 4, 8, 16 moving balls (arena with walls, relief) and 16 asleep;
 *  - manager tick: no instance, 10 READY instances, 1 ACTIVE football with a pushing actor;
 *  - heap growth per tick of an active 8-ball world (allocations in the hot loop);
 *  - 100 island cycles (create → prepare 3 → play → dispose): retained heap.
 * Reports p50/p95/p99 µs. Usage: node --experimental-strip-types --expose-gc tools/bench-minigames.mjs */
import {BallWorld,orientedBox} from '../src/minigames/ball/ball-physics.ts';
import {launchBall} from '../src/minigames/ball/push.ts';
import {createMiniGameManager} from '../src/minigames/manager.ts';
import {defaultMiniGame} from '../src/minigames/layouts.ts';
const pct=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2);};
const stats=t=>({p50Us:pct(t,.5),p95Us:pct(t,.95),p99Us:pct(t,.99)});
const gc=()=>{if(globalThis.gc){globalThis.gc();globalThis.gc();}};
const relief={height:(x,z)=>Math.sin(x*.15)*.4+Math.cos(z*.11)*.3,material:()=>'grass'};
function arena(n){
  const w=new BallWorld(relief,Math.max(1,n));
  for(let i=0;i<n;i++)w.add({id:'b'+i,x:(i%4)*1.5-2.25,y:2,z:Math.floor(i/4)*1.5-2.25,radius:.3,mass:1,restitution:.6,rolling:.6});
  w.boxes=[orientedBox(0,-10.1,20,.2,-5,5,0),orientedBox(0,10.1,20,.2,-5,5,0),orientedBox(-10.1,0,.2,20,-5,5,0),orientedBox(10.1,0,.2,20,-5,5,0),orientedBox(3,3,2,.4,-5,5,.6)];
  return w;
}
function benchBalls(n,ticks=6000){
  const w=arena(n),t=[];let seed=7;const r=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let k=0;k<ticks;k++){
    if(k%90===0)for(let i=0;i<n;i++)launchBall(w,i,r()*6.283,4+r()*8,r()*2);
    const a=performance.now();w.step(1/30);if(k>=300)t.push((performance.now()-a)*1000);
  }
  return {balls:n,...stats(t)};
}
function benchAsleep(){const w=arena(16);for(let k=0;k<200;k++)w.step(1/30);const t=[];for(let k=0;k<6000;k++){const a=performance.now();w.step(1/30);t.push((performance.now()-a)*1000);}return {balls:16,asleep:w.awakeCount===0,...stats(t)};}
async function benchManager(){
  const env={height:relief.height};
  const time=(m,actors,ticks=6000,offset=0)=>{const t=[];for(let k=1;k<=ticks;k++){const a=performance.now();m.tick(offset+k,1/30,actors);t.push((performance.now()-a)*1000);}return stats(t);};
  const empty=createMiniGameManager([],{env});
  const ten=createMiniGameManager(Array.from({length:10},(_,i)=>defaultMiniGame(['football','bowling','minigolf'][i%3],{id:'minigame:i'+i,x:i*60,z:0})),{env});
  for(const r of ten.records.values())await ten.prepare(r.def.id);
  const one=createMiniGameManager([defaultMiniGame('football',{id:'minigame:play',x:0,z:0})],{env});await one.prepare('minigame:play');
  one.submit({instanceId:'minigame:play',playerId:'p',tick:1,seq:1,type:'join'});one.submit({instanceId:'minigame:play',playerId:'p',tick:1,seq:2,type:'start'});one.tick(1,1/30,[]);
  // An actor dribbling around the ball: pushes on contact every few ticks.
  const actor={id:'p',x:0,y:0,z:-1,vx:0,vy:0,vz:3,radius:.4,height:1,mode:'ground'};
  const t=[];for(let k=2;k<6002;k++){const ph=k*.05;actor.x=Math.sin(ph)*3;actor.z=Math.cos(ph)*3;actor.vx=Math.cos(ph)*4.5;actor.vz=-Math.sin(ph)*4.5;
    if(k%120===0)one.submit({instanceId:'minigame:play',playerId:'p',tick:k,seq:k,type:'launch',yaw:k*.3,power:.6});
    const a=performance.now();one.tick(k,1/30,[actor]);t.push((performance.now()-a)*1000);}
  return {noInstance:time(empty,[]),tenReadyInactive:{...time(ten,[]),stepped:ten.tick(100000,1/30,[]).stepped},oneActiveFootball:stats(t)};
}
function allocations(){
  // Steady state after JIT warm-up (20 000 ticks): the first ticks allocate interpreter frames.
  const w=arena(8),run=n=>{for(let k=0;k<n;k++){if(k%90===0)for(let i=0;i<8;i++)launchBall(w,i,i,8,1);w.step(1/30);}};
  run(20000);gc();const before=process.memoryUsage().heapUsed;run(20000);
  const after=process.memoryUsage().heapUsed;gc();const settled=process.memoryUsage().heapUsed;
  return {balls:8,ticks:20000,bytesPerTickBeforeGc:+((after-before)/20000).toFixed(1),retainedAfterGcBytes:settled-before};
}
async function islandCycles(){
  const env={height:relief.height},defs=['football','bowling','minigolf'].map((v,i)=>defaultMiniGame(v,{id:'minigame:'+v,x:i*40,z:0}));
  const added=new Set(),colliders={add:c=>added.add(c.id),remove:id=>added.delete(id)};
  const cycle=async()=>{const m=createMiniGameManager(defs,{env,colliders});for(const d of defs)await m.prepare(d.id);
    for(const d of defs){m.submit({instanceId:d.id,playerId:'p',tick:1,seq:1,type:'join'});m.submit({instanceId:d.id,playerId:'p',tick:1,seq:2,type:'start'});}
    for(let k=1;k<=60;k++)m.tick(k,1/30,[]);m.dispose();};
  for(let i=0;i<10;i++)await cycle();gc();const before=process.memoryUsage().heapUsed,a=performance.now();
  for(let i=0;i<100;i++)await cycle();const ms=(performance.now()-a)/100;gc();
  return {cycles:100,msPerCycle:+ms.toFixed(2),retainedHeapBytes:process.memoryUsage().heapUsed-before,orphanColliders:added.size};
}
const out={ballStep:[1,4,8,16].map(n=>benchBalls(n)),asleep16:benchAsleep(),manager:await benchManager(),allocations:allocations(),islandCycles:await islandCycles(),
  note:'Node '+process.version+', single run, no GPU; budgets are objectives, not qualified.'};
console.log(JSON.stringify(out,null,1));
