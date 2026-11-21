/** Doc 107 §6 — edge cases of the shared BallWorld (audit 21/11/2026). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {BallWorld,BALL_LIMITS,orientedBox} from '../src/minigames/ball/ball-physics.ts';
import {pushBalls,launchBall,PUSH} from '../src/minigames/ball/push.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {MOTION} from '../src/physics/motion.ts';

const flat={height:()=>0};
const spec=(o={})=>({id:'b',x:0,y:.3,z:0,radius:.3,mass:1,restitution:.6,rolling:1,...o});
const run=(w,n)=>{for(let t=0;t<n;t++)w.step(1/30);};
const finiteWorld=w=>{for(let i=0;i<w.count;i++)for(const a of [w.px,w.py,w.pz,w.vx,w.vy,w.vz])if(!Number.isFinite(a[i]))return false;return true;};
const energy=(w,g=MOTION.gravity)=>{let e=0;for(let i=0;i<w.count;i++){const m=1/w.invMass[i];e+=.5*m*(w.vx[i]**2+w.vy[i]**2+w.vz[i]**2)+m*g*w.py[i];}return e;};
const out=n=>({speed:new Float64Array(n),by:new Array(n).fill(null)});
const box4=(s)=>[orientedBox(0,-s,2*s,.2,-5,5,0),orientedBox(0,s,2*s,.2,-5,5,0),orientedBox(-s,0,.2,2*s,-5,5,0),orientedBox(s,0,.2,2*s,-5,5,0)];

test('a ball at rest on flat ground stays exactly still and sleeps',()=>{
 const w=new BallWorld(flat,1),i=w.add(spec());run(w,120);
 assert.equal(w.px[i],0);assert.equal(w.pz[i],0);assert.equal(w.asleep[i],1);
});
test('downhill: rolling-sphere acceleration (5/7 g sinθ), never above the speed limit',()=>{
 const slope=.3,w=new BallWorld({height:(x,z)=>-z*slope},1),i=w.add(spec({rolling:0,y:.32}));w.addVelocity(i,0,0,.001);
 run(w,15);const a=w.vz[i]/(15/30),sin=slope/Math.hypot(1,slope),ideal=5/7*MOTION.gravity*sin;
 assert.ok(Math.abs(a-ideal)/ideal<.12,`acceleration ${a.toFixed(2)} vs ${ideal.toFixed(2)}`);
 run(w,600);assert.ok(w.speed(i)<=BALL_LIMITS.maxSpeed+1e-9);
});
test('identical positions are separated deterministically (no stuck overlap)',()=>{
 const w=new BallWorld(flat,3);for(let k=0;k<3;k++)w.add(spec({id:'b'+k,asleep:false}));
 run(w,60);
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert.ok(Math.hypot(w.px[i]-w.px[j],w.pz[i]-w.pz[j])>.55,'separated '+i+'/'+j);
 assert.ok(finiteWorld(w));
});
test('different masses: a light ball bounces off a heavy one, momentum conserved',()=>{
 const w=new BallWorld(flat,2),a=w.add(spec({id:'a',z:-2,rolling:0,mass:.2})),b=w.add(spec({id:'b',rolling:0,mass:5,asleep:true}));
 launchBall(w,a,0,6);const p0=.2*w.vz[a];run(w,20);
 assert.ok(w.vz[a]<0,'light ball rebounds');assert.ok(w.vz[b]>0&&w.vz[b]<1.2,'heavy ball moves slowly');
 assert.ok(Math.abs(.2*w.vz[a]+5*w.vz[b]-p0)<.05);
});
test('no energy gain: 16 balls bouncing in a closed box for 60 s',()=>{
 const w=new BallWorld({height:(x,z)=>Math.sin(x*.7)*.2},16);w.boxes=box4(4);
 for(let k=0;k<16;k++){const i=w.add(spec({id:'b'+k,x:(k%4)-1.5,z:Math.floor(k/4)-1.5,y:1+k*.1,rolling:.2,restitution:.9}));launchBall(w,i,k,10,2);}
 const e0=energy(w);let max=e0;for(let t=0;t<1800;t++){w.step(1/30);max=Math.max(max,energy(w));}
 assert.ok(max<=e0*1.02,`energy ${max.toFixed(1)} > initial ${e0.toFixed(1)}`);
 assert.ok(finiteWorld(w));
 for(let i=0;i<16;i++)assert.ok(Math.abs(w.px[i])<4&&Math.abs(w.pz[i])<4,'stayed inside the box');
});
test('corners and several obstacles at once: a fast ball shot into a concave corner stays inside',()=>{
 for(const yaw of [Math.PI/4,.3,1.2]){
  const w=new BallWorld(flat,1),i=w.add(spec({radius:.12,y:.12,restitution:.6}));w.boxes=box4(2);
  launchBall(w,i,yaw,BALL_LIMITS.maxSpeed);run(w,240);
  assert.ok(Math.abs(w.px[i])<2&&Math.abs(w.pz[i])<2,'inside at yaw '+yaw+': '+w.px[i].toFixed(2)+','+w.pz[i].toFixed(2));
 }
});
test('no tunnelling at the maximum speed for every documented radius (walls 0.2 m)',()=>{
 for(const r of [.12,.14,.3,.35]){
  const w=new BallWorld(flat,1),i=w.add(spec({radius:r,y:r}));w.boxes=[orientedBox(0,3,6,.2,-1,.4+r,0)];
  launchBall(w,i,0,BALL_LIMITS.maxSpeed);run(w,30);
  assert.ok(w.pz[i]<3,'r='+r+' z='+w.pz[i].toFixed(2));
 }
});
test('many shared colliders: none is silently dropped',()=>{
 const q=new WorldCollisionQuery(()=>0,()=>null);
 // 400 small posts around, plus one wall far down the list (id sorts last).
 for(let k=0;k<400;k++)q.add({id:'a-post'+String(k).padStart(3,'0'),shape:'box',position:{x:-6+(k%20)*.6,y:0,z:-12+Math.floor(k/20)*.6},size:{x:.05,y:1,z:.05},enabled:()=>true});
 q.add({id:'z-wall',shape:'box',position:{x:0,y:0,z:3},size:{x:20,y:1,z:.3},enabled:()=>true});
 const env={height:()=>0,solids:(a,b,c,d)=>q.solidsNear(a,b,c,d)};
 const w=new BallWorld(env,2);w.add(spec({id:'far',x:0,z:-11.7,asleep:false}));const i=w.add(spec({id:'b',x:.3,z:0}));
 w.vx[0]=0;launchBall(w,0,Math.PI,.1);launchBall(w,i,0,8);run(w,40);
 assert.ok(w.pz[i]<3,'stopped by the wall even with 400 colliders in the query: z='+w.pz[i].toFixed(2));
});
test('non-finite relief or input never propagates NaN',()=>{
 const w=new BallWorld({height:(x,z)=>z>2?NaN:0},2),i=w.add(spec());w.add(spec({id:'c',x:3}));
 launchBall(w,i,0,6);run(w,60);assert.ok(finiteWorld(w));
 w.addVelocity(1,NaN,0,1);run(w,5);assert.ok(finiteWorld(w));
});
test('push: walk < run < roll, lateral and airborne contacts, heavy ball',()=>{
 const pushed=(actor,mass=.6)=>{const w=new BallWorld(flat,1);w.add(spec({mass}));pushBalls(w,[actor],out(1));return Math.hypot(w.vx[0],w.vz[0]);};
 const a=(o)=>({id:'p',x:0,y:0,z:-.6,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground',...o});
 const walk=pushed(a({vz:MOTION.walk})),run=pushed(a({vz:MOTION.run})),roll=pushed(a({vz:12,mode:'roll'}));
 assert.ok(walk<run&&run<roll,`walk ${walk} run ${run} roll ${roll}`);
 assert.ok(run<=PUSH.runMax+1e-9&&roll<=PUSH.rollMax+1e-9);
 assert.ok(pushed(a({x:-.6,z:0,vx:4}))>0,'lateral contact');
 assert.ok(pushed(a({y:.2,vz:4,vy:3,mode:'air'}))>0,'contact while jumping (body overlaps the ball)');
 assert.equal(pushed(a({y:1.5,vz:4,mode:'air'})),0,'jumping over the ball: no contact');
 assert.ok(pushed(a({vz:4}),20)<walk/3,'a heavy ball barely moves');
});
test('a ball pushed into a wall by a hamster stays outside the wall',()=>{
 const w=new BallWorld(flat,1);w.add(spec({z:1.7}));w.boxes=[orientedBox(0,2.1,6,.2,-1,1,0)];
 const actor={id:'p',x:0,y:0,z:1,vx:0,vy:0,vz:4,radius:.4,height:1,mode:'ground'};
 for(let t=0;t<60;t++){actor.z=Math.min(actor.z+4/30,1.6);pushBalls(w,[actor],out(1));w.step(1/30);}
 assert.ok(w.pz[0]+w.radius[0]<=2+.02,'ball not pushed through: '+w.pz[0].toFixed(3));
});
