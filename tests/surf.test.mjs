import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfWaveField,validateSurfZone} from '../src/surf/wave-field.ts';
import {stepSurf,SURF_MOTION} from '../src/surf/surf-controller.ts';
import {createSurfFeatureState,stepSurfFeatures,surfFeatureCrossed,validateSurfFeature} from '../src/surf/surf-features.ts';
import {findDemoSurfSite} from '../src/surf/surf-demo.ts';
import {SURF_ITEMS,SURFBOARD_ID} from '../src/surf/surf-items.ts';
import {makeDemoSurfRace} from '../src/surf/surf-race-demo.ts';
import {advanceRace,beginRace} from '../src/gameplay/races.ts';
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

test('boost and jump ramp trigger only on the 30 Hz gameplay tick and respect cooldown',()=>{
 const f={id:'surf-feature:boost',kind:'boost',x:0,z:0,dirX:0,dirZ:1,radius:3,power:5,cooldownTicks:150};
 const ramp={...f,id:'surf-feature:ramp',kind:'ramp',power:1.5};
 assert.equal(validateSurfFeature(f),f);
 const state=createSurfFeatureState(),p={position:{x:0,y:.1,z:0},velocity:{x:0,y:0,z:5},mode:'surf',surfStage:'ride'};
 assert.equal(stepSurfFeatures(p,[f],state,1)[0].kind,'boost');
 assert.ok(p.velocity.z>9);
 assert.equal(stepSurfFeatures(p,[f],state,2).length,0);
 assert.equal(stepSurfFeatures(p,[ramp],state,3)[0].kind,'ramp');
 assert.equal(p.mode,'air');assert.equal(p.surfAirborne,true);assert.ok(p.velocity.y>0);
});
test('surf race uses existing checkpoint timer, checks airborne origin',()=>{
 const demo={zone,start:{x:0,z:-120},heading:0};
 const race=makeDemoSurfRace(demo,'surf-fixture');
 assert.equal(race.kind,'surf');assert.equal(race.gates.length,4);
 const session=beginRace(race,0);
 const gate=race.gates[0],before={x:gate.center.x,y:gate.center.y,z:gate.center.z-1},after={...before,z:gate.center.z+1};
 assert.equal(advanceRace(session,{tick:1,previous:before,position:after,mode:'surf',pulseSeq:0}).kind,'started');
 const other=beginRace(race,0);
 assert.equal(advanceRace(other,{tick:1,previous:before,position:after,mode:'air',pulseSeq:0}).kind,'failed');
});

test('fast surfers cross boost circles between fixed ticks without tunnelling',()=>{
 const boost={id:'surf-feature:swept',kind:'boost',x:0,z:0,dirX:0,dirZ:1,radius:.75,power:4,cooldownTicks:60};
 const before={x:0,z:-6},after={x:0,z:6};
 assert.ok(surfFeatureCrossed(before,after,boost));
 const p={position:{x:after.x,y:.12,z:after.z},velocity:{x:0,y:0,z:8},mode:'surf',surfStage:'ride'};
 const state=createSurfFeatureState();
 assert.deepEqual(stepSurfFeatures(p,[boost],state,1,before,0).map(e=>e.kind),['boost']);
 assert.ok(p.velocity.z>8);
});
test('boost activation requires leaving and reentering even after cooldown',()=>{
 const boost={id:'surf-feature:latch',kind:'boost',x:0,z:0,dirX:0,dirZ:1,radius:3,power:5,cooldownTicks:3};
 const p={position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:5},mode:'surf',surfStage:'ride'};
 const state=createSurfFeatureState();
 assert.equal(stepSurfFeatures(p,[boost],state,1).length,1);
 assert.equal(stepSurfFeatures(p,[boost],state,100).length,0);
 p.position.x=5;
 assert.equal(stepSurfFeatures(p,[boost],state,101).length,0);
 p.position.x=0;
 assert.equal(stepSurfFeatures(p,[boost],state,102).length,1);
});
test('floating obstacles ignore high flights above them',()=>{
 const boost={id:'surf-feature:high',kind:'boost',x:0,z:0,dirX:0,dirZ:1,radius:4,power:10,cooldownTicks:5};
 const p={position:{x:0,y:6,z:0},velocity:{x:0,y:0,z:3},mode:'surf',surfStage:'ride'};
 assert.equal(stepSurfFeatures(p,[boost],createSurfFeatureState(),4,undefined,0).length,0);
});
test('demo surf finder locates ocean within island bounds',()=>{
 const site=findDemoSurfSite((_,z)=>z<0?4:-9,{minX:-700,maxX:700,minZ:-700,maxZ:700},0,11);
 assert.ok(site,'site in offshore band');
 assert.ok(site.start.z<0,'start in deep water');
 assert.ok(site.zone.minZ>=-700&&site.zone.maxZ<=700);
 assert.ok(site.zone.dirZ>0,'waves approach the positive-z coast');
});
test('the starter surfboard uses the existing tool equipment category',()=>{
 assert.equal(SURFBOARD_ID,'tool:surfboard');
 assert.equal(SURF_ITEMS[0].id,SURFBOARD_ID);
 assert.equal(SURF_ITEMS[0].category,'tool');
});
