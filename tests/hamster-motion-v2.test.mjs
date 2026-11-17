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

test('MV-03 — coyote jump after walking off a cliff preserves the motor jump and expires',()=>{
 const edge=new WorldCollisionQuery((_x,z)=>z<1?0:-12,()=>null);
 const p=actor();p.position.z=.5;p.velocity.z=7;
 for(let i=0;i<25&&p.mode!=='air';i++)simulatePlayer(p,{...keys,forward:1,jumpAssist:true},1/30,edge);
 assert.equal(p.mode,'air','left the edge');
 assert.ok((p.coyoteLeft??0)>0,'last grounded support grants a short grace window');
 simulatePlayer(p,{...keys,forward:1,jumpAssist:true,jumpPressed:true},1/30,edge);
 assert.equal(p.mode,'air');assert.equal(p.jumpSeq,1);assert.ok(p.velocity.y>4);
 assert.ok((p.coyoteLeft??0)===0,'coyote consumed');
 const late=actor();late.position.z=.5;late.velocity.z=7;
 for(let i=0;i<18;i++)simulatePlayer(late,{...keys,forward:1,jumpAssist:true},1/30,edge);
 assert.equal(late.mode,'air');
 simulatePlayer(late,{...keys,jumpAssist:true,jumpPressed:true},1/30,edge);
 assert.equal(late.jumpSeq,undefined,'no late coyote motor jump');
});

test('MV-03 — short press just before landing buffers jump instead of opening glider',()=>{
 const p=actor();p.mode='air';p.position.y=.55;p.velocity.y=-6;p.glideReady=true;
 simulatePlayer(p,{...keys,jumpAssist:true,jumpPressed:true},1/30,q);
 assert.equal(p.mode,'air','not a near-ground glide toggle');
 assert.ok((p.jumpBufferLeft??0)>0,'input retained for the approaching landing');
 for(let i=0;i<25&&!p.jumpSeq;i++)simulatePlayer(p,{...keys,jumpAssist:true},1/30,q);
 assert.equal(p.jumpSeq,1,'one takeoff following the physical landing');
 assert.equal(p.mode,'air');assert.ok(p.velocity.y>0);
 assert.equal(p.jumpBufferLeft,0,'buffer consumed exactly once');
 assert.equal(p.landingSeq,1);
});

test('MV-03 — second Space above the floor still deploys the glider',()=>{
 const p=actor();
 simulatePlayer(p,{...keys,jumpAssist:true,jumpPressed:true},1/30,q);
 assert.equal(p.mode,'air');assert.equal(p.jumpSeq,1);
 simulatePlayer(p,{...keys,jumpAssist:true},1/30,q);
 simulatePlayer(p,{...keys,jumpAssist:true,jumpPressed:true},1/30,q);
 assert.equal(p.mode,'glide');assert.equal(p.jumpSeq,1,'deploy does not jump again');
});

test('MV-03 — buffered input never jumps out of deep water or from a teleport',()=>{
 const water=new WorldCollisionQuery(()=>-2,()=>0),p=actor();
 p.mode='air';p.position.y=.2;p.velocity.y=-4;p.glideReady=true;
 simulatePlayer(p,{...keys,jumpAssist:true,jumpPressed:true},1/30,water);
 assert.equal(p.mode,'swim');
 assert.equal(p.jumpSeq,undefined,'no ground jump on water contact');
 const tr=actor();tr.jumpBufferLeft=.12;tr.coyoteLeft=.1;
 // A transition into a mine must clear stale jump forgiveness.
 const port=new WorldCollisionQuery(()=>0,()=>null);
 port.addTransition({id:'entry',from:null,to:{zoneId:'cave',levelId:'l0'},minX:-1,maxX:1,minZ:-1,maxZ:1,minY:-1,maxY:3,arrival:{x:0,y:1,z:2}});
 simulatePlayer(tr,{...keys,jumpAssist:true},1/30,port);
 assert.equal(tr.jumpBufferLeft,0);assert.equal(tr.coyoteLeft,0);
});

test('MV-06 — low grip creates stronger signed skid cue, animations bank without changing velocity',()=>{
 const make=material=>{
  const world=new WorldCollisionQuery(()=>0,()=>null);world.setMaterialSampler(()=>material);
  const p=actor();p.mode='roll';p.velocity.z=9;
  simulatePlayer(p,{...keys,forward:0,right:1,jumpAssist:true},1/30,world);
  return p;
 };
 const grass=make('grass'),mud=make('mud');
 assert.ok(Math.abs(mud.rollSlip)>Math.abs(grass.rollSlip),'mud should have more visible residual steering');
 assert.ok(Math.abs(mud.rollSlip)<=1);
 const neutral=new HamsterAnimator(),skidding=new HamsterAnimator();
 for(let i=0;i<20;i++){
  neutral.update(input('roll',8,{travel:.25,rollSlip:0}),1/30);
  skidding.update(input('roll',8,{travel:.25,rollSlip:.85}),1/30);
 }
 assert.ok(skidding.pose.bodyRZ-neutral.pose.bodyRZ>.1,'cosmetic lean from skid');
});

