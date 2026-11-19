import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {stepSurf,SURF_MOTION} from '../src/surf/surf-controller.ts';

// Island-B-like swell: tall, readable, slower than a riding board.
const zone={id:'surf:arcade',minX:-200,maxX:200,minZ:-260,maxZ:60,dirX:0,dirZ:1,seaLevel:0,amplitude:2,
 wavelength:46,speed:5.2,seed:42877,shoreFadeDepth:3,edgeFade:30,style:'tubular',
 form:{organic:true,curvature:.001,meander:4,meanderLength:150}};
const shelf=(x,z)=>-12+Math.max(0,z+260)*.045;
const field=createSurfWaveField(zone,shelf);
const board=z=>({position:{x:0,y:0,z},velocity:{x:0,y:0,z:0},mode:'surf',surfStage:'paddle',surfHeading:0});
const input=(o={})=>({forward:1,right:0,cameraYaw:0,paddle:true,jumpPressed:false,brake:false,...o});
const steer=(p,target)=>{const e=Math.atan2(Math.sin(target-p.surfHeading),Math.cos(target-p.surfHeading));return Math.max(-1,Math.min(1,-e*3));};

test('paddling toward the shore catches a wave within a few seconds from any start',()=>{
 for(let start=-200;start<=-150;start+=7){
  const p=board(start);let caught=-1;
  for(let t=1;t<=600&&caught<0;t++)if(stepSurf(p,input(),field,t,1/30).kind==='caught')caught=t;
  assert.ok(caught>0&&caught<=5*30,'start '+start+': caught after '+(caught/30).toFixed(1)+' s');
 }
 assert.ok(SURF_MOTION.paddleMax<zone.speed,'paddling is slower than the swell, so waves reach the surfer');
});
test('a caught board is held on the face and carves far down the line',()=>{
 for(const start of [-190,-175,-160]){
  const p=board(start);let caught=-1,ride=0,face=0,x0=0;
  for(let t=1;t<=600;t++){
   stepSurf(p,input({right:caught>=0?steer(p,-.8):0}),field,t,1/30);
   if(p.surfStage==='ride'){if(caught<0){caught=t;x0=p.position.x;}ride++;
    const s=field.sample(p.position.x,p.position.z,t);if(s&&s.crest>.45)face++;}
  }
  assert.equal(p.mode,'surf');
  assert.ok(ride>=500,'still riding after the catch: '+ride);
  assert.ok(face/ride>.5,'mostly on the face: '+(face/ride).toFixed(2));
  assert.ok(Math.abs(p.position.x-x0)>80,'down the line: '+(p.position.x-x0).toFixed(0)+' m');
  assert.ok(Math.hypot(p.velocity.x,p.velocity.z)<=SURF_MOTION.maxSpeed);
 }
});
test('holding a turn runs down the line (never spins back to sea); S leaves the wave',()=>{
 const p=board(-185);
 for(let t=1;t<=60;t++)stepSurf(p,input(),field,t,1/30);
 assert.equal(p.surfStage,'ride');
 for(let t=61;t<=300;t++)stepSurf(p,input({right:1}),field,t,1/30);
 assert.equal(p.surfStage,'ride','still riding after 8 s of full right turn');
 const w=field.sample(p.position.x,p.position.z,300),local=Math.atan2(w.directionX,w.directionZ);
 const rel=Math.atan2(Math.sin(p.surfHeading-local),Math.cos(p.surfHeading-local));
 assert.ok(Math.abs(rel)<=SURF_MOTION.maxLineAngle+.15,'board along the line, relative angle '+rel.toFixed(2));
 assert.ok(Math.abs(p.velocity.x)>4,'running along the wave');
 stepSurf(p,input({forward:-1}),field,301,1/30);
 assert.equal(p.surfStage,'paddle');
});
test('Space jumps anywhere on the wave, also while paddling, and lands back on the board',()=>{
 const p=board(-200);
 const ev=stepSurf(p,input({jumpPressed:true}),field,5,1/30);
 assert.equal(ev.kind,'jump');assert.equal(p.surfAirborne,true);assert.ok(p.velocity.y>=SURF_MOTION.paddleJumpVertical);
 let last='none';
 for(let t=6;t<200&&p.surfAirborne;t++)last=stepSurf(p,input({jumpPressed:false}),field,t,1/30).kind;
 assert.equal(last,'land');assert.equal(p.mode,'surf');
 // Riding: a bigger air.
 const r=board(-185);for(let t=1;t<=90;t++)stepSurf(r,input(),field,t,1/30);
 assert.equal(r.surfStage,'ride');
 stepSurf(r,input({jumpPressed:true}),field,91,1/30);
 assert.ok(r.velocity.y>SURF_MOTION.jumpVertical);
});
test('Shift gas boost speeds the board up, bounded, and stays deterministic',()=>{
 const ride=boost=>{const p=board(-185);
  for(let t=1;t<=240;t++)stepSurf(p,input({right:steer(p,-.8),boost:t%45<6?70:0}),field,t,1/30);
  return p;};
 const plain=board(-185);for(let t=1;t<=240;t++)stepSurf(plain,input({right:steer(plain,-.8)}),field,t,1/30);
 const boosted=ride(true);
 assert.ok(Math.abs(boosted.position.x)>Math.abs(plain.position.x)+5,'boost carries further down the line');
 assert.ok(Math.hypot(boosted.velocity.x,boosted.velocity.z)<=SURF_MOTION.maxSpeed);
 assert.deepEqual(ride(true),boosted);
});
