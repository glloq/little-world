import test from 'node:test';
import assert from 'node:assert/strict';
import {stepSnowSlide} from '../src/snow/snow-slide.ts';
import {validatePiste,findDemoPiste} from '../src/snow/snow-pistes.ts';
import {boardLift,liftRideStep,liftLength,seatCount,seatPosition,validateLift} from '../src/snow/ski-lift.ts';

const downhill=(x,z)=>120-z*.2;
function actor(){return {position:{x:0,y:100,z:0},velocity:{x:0,y:0,z:0}};}
const neutral={right:0,forward:0,brake:false,cameraYaw:0};
function run(actor,inputs,steps=90,material='snow',equipment='snowboard'){
 for(let i=0;i<steps;i++){
  stepSnowSlide(actor,inputs,downhill,material,equipment,1/30);
  actor.position.x+=actor.velocity.x/30;actor.position.z+=actor.velocity.z/30;
 }
}
test('snowboard accelerates downhill without forward thrust',()=>{
 const p=actor();run(p,neutral);assert.ok(p.velocity.z>2,p.velocity.z);
 assert.ok(Number.isFinite(p.position.z));
});
test('groomed snow glides faster than natural snow while ice stays faster and braking still works',()=>{
 const powder=actor(),groomed=actor(),ice=actor();
 run(powder,neutral);run(groomed,neutral,90,'groomed');run(ice,neutral,90,'ice');
 assert.ok(groomed.velocity.z>powder.velocity.z);
 assert.ok(ice.velocity.z>groomed.velocity.z);
 const v=powder.velocity.z;run(powder,{...neutral,forward:-1,brake:true},30);
 assert.ok(Math.hypot(powder.velocity.x,powder.velocity.z)<v);
});
test('steering changes downhill heading but never exceeds speed cap',()=>{
 const p=actor();run(p,neutral,120);run(p,{...neutral,right:1},180);
 assert.ok(p.velocity.x<0);assert.ok(Math.hypot(p.velocity.x,p.velocity.z)<=26+1e-6);
});
test('piste inspection rejects cliffs and accepts a continuous descent',()=>{
 const uphill=validatePiste([{x:0,z:120},{x:0,z:0}],8,downhill);
 assert.equal(uphill.ok,false); // uphill start, drop is negative
 const valid=validatePiste([{x:0,z:0},{x:0,z:120}],8,downhill,{minDrop:20});
 assert.equal(valid.ok,true,valid.diagnostics.join('; '));
 const cliff=validatePiste([{x:0,z:0},{x:0,z:120}],8,(_,z)=>120-z*2,{minDrop:0});
 assert.equal(cliff.ok,false);
});
test('demo piste handles maps without mountains',()=>{
 assert.equal(findDemoPiste(()=>3,{minX:-100,maxX:100,minZ:-100,maxZ:100},0),null);
});
const lift={id:'demo',path:[{x:0,y:20,z:0},{x:0,y:35,z:60},{x:0,y:70,z:180}],speed:2.5,seatSpacing:14,capacity:2};
test('chairlift seats are deterministic and bounded',()=>{
 validateLift(lift);assert.ok(liftLength(lift)>180);assert.ok(seatCount(lift)>5);
 const a=seatPosition(lift,7.5,1),b=seatPosition(lift,7.5,1);
 assert.deepEqual(a,b);
});
test('boarding queues a seat and disembarks at upper station',()=>{
 const ride=boardLift(lift,{x:1,y:20,z:1},10);
 assert.ok(ride);
 const waiting=liftRideStep(lift,ride,ride.boardAt-.01);
 assert.equal(waiting.pose,null);assert.equal(ride.phase,'waiting');
 const moving=liftRideStep(lift,ride,ride.boardAt+2);
 assert.equal(ride.phase,'riding');assert.ok(moving.pose.y>17);
 const top=liftRideStep(lift,ride,ride.boardAt+liftLength(lift)/lift.speed+1);
 assert.equal(top.finished,true);assert.equal(ride.phase,'finished');
});
test('boarding impossible away from the lower station',()=>{
 assert.equal(boardLift(lift,{x:50,y:20,z:0},0),null);
});