test('terrain foot tilt is bounded and absent on bridges; two feet compensate independently',()=>{
 const ramp=new WorldCollisionQuery((x,z)=>x*.12+z*.22,()=>null);
 const p=actor();
 for(let i=0;i<12;i++)simulatePlayer(p,{...keys,forward:1},1/30,ramp);
 assert.ok(p.groundPitch>.1&&p.groundPitch<.4,'forward grade detected');
 assert.ok(p.groundRoll>.05,'cross-slope detected');
 const a=new HamsterAnimator();
 for(let i=0;i<10;i++)a.update(input('ground',3,{groundPitch:p.groundPitch,groundRoll:p.groundRoll}),1/30);
 assert.ok(a.pose.footRY>a.pose.footLY,'higher foot is lifted on cross-slope');
 assert.ok(a.pose.footLX>0,'ankles counter terrain pitch');
 const deck=new WorldCollisionQuery((x,z)=>x*.12+z*.22,()=>null);
 deck.add({id:'deck',shape:'box',position:{x:0,y:9,z:0},size:{x:20,y:1,z:20},enabled:()=>true});
 const upper=actor();upper.position.y=10;
 simulatePlayer(upper,keys,1/30,deck);
 assert.equal(upper.groundPitch,0,'bridge contact never copies underlying terrain pitch');
 assert.equal(upper.groundRoll,0);
});

test('assist replay preserves timers and validates malformed optional snapshots and inputs',()=>{
 const p=actor();p.coyoteLeft=.08;p.coyoteFrom='roll';p.jumpBufferLeft=.09;
 p.groundPitch=.2;p.groundRoll=-.1;p.rollSlip=.6;
 const snap=captureMovement(p,0),copy=actor();
 assert.deepEqual(replayMovement(copy,snap,[],q),snap);
 for(const [field,value] of [['coyoteLeft',.9],['jumpBufferLeft',-1],['rollSlip',2],['coyoteFrom','glide']]){
  const bad=structuredClone(snap);bad.state[field]=value;
  assert.throws(()=>replayMovement(actor(),bad,[],q),'reject '+field);
 }
 assert.throws(()=>replayMovement(actor(),snap,[{tick:1,input:{...keys,jumpAssist:'yes'}}],q),/Commande de mouvement/);
 const raw={v:1,t:0,x:0,y:0,z:0,yaw:0,mode:'roll',speed:8,verticalSpeed:0,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null,rollSlip:.6,groundPitch:.15,groundRoll:.2};
 assert.deepEqual(parsePresentationState(raw),raw);
 assert.equal(interpolatePresentation({...raw,t:0,rollSlip:0},{...raw,t:1,rollSlip:.6},.5).rollSlip,.3);
 assert.throws(()=>parsePresentationState({...raw,rollSlip:NaN}),/Cue de surface/);
});

test('landing after a rolling jump has a distinct, self-recovering ball contact pose',()=>{
 const p=actor();p.mode='roll';p.position.y=.02;p.velocity.set(0,0,8);
 simulatePlayer(p,{...keys,jumpPressed:true,rollHeld:true},1/30,q);
 assert.equal(p.jumpOrigin,'roll');assert.equal(p.mode,'air');
 for(let i=0;i<100&&p.mode!=='ground';i++)simulatePlayer(p,{...keys},1/30,q);
 assert.equal(p.mode,'ground');assert.equal(p.landingKind,'roll');
 assert.ok(p.landingSlide>=0&&p.landingSlide<=1);
 const a=new HamsterAnimator();
 a.update(input('roll',8,{travel:.3}),1/30);
 for(let i=0;i<10;i++)a.update(input('air',8,{jumpKind:'roll',travel:.2,verticalSpeed:-3}),1/30);
 a.update(input('ground',8,{landingKind:'roll',landingSpeed:7,landingSlide:p.landingSlide,landingSeq:1}),1/30);
 assert.equal(a.state,'ROLL_LAND');
 let last=a.pose.tuck;
 for(let i=0;i<12;i++)a.update(input('ground',4,{landingKind:'roll',landingSpeed:7,landingSlide:p.landingSlide,landingSeq:1}),1/30);
 assert.ok(a.pose.tuck<last,'tuck decreases as the hamster recovers');
 assert.ok(a.state==='WALK'||a.state==='IDLE','recovery ends without changing the physical mode');
});

