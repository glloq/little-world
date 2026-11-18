import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfWaveField,validateSurfZone} from '../src/surf/wave-field.ts';
import {stepSurf,SURF_MOTION} from '../src/surf/surf-controller.ts';
const zone={id:'surf:test',minX:-200,maxX:200,minZ:-200,maxZ:200,
 dirX:0,dirZ:1,seaLevel:0,amplitude:1,wavelength:25,speed:5,seed:13,shoreFadeDepth:3,edgeFade:8};
const field=createSurfWaveField(zone,()=>-12);
const actor=()=>({position:{x:0,y:.12,z:0},velocity:{x:0,y:0,z:0},mode:'surf',surfStage:'paddle'});
const input={forward:1,right:0,cameraYaw:0,paddle:true,jumpPressed:false,brake:false};
test('surf zone validation rejects invalid direction, amplitude and extents',()=>{
 assert.equal(validateSurfZone(zone),zone);
 assert.throws(()=>validateSurfZone({...zone,dirZ:3}),/Zone/);
 assert.throws(()=>validateSurfZone({...zone,amplitude:30}),/Zone/);
 assert.throws(()=>validateSurfZone({...zone,maxX:-220}),/Zone/);
});
test('the same swell advances toward shore by its phase speed at fixed ticks',()=>{
 const h=field.height(0,0,0),later=field.height(0,5,30);
 assert.ok(h!==null&&later!==null);
 assert.ok(Math.abs(h-later)<1e-9,Math.abs(h-later));
 assert.deepEqual(field.sample(0,0,12),field.sample(0,0,12));
 assert.equal(field.sample(300,0,0),null);
});
test('wave gradient, normals and derivatives are finite and point up',()=>{
 for(let t=0;t<150;t+=3)for(let z=-100;z<=100;z+=9){
  const s=field.sample(0,z,t);
  assert.ok(s);
  for(const v of [s.height,s.gradientX,s.gradientZ,s.normalX,s.normalY,s.normalZ,s.velocityY,s.crest])
   assert.ok(Number.isFinite(v),String(v));
  assert.ok(s.normalY>0&&s.normalY<=1);
  assert.ok(Math.abs(Math.hypot(s.normalX,s.normalY,s.normalZ)-1)<1e-9);
 }
});
test('shore and boundaries fade to unchanged sea level without touching water datum',()=>{
 const beach=createSurfWaveField(zone,(_,z)=>z>100?-(200-z)/10:-12);
 assert.ok(Math.abs(beach.height(0,199,0))<.01);
 assert.ok(Math.abs(field.height(199,0,0))<.01);
});
test('paddling is capped, stable and never gives unlimited speed',()=>{
 const p=actor();
 for(let tick=0;tick<600;tick++)stepSurf(p,input,field,tick,1/30);
 assert.ok(Math.hypot(p.velocity.x,p.velocity.z)<=SURF_MOTION.maxSpeed+1e-9);
 assert.ok([p.position.x,p.position.y,p.position.z].every(Number.isFinite));
});
test('riding follows changing wave elevation and turning dissipates speed',()=>{
 const wave={...field.sample(0,0,0),gradientX:0,gradientZ:-.3,crest:.9,breaking:0,
  directionX:0,directionZ:1,velocityY:0};
 const mock={zone, sample:()=>wave};
 const a={position:{x:0,y:wave.height+.12,z:0},velocity:{x:0,y:0,z:6},mode:'surf',surfStage:'ride'};
 stepSurf(a,{...input,paddle:false},mock,0,1/30);
 assert.ok(a.velocity.z>5.5);
 const straight=Math.hypot(a.velocity.x,a.velocity.z);
 const b={position:{x:0,y:wave.height+.12,z:0},velocity:{x:0,y:0,z:6},mode:'surf',surfStage:'ride'};
 stepSurf(b,{...input,right:1,paddle:false},mock,0,1/30);
 assert.ok(b.surfHeading<0);
 assert.ok(Math.hypot(b.velocity.x,b.velocity.z)<straight+.01);
});
test('surf can launch a controlled jump and land back on the wave',()=>{
 const fake={...field.sample(0,0,0),height:0,crest:.9,breaking:0,gradientX:0,gradientZ:0,velocityY:0};
 const mock={zone,sample:()=>fake};
 const p={position:{x:0,y:.12,z:0},velocity:{x:0,y:0,z:5},mode:'surf',surfStage:'ride'};
 let event=stepSurf(p,{...input,paddle:false,jumpPressed:true},mock,1,1/30);
 assert.equal(event.kind,'jump');assert.equal(p.mode,'air');assert.equal(p.surfAirborne,true);
 for(let tick=2;tick<250&&p.surfAirborne;tick++)event=stepSurf(p,{...input,paddle:false,jumpPressed:false},mock,tick,1/30);
 assert.equal(event.kind,'land');assert.equal(p.mode,'surf');assert.equal(p.surfAirborne,false);
 assert.equal(p.surfLandingSeq,1);
});
