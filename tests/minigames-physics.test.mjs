import test from 'node:test';
import assert from 'node:assert/strict';
import {BallWorld,BALL_LIMITS,orientedBox} from '../src/minigames/ball/ball-physics.ts';
import {pushBalls,launchBall,PUSH} from '../src/minigames/ball/push.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';

const flat={height:()=>0};
const spec=(o={})=>({id:'b',x:0,y:.3,z:0,radius:.3,mass:1,restitution:.6,rolling:1,...o});
const run=(w,ticks)=>{for(let t=0;t<ticks;t++)w.step(1/30);};
const out=n=>({speed:new Float64Array(n),by:new Array(n).fill(null)});

test('a dropped ball lands on the relief, bounces lower each time, then sleeps',()=>{
 const w=new BallWorld(flat,2),i=w.add(spec({y:3,asleep:false}));
 let peaks=[],up=false,prev=w.py[i];
 for(let t=0;t<300;t++){w.step(1/30);const y=w.py[i];if(up&&y<prev)peaks.push(prev);up=y>prev;prev=y;}
 assert.ok(peaks.length>=1,'bounced');
 for(let k=1;k<peaks.length;k++)assert.ok(peaks[k]<peaks[k-1]+1e-9,'decreasing bounces');
 assert.ok(Math.abs(w.py[i]-.3)<.01,'rests on the ground');
 assert.equal(w.asleep[i],1,'sleeps');
});
test('rolling resistance stops a ball on flat ground; ice slides much further than grass',()=>{
 const dist=material=>{const w=new BallWorld({height:()=>0,material:()=>material},1),i=w.add(spec());launchBall(w,i,0,8);run(w,600);return {z:w.pz[i],asleep:w.asleep[i]};};
 const grass=dist('grass'),ice=dist('ice');
 assert.equal(grass.asleep,1);assert.ok(grass.z>5&&grass.z<40,'grass distance '+grass.z);
 assert.ok(ice.z>grass.z*3,'ice slides further');
});
test('a ball accelerates down a slope and stays put on a gentle slope with high resistance',()=>{
 const slope={height:(x,z)=>-z*.2};
 const w=new BallWorld(slope,1),i=w.add(spec({rolling:.5,y:.31}));w.addVelocity(i,0,0,.01);run(w,60);
 assert.ok(w.vz[i]>1,'rolls downhill');
 const sticky=new BallWorld({height:(x,z)=>-z*.02},1),j=sticky.add(spec({rolling:3}));sticky.addVelocity(j,0,0,.01);run(sticky,120);
 assert.equal(sticky.asleep[j],1,'friction holds it on a 2 % slope');
});
test('sphere/sphere impulse conserves momentum and wakes the target',()=>{
 const w=new BallWorld(flat,2),a=w.add(spec({id:'a',z:-2,rolling:0})),b=w.add(spec({id:'b',z:0,rolling:0,asleep:true}));
 launchBall(w,a,0,5);const p0=w.vz[a]+w.vz[b];
 let hit=false;for(let t=0;t<30&&!hit;t++){w.step(1/30);hit=w.vz[b]>.5;}
 assert.ok(hit,'b moves');assert.ok(Math.abs(w.vz[a]+w.vz[b]-p0)<.05,'momentum conserved without rolling resistance');
 assert.ok(w.vz[b]>w.vz[a],'target leaves faster than the striker (e=0.6)');
 assert.ok(w.hitSpeed[b]>0||w.vz[b]>0);
});
test('oriented walls reflect and never let a fast ball tunnel within the documented limit',()=>{
 const r=.12,limit=BALL_LIMITS.maxSubsteps*r*.5*30;
 const w=new BallWorld(flat,1),i=w.add(spec({radius:r,y:r,restitution:.6}));
 w.boxes=[orientedBox(0,3,4,.2,-1,.3,0)];
 launchBall(w,i,0,limit*.98);run(w,60);
 assert.ok(w.pz[i]<3,'stopped by a 0.2 m wall at '+limit.toFixed(1)+' m/s, z='+w.pz[i]);
 const turned=new BallWorld(flat,1),j=turned.add(spec({radius:r,y:r}));
 turned.boxes=[orientedBox(0,3,6,.2,-1,.3,Math.PI/4)];launchBall(turned,j,0,6);run(turned,40);
 assert.ok(Math.abs(turned.vx[j])>.3||Math.abs(turned.px[j])>.3,'45° wall deflects sideways');
});
test('shared colliders of WorldCollisionQuery are seen by the balls (same broadphase as the player)',()=>{
 const q=new WorldCollisionQuery(()=>0,()=>null);
 q.add({id:'rock',shape:'box',position:{x:0,y:0,z:4},size:{x:2,y:1,z:1},enabled:()=>true});
 const env={height:(x,z)=>q.reliefHeight(x,z),solids:(a,b,c,d)=>q.solidsNear(a,b,c,d)};
 const w=new BallWorld(env,1),i=w.add(spec());launchBall(w,i,0,6);run(w,40);
 assert.ok(w.pz[i]<3.5,'blocked by the shared rock');
});
test('water flags the ball and makes it float',()=>{
 const w=new BallWorld({height:()=>-3,water:()=>0},1),i=w.add(spec({y:-1,asleep:false}));
 run(w,120);assert.equal(w.inWater[i],1);assert.ok(w.py[i]>-1.5,'buoyant');
});
test('player pushes are bounded per tick and grow with the roll; several pushers add up on a heavy ball',()=>{
 const w=new BallWorld(flat,1),i=w.add(spec({mass:.6}));
 const walker={id:'p',x:0,y:0,z:-.5,vx:0,vy:0,vz:4,radius:.4,height:1,mode:'ground'};
 pushBalls(w,[walker],out(1));const walk=w.vz[i];
 assert.ok(walk>0&&walk<=PUSH.walkMax+1e-9,'walk push '+walk);
 const w2=new BallWorld(flat,1),j=w2.add(spec({mass:.6}));
 pushBalls(w2,[{...walker,vz:40,mode:'roll'}],out(1));
 assert.ok(w2.vz[j]<=PUSH.maxDeltaPerTick+1e-9,'per-tick delta bounded: '+w2.vz[j]);
 assert.ok(w2.vz[j]>walk,'roll pushes harder');
 const heavy=()=>{const h=new BallWorld(flat,1);h.add(spec({mass:20,radius:1,y:1}));return h;};
 const one=heavy(),two=heavy(),p=(x)=>({id:'p'+x,x,y:0,z:-1.2,vx:0,vy:0,vz:3,radius:.4,height:1,mode:'ground'});
 pushBalls(one,[p(0)],out(1));pushBalls(two,[p(-.2),p(.2)],out(1));
 assert.ok(two.vz[0]>one.vz[0]*1.5,'two hamsters push a big ball harder');
 assert.ok(Number.isFinite(two.vz[0])&&two.vz[0]<PUSH.walkMax);
});
test('deterministic: identical inputs give bit-identical snapshots; restore resumes exactly',()=>{
 const make=()=>{const w=new BallWorld({height:(x,z)=>Math.sin(x*.3)*.4+z*.05},4);for(let k=0;k<4;k++)w.add(spec({id:'b'+k,x:k*.7-1,z:k*.3}));launchBall(w,0,.4,9,1);launchBall(w,3,-2.5,7);return w;};
 const a=make(),b=make();run(a,200);run(b,200);
 assert.deepEqual(a.snapshot(),b.snapshot());
 const c=make();run(c,100);const snap=JSON.parse(JSON.stringify(c.snapshot()));const d=make();d.restore(snap);run(c,100);run(d,100);
 assert.deepEqual(c.snapshot(),d.snapshot());
});
test('asleep worlds do no integration work; a bounded number of balls only',()=>{
 const w=new BallWorld(flat,16);for(let k=0;k<16;k++)w.add(spec({id:'b'+k,x:k,asleep:true}));
 w.step(1/30);assert.equal(w.lastWork,0);
 assert.throws(()=>w.add(spec({id:'x'})),/Trop de balles/);
 assert.throws(()=>new BallWorld(flat,BALL_LIMITS.maxBalls+1));
 launchBall(w,0,0,BALL_LIMITS.maxSpeed*10);assert.ok(w.speed(0)<=BALL_LIMITS.maxSpeed+1e-9);
});