test('glide and high-speed landings expose contextual visual slide without changing physical braking',()=>{
 const world=new WorldCollisionQuery(()=>0,()=>null);world.setMaterialSampler(()=> 'grass');
 const p=actor();p.mode='glide';p.glideReady=true;p.position.y=.15;p.velocity.set(0,-10,11);
 for(let i=0;i<50&&p.mode!=='ground';i++)simulatePlayer(p,{...keys},1/30,world);
 assert.equal(p.mode,'ground');assert.equal(p.landingKind,'glide');
 assert.ok(p.landingSpeed>0);
 assert.ok(p.landingSlide>0,'visual recovery based on impact and horizontal speed');
 const grass=actor(),sand=actor();
 grass.mode=sand.mode='air';grass.position.y=sand.position.y=.1;
 grass.velocity.set(0,-8,9);sand.velocity.set(0,-8,9);
 const sandWorld=new WorldCollisionQuery(()=>0,()=>null);sandWorld.setMaterialSampler(()=> 'sand');
 simulatePlayer(grass,{...keys},1/30,world);
 simulatePlayer(sand,{...keys},1/30,sandWorld);
 assert.equal(grass.mode,'ground');assert.equal(sand.mode,'ground');
 assert.ok(grass.landingSlide>sand.landingSlide,'surface friction attenuates cosmetic slide');
 assert.ok(Math.abs(grass.velocity.z-sand.velocity.z)<1e-9,'visual slide does not apply any braking force');
 const a=new HamsterAnimator(),b=new HamsterAnimator();
 for(let i=0;i<10;i++){
  a.update(input('air',9,{verticalSpeed:-6}),1/30);
  b.update(input('air',9,{verticalSpeed:-6}),1/30);
 }
 for(let i=0;i<4;i++){
  a.update(input('ground',9,{landingKind:'glide',landingSlide:1,landingSpeed:12}),1/30);
  b.update(input('ground',9,{landingKind:'idle',landingSlide:0,landingSpeed:12}),1/30);
 }
 assert.equal(a.state,'LAND');
 assert.ok(a.pose.bodyRX>b.pose.bodyRX+.05,'gliding skid visibly tilts the body');
});

test('different foot support on a raised narrow block uses only two local obstacle contact queries',()=>{
 const world=new WorldCollisionQuery(()=>0,()=>null);
 world.add({id:'narrow-step',shape:'box',position:{x:.29,y:0,z:0},size:{x:.4,y:.3,z:2},enabled:()=>true});
 const p=actor();p.position.set(0,.3,0);p.heading=0;
 simulatePlayer(p,{...keys},1/30,world);
 assert.equal(p.mode,'ground');
 assert.ok(p.footSupportLeft!==undefined&&p.footSupportRight!==undefined);
 assert.ok(p.footSupportLeft<-.14,'left foot is above the lower ground');
 assert.ok(Math.abs(p.footSupportRight)<.05,'right foot is supported on the small block');
 const a=new HamsterAnimator();
 for(let i=0;i<12;i++)a.update(input('ground',0,{footSupportLeft:p.footSupportLeft/.72,footSupportRight:p.footSupportRight/.72}),1/30);
 assert.ok(a.pose.footLY<a.pose.footRY-.10,'procedural left paw drops below right');
 const flat=actor();flat.position.set(-3,0,0);simulatePlayer(flat,{...keys},1/30,world);
 assert.equal(flat.footSupportLeft,undefined,'no extra foot samples for non-raised support');
});

test('V1 remote packets and deterministic replay include optional landing and foot data',()=>{
 const packet={v:1,t:0,x:0,y:0,z:0,yaw:0,mode:'ground',speed:4,verticalSpeed:0,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null,
  landingKind:'roll',landingSlide:.7,footSupportLeft:-.2,footSupportRight:.03};
 assert.deepEqual(parsePresentationState(packet),packet);
 const later={...packet,t:1,landingSlide:.3,footSupportLeft:0};
 const mid=interpolatePresentation(packet,later,.5);
 assert.ok(Math.abs(mid.footSupportLeft+.1)<1e-9);
 assert.equal(mid.landingKind,'roll');
 for(const bad of [{landingSlide:-.1},{landingSlide:1.2},{landingKind:'hover'},{footSupportLeft:-2}]){
  assert.throws(()=>parsePresentationState({...packet,...bad}));
 }
 const p=actor();p.landingKind='glide';p.landingSlide=.9;p.footSupportLeft=-.2;p.footSupportRight=.02;
 const snap=captureMovement(p,0);
 assert.deepEqual(replayMovement(actor(),snap,[],q),snap,'replay snapshot preserves cues');
 const corrupt=structuredClone(snap);corrupt.state.footSupportLeft=3;
 assert.throws(()=>replayMovement(actor(),corrupt,[],q),/Appui pied invalide/);
});
