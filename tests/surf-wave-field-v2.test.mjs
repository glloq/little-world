import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfWaveField,SURF_WAVE_MODEL,SURF_GROUND_GRADIENT_STEP} from '../src/surf/wave-field.ts';
import {createSurfWaveField as createV1} from './fixtures/surf/wave-field-v1.ts';

const zone={id:'surf:v2-ref',minX:-100,maxX:100,minZ:-140,maxZ:60,dirX:.6,dirZ:.8,seaLevel:.5,
 amplitude:1.45,wavelength:36,speed:6.3,seed:4321,shoreFadeDepth:3,edgeFade:12,barrelStrength:1};
// Smooth sloping shelf (shallow band reaches the beach inside the zone) with lateral relief.
const shelf=(x,z)=>-10+Math.max(0,z+140)*.065+Math.sin(x*.045)*.5+Math.cos(z*.03)*.3;
const linear=(x,z)=>-6+.03*x+.05*z;
const TICKS=[0,1,17,449,9000,5_000_000,2**40];
const kinkBand=(z,x,y)=>{
 const m=[x-z.minX,z.maxX-x,y-z.minZ,z.maxZ-y].sort((a,b)=>a-b);
 return m[1]-m[0]<SURF_GROUND_GRADIENT_STEP+.05&&m[0]<(z.edgeFade??12);
};
function* grid(z,step){for(let x=z.minX-3;x<=z.maxX+3;x+=step)for(let y=z.minZ-3;y<=z.maxZ+3;y+=step)yield [x,y];}

test('model 2 keeps every non-gradient output bit-identical to the frozen V1 engine',()=>{
 assert.equal(SURF_WAVE_MODEL,2);
 for(const ground of [shelf,linear,()=>-12]){
  const v2=createSurfWaveField(zone,ground),v1=createV1(zone,ground);
  assert.equal(v2.model,2);
  for(const [x,y] of grid(zone,3.7))for(const tick of TICKS){
   const a=v2.sample(x,y,tick),b=v1.sample(x,y,tick);
   assert.equal(a===null,b===null,'same wet/dry/out-of-zone decision at '+x+','+y);
   assert.equal(v2.height(x,y,tick),v1.height(x,y,tick));
   if(!a)continue;
   for(const key of ['height','velocityY','crest','breaking','waveId','phaseSpeed','directionX','directionZ','zoneId'])
    assert.equal(a[key],b[key],key+' differs at '+x+','+y+' tick '+tick);
  }
 }
});
test('analytic gradient equals a fine numerical derivative of the same height (envelope included)',()=>{
 // A linear seabed has an exact central terrain difference: only the formula is under test.
 const field=createSurfWaveField(zone,linear),h=1e-5;
 let checked=0,shallow=0;
 for(const [x,y] of grid(zone,4.3))for(const tick of [0,33,9001]){
  const s=field.sample(x,y,tick);
  if(!s||kinkBand(zone,x,y))continue;
  const hx1=field.height(x+h,y,tick),hx0=field.height(x-h,y,tick),
   hz1=field.height(x,y+h,tick),hz0=field.height(x,y-h,tick);
  if([hx1,hx0,hz1,hz0].some(v=>v===null))continue;
  const depth=zone.seaLevel-linear(x,y);
  if(depth<zone.shoreFadeDepth)shallow++;
  assert.ok(Math.abs((hx1-hx0)/(2*h)-s.gradientX)<2e-5,'dX at '+x+','+y);
  assert.ok(Math.abs((hz1-hz0)/(2*h)-s.gradientZ)<2e-5,'dZ at '+x+','+y);
  assert.ok(Math.abs(Math.hypot(s.normalX,s.normalY,s.normalZ)-1)<1e-12);
  checked++;
 }
 assert.ok(checked>1500&&shallow>50,'covered '+checked+' points, '+shallow+' in the shallow envelope');
});
test('gradient stays within V1 truncation error away from the zone corner diagonals',()=>{
 for(const ground of [shelf,linear]){
  const v2=createSurfWaveField(zone,ground),v1=createV1(zone,ground);
  let worst=0;
  for(const [x,y] of grid(zone,2.9))for(const tick of [0,90,4000]){
   const a=v2.sample(x,y,tick),b=v1.sample(x,y,tick);
   if(!a||kinkBand(zone,x,y))continue;
   // V1 replaced an out-of-zone or dry neighbour by the centre height (one-sided error).
   if([[.45,0],[-.45,0],[0,.45],[0,-.45]].some(([dx,dz])=>v1.height(x+dx,y+dz,tick)===null))continue;
   worst=Math.max(worst,Math.abs(a.gradientX-b.gradientX),Math.abs(a.gradientZ-b.gradientZ));
  }
  assert.ok(worst<.012,'max |Δgradient| '+worst);
 }
});
test('deep water costs one terrain sample, the shallow envelope at most five',()=>{
 let calls=0;const counted=(x,z)=>{calls++;return shelf(x,z);};
 const field=createSurfWaveField(zone,counted);
 let deep=0,shallow=0;
 for(const [x,y] of grid(zone,5.1)){
  calls=0;const s=field.sample(x,y,77);
  if(!s){assert.ok(calls<=1);continue;}
  const depth=zone.seaLevel-shelf(x,y);
  if(depth>=zone.shoreFadeDepth){assert.equal(calls,1);deep++;}
  else {assert.ok(calls<=5);shallow++;}
  calls=0;field.height(x,y,77);assert.equal(calls,0,"memoised seabed reused");
 }
 assert.ok(deep>100&&shallow>20);
});
test('long sessions and repeated calls stay deterministic and finite',()=>{
 const a=createSurfWaveField(zone,shelf),b=createSurfWaveField({...zone},shelf);
 for(const tick of [2**31,2**45,Number.MAX_SAFE_INTEGER-1]){
  const s=a.sample(10,-60,tick);
  assert.deepEqual(s,b.sample(10,-60,tick));
  for(const v of [s.height,s.gradientX,s.gradientZ,s.velocityY])assert.ok(Number.isFinite(v));
 }
 assert.throws(()=>a.sample(0,0,-1),/Tick/);assert.throws(()=>a.sample(0,0,1.5),/Tick/);
});
test('the exact seabed memo never changes a value and can be invalidated after edits',()=>{
 let offset=0;const mutable=(x,z)=>shelf(x,z)+offset;
 const memo=createSurfWaveField(zone,mutable);
 const r=(seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;})(5);
 for(let i=0;i<3000;i++){
  // Revisit positions often, as the 30 Hz rider does between consecutive ticks.
  const x=i%3?-20+Math.floor(r()*4)*7:-90+r()*180,y=i%3?-80:-130+r()*180,tick=i*3;
  const fresh=createSurfWaveField(zone,mutable);
  assert.deepEqual(memo.sample(x,y,tick),fresh.sample(x,y,tick));
  assert.equal(memo.height(x,y,tick),fresh.height(x,y,tick));
 }
 const before=memo.height(-20,0,5);
 offset=.4;memo.invalidateGround();
 assert.notEqual(memo.height(-20,0,5),before);
 assert.equal(memo.height(-20,0,5),createSurfWaveField(zone,mutable).height(-20,0,5));
});
