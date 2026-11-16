import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {simulatePlayer,MOTION,MAX_OXYGEN} from '../src/player.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {HamsterAnimator,GAIT_RADIANS_PER_METER} from '../src/hamster/hamster-animation.ts';
import {captureMovement,replayMovement} from '../src/physics/movement-state.ts';
import {parsePresentationState,interpolatePresentation} from '../src/hamster/presentation-state.ts';

const q=new WorldCollisionQuery(()=>0,()=>null);
const keys={forward:0,right:0,run:false,autoRun:true,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const actor=()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false,climbCooldown:1e5});
const tick=(p,n,controls={})=>{for(let i=0;i<n;i++)simulatePlayer(p,{...keys,...controls},1/30,q);};
const input=(mode='ground',speed=0,extras={})=>({mode,speed,verticalSpeed:0,turnRate:0,...extras});

test('upright run accelerates after continuous forward movement, while Shift still starts a roll',()=>{
 const p=actor();tick(p,4,{forward:1});
 assert.ok(p.velocity.z<MOTION.run,'no immediate sprint');
 tick(p,60,{forward:1});
 assert.equal(p.mode,'ground');
 assert.ok(p.velocity.z>7.7&&p.velocity.z<=MOTION.run+1e-6,'gradual upright run');
 assert.ok(p.runCharge>.99);
 tick(p,1,{forward:1,rollHeld:true,run:true});
 assert.equal(p.mode,'roll');
 tick(p,1,{forward:1});
 assert.equal(p.mode,'ground','Shift release unrolls');
 const legacy=actor();tick(legacy,90,{forward:1,autoRun:false});
 assert.ok(Math.abs(legacy.velocity.z-MOTION.walk)<.05,'older controllers keep walking target');
});

test('motion cue snapshots replay exact upright acceleration and reject invalid charge',()=>{
 const p=actor(),start=captureMovement(p,0);
 const tape=Array.from({length:65},(_,i)=>({tick:i+1,input:{...keys,forward:1,cameraYaw:i<30?0:.5}}));
 const result=replayMovement(p,start,tape,q),clone=actor();
 assert.deepEqual(replayMovement(clone,start,tape,q),result);
 assert.ok(result.state.runCharge>.9);
 assert.ok(Number.isFinite(result.state.intentYaw));
 const invalid=structuredClone(result);invalid.state.runCharge=42;
 assert.throws(()=>replayMovement(actor(),invalid,[],q),/Charge de course/);
});

test('roll jump carries its origin and landing impact without corrupting roll physics',()=>{
 const p=actor();tick(p,45,{forward:1,rollHeld:true,run:true});
 assert.equal(p.mode,'roll');
 const speed=Math.hypot(p.velocity.x,p.velocity.z);
 tick(p,1,{forward:1,rollHeld:true,run:true,jumpPressed:true});
 assert.equal(p.jumpOrigin,'roll');assert.equal(p.jumpSeq,1);
 assert.equal(p.mode,'air');
 assert.ok(Math.hypot(p.velocity.x,p.velocity.z)>=speed*.8,'horizontal momentum kept');
 for(let i=0;i<150&&p.mode!=='ground';i++)tick(p,1,{forward:1});
 assert.equal(p.mode,'ground');assert.equal(p.landingSeq,1);
 assert.ok(p.landingSpeed>0);
});

test('standing gait advances with travelled distance rather than idle frame time',()=>{
 const a=new HamsterAnimator();const moving=input('ground',3,{travel:0});
 for(let i=0;i<20;i++)a.update(moving,1/30);
 assert.equal(a.state,'WALK');const x=a.stridePhase;
 for(let i=0;i<20;i++)a.update(moving,1/30);
 assert.equal(a.stridePhase,x,'stationary collision cannot advance footprints');
 a.update({...moving,travel:.25},1/30);
 assert.ok(Math.abs(a.stridePhase-x-.25*GAIT_RADIANS_PER_METER)<1e-8);
 assert.ok(Number.isFinite(a.pose.footLX));
});

test('turn-in-place leans the torso without modifying any physical position',()=>{
 const a=new HamsterAnimator();
 for(let i=0;i<10;i++)a.update(input('ground',0,{turnIntent:1}),1/30);
 assert.equal(a.state,'IDLE');
 assert.ok(a.pose.bodyRY>.02&&Math.abs(a.pose.hipLX)>.005);
});

test('airborne rolling remains tucked and spinning until landing, then recovers',()=>{
 const a=new HamsterAnimator(),ground=input('ground',4),rolling=input('roll',8,{travel:.3});
 a.update(ground,1/30);
 for(let i=0;i<15;i++)a.update(rolling,1/30);
 const before=a.pose.roll;
 const air=input('air',8,{verticalSpeed:5,jumpKind:'roll',travel:.3});
 a.update(air,1/30);
 assert.equal(a.state,'ROLL_AIR');
 for(let i=0;i<7;i++)a.update({...air,verticalSpeed:-2},1/30);
 assert.ok(a.pose.tuck>.8);
 assert.ok(a.pose.roll>before+.5,'rotation continues in the air');
 a.update(input('ground',3,{landingSpeed:10}),1/30);
 assert.equal(a.state,'LAND');
 for(let i=0;i<15;i++)a.update(ground,1/30);
 assert.ok(a.pose.tuck<.1,'feet return after impact');
});

test('landing directly from glide has an impact pose',()=>{
 const a=new HamsterAnimator();
 a.update(input('glide',10,{verticalSpeed:-6}),1/30);
 for(let i=0;i<15;i++)a.update(input('glide',10,{verticalSpeed:-6}),1/30);
 a.update(input('ground',0,{landingSpeed:12}),1/30);
 assert.equal(a.state,'LAND');
 for(let i=0;i<3;i++)a.update(input('ground',0,{landingSpeed:12}),1/30);
 assert.ok(a.pose.squash<1,'impact compression');
});

test('optional remote presentation phases are validated and interpolated; legacy V1 stays valid',()=>{
 const base={v:1,t:0,x:0,y:0,z:0,yaw:0,mode:'roll',speed:8,verticalSpeed:0,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null};
 assert.deepEqual(parsePresentationState(base),base);
 const a={...base,stridePhase:2,rollPhase:10,turnIntent:.2,jumpKind:'roll',landingSpeed:0};
 const b={...a,t:1,stridePhase:4,rollPhase:12};
 assert.equal(interpolatePresentation(parsePresentationState(a),parsePresentationState(b),.5).rollPhase,11);
 assert.equal(interpolatePresentation(a,b,.5).stridePhase,3);
 assert.throws(()=>parsePresentationState({...base,rollPhase:Infinity}),/Cue invalide/);
 assert.throws(()=>parsePresentationState({...base,jumpKind:'flap'}),/Type de saut/);
});