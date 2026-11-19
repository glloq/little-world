import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {barrelCrestAlong,barrelPeel,nearestBarrelCrest,sampleSurfBarrel,stepSurfBarrel} from '../src/surf/surf-barrel.ts';
import {stepBarrelWash} from '../src/surf/barrel-wash.ts';
import {SURF_WAVE_SHAPES} from '../src/surf/wave-shape.ts';

const base={id:'surf:peel-test',minX:-120,maxX:120,minZ:-80,maxZ:80,dirX:0,dirZ:1,seaLevel:0,
 amplitude:1.45,wavelength:36,speed:6.3,seed:11,shoreFadeDepth:3,edgeFade:9,barrelStrength:1};
const zone={...base,style:'tubular'};
const ground=(_,z)=>z*.1-3;
const field=createSurfWaveField(zone,ground);
const peel=SURF_WAVE_SHAPES.tubular.peel;
// across = -x for dirZ=1: lateral position along the crest line.
function openPoint(n,tick){
 // Scan the crest for the middle of the open section.
 for(let x=-110;x<=110;x+=.25){
  const s=barrelPeel(zone,x,barrelCrestAlong(zone,tick,n),tick,n);
  if(s.state==='open'&&Math.abs(s.ahead+peel.open/2)<.2)return x;
 }
 return null;
}
const rider=(x,z,vx)=>({position:{x,y:(field.height(x,z,0)??0)+.12,z},velocity:{x:vx,y:0,z:6.3},mode:'surf',surfStage:'ride'});

test('classic zones keep a full-width tube and the peel is opt-in by style',()=>{
 const classic={...base};
 assert.deepEqual(barrelPeel(classic,3,4,100,2),{factor:1,state:'none',ahead:0,sign:1,speed:0});
 for(const style of ['classic','gentle','long'])assert.equal(SURF_WAVE_SHAPES[style].peel,null);
 for(const style of ['fast','powerful','tubular','shorebreak']){
  const p=SURF_WAVE_SHAPES[style].peel;
  assert.ok(p.speed>2.5&&p.speed<8,'a rider can follow the peel');
  assert.ok(p.shoulder+p.open+p.collapse<p.period,'one break per period');
 }
});
test('the breaking point travels along the crest at the peel speed, deterministically',()=>{
 const x=0,z=barrelCrestAlong(zone,0,0);
 const a=barrelPeel(zone,x,z,0,0),b=barrelPeel(zone,x,z,30,0);
 const moved=((a.ahead-b.ahead)%peel.period+peel.period)%peel.period;
 assert.ok(Math.abs(moved-peel.speed)<1e-9,'moved '+moved);
 assert.deepEqual(barrelPeel(zone,x,z,123456789,7),barrelPeel({...zone},x,z,123456789,7));
 const far=barrelPeel(zone,x,z,Number.MAX_SAFE_INTEGER-1,-9e7);
 assert.ok(Number.isFinite(far.ahead)&&far.factor>=0&&far.factor<=1);
 // Different crests break from different places.
 assert.notEqual(barrelPeel(zone,x,z,0,0).ahead,barrelPeel(zone,x,z,0,1).ahead);
});
test('a rider racing slightly faster than the peel completes the tube',()=>{
 const n=nearestBarrelCrest(zone,0,0,0).index;
 const x0=openPoint(n,0);assert.notEqual(x0,null);
 const sign=barrelPeel(zone,x0,0,0,n).sign;
 const vx=-sign*(peel.speed+2); // across=-x: moving +sign along across means -sign along x
 const p=rider(x0,barrelCrestAlong(zone,0,n),vx);
 assert.equal(stepSurfBarrel(p,field,ground,0),'entered');
 let event='none',tick=0;
 while(event==='none'&&tick<40){tick++;p.position.x+=vx/30;p.position.z=barrelCrestAlong(zone,tick,n);event=stepSurfBarrel(p,field,ground,tick);}
 assert.equal(event,'escaped','after '+tick+' ticks');
 assert.equal(p.barrelSuccessSeq,1);assert.equal(p.mode,'surf');
});
test('riding against the peel is caught by the collapsing section',()=>{
 const n=nearestBarrelCrest(zone,0,0,0).index;
 const x0=openPoint(n,0),sign=barrelPeel(zone,x0,0,0,n).sign;
 const vx=sign*3; // toward the whitewater, too slow to cross the closing section
 const p=rider(x0,barrelCrestAlong(zone,0,n),vx);
 assert.equal(stepSurfBarrel(p,field,ground,0),'entered');
 let event='none',tick=0;
 while(event==='none'&&tick<60){tick++;p.position.x+=vx/30;p.position.z=barrelCrestAlong(zone,tick,n);event=stepSurfBarrel(p,field,ground,tick);}
 assert.equal(event,'closed');assert.equal(p.mode,'swim');assert.equal(p.barrelCrashSeq,1);
});
test('the 3D clearance follows the peel: open > shoulder edge > whitewater',()=>{
 const n=nearestBarrelCrest(zone,0,0,0).index,z=barrelCrestAlong(zone,0,n),x0=openPoint(n,0);
 const sign=barrelPeel(zone,x0,z,0,n).sign;
 const open=sampleSurfBarrel(field,ground,x0,z,0);
 const shoulder=sampleSurfBarrel(field,ground,x0-sign*(peel.open/2+peel.shoulder*.8),z,0);
 const white=sampleSurfBarrel(field,ground,x0+sign*(peel.open/2+peel.collapse+2),z,0);
 assert.equal(open.peel,'open');assert.equal(shoulder.peel,'shoulder');assert.equal(white.peel,'collapse');
 assert.ok(open.clearance>1.74);
 assert.ok(shoulder.clearance<open.clearance&&white.clearance<.05);
});
test('a swimmer on the unbroken shoulder is not washed, whitewater behind the break is',()=>{
 const n=nearestBarrelCrest(zone,0,0,0).index,z=barrelCrestAlong(zone,0,n),x0=openPoint(n,0);
 const sign=barrelPeel(zone,x0,z,0,n).sign;
 const swimmer=x=>({position:{x,y:-.4,z},velocity:{x:0,y:0,z:0},mode:'swim',diving:false});
 assert.equal(stepBarrelWash(swimmer(x0-sign*(peel.open/2+peel.shoulder*.6)),field,ground,0,1/30).caught,false);
 assert.equal(stepBarrelWash(swimmer(x0+sign*(peel.open/2+3)),field,ground,0,1/30).caught,true);
});
test('stalling at the peel speed inside a shallowing tube ends in a closure, not a reward',()=>{
 const n=nearestBarrelCrest(zone,0,0,0).index,x0=openPoint(n,0),sign=barrelPeel(zone,x0,0,0,n).sign;
 const vx=-sign*peel.speed,p=rider(x0,barrelCrestAlong(zone,0,n),vx);
 assert.equal(stepSurfBarrel(p,field,ground,0),'entered');
 let event='none',tick=0;
 while(event==='none'&&tick<80){tick++;p.position.x+=vx/30;p.position.z=barrelCrestAlong(zone,tick,n);event=stepSurfBarrel(p,field,ground,tick);}
 assert.equal(event,'closed');assert.equal(p.barrelSuccessSeq??0,0);
});
