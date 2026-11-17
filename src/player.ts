import {MOTION,ROLL,GLIDE_DEPLOY,groundVelocity,airVelocity,glideVelocity,glideSteeringYaw,glideDeploymentStep,SURFACE_MOTION,angleDelta,type GroundMaterial} from './physics/motion.ts';
export {ROLL,GLIDE,MOTION,SURFACE_MOTION} from './physics/motion.ts';
import {GAS,gasBoostStep,gasMastery,gasShots} from './physics/gas-propulsion.ts';
import {DEFAULT_BODY,type WorldCollisionQuery,type MovementSpace,type BodyDimensions} from './physics/collision-world.ts';
import * as THREE from 'three';
import {
  clamp,
  getTerrainConfig,
  insideWorld,
  terrainHeight,
  waterSurface,
} from './terrain.ts';

export const MOTION_MODES = ['ground', 'air', 'glide', 'swim', 'dive', 'climb', 'roll'] as const;
export type MotionMode = (typeof MOTION_MODES)[number];
export interface Controls {
  forward: number;
  right: number;
  run: boolean;
  /** Opt-in gradual upright run; Shift remains the roll control. */
  autoRun?: boolean;
  /** Opt-in coyote time and landing jump buffer; legacy callers retain their input semantics. */
  jumpAssist?: boolean;
  jumpPressed: boolean;
  /** Roll toggle pressed this step (hamster ball mode). Optional for older callers. */
  rollPressed?: boolean;
  /** Sprint key held (Shift): the hamster rolls into a ball to go fast while it moves on the
   * ground, and unrolls when the key is released. Optional for older callers. */
  rollHeld?: boolean;
  spaceHeld: boolean;
  dive: boolean;
  cameraYaw: number;
  /** Camera pitch relative to the default view (rad, positive = looking down): underwater, moving
   * forward follows it (looking down dives down). Flight controls are independent of the camera. */
  cameraPitch?: number;
  /** Pulse boost via Shift or the separate mobile Boost control; glide only. */boostHeld?:boolean;
  /** One mobile swim stroke (edge-triggered), leaving PC Space dive unchanged. */swimStrokePressed?:boolean;
}
export interface Player {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mode: MotionMode;
  oxygen: number;
  glideReady: boolean;
  space?:MovementSpace;
  /** Collision body (radius, height, step, max slope); default walker when absent. */
  body?:Partial<BodyDimensions>;
  /** Id of the transition crossed during the last step (camera/interpolation reset). */
  transitioned?:string;
  /** Climbing endurance (0…MAX_STAMINA); absent = full. */
  stamina?:number;
  /** Seconds before the wall can be grabbed again (after a jump-off or exhaustion). */
  climbCooldown?:number;
  /** Uphill direction of the climbed slope (unit XZ), used for facing. */
  climbDir?:{x:number;z:number};
  /** Roll (ball mode): forward speed (m/s), heading (rad, 0 = +Z) and idle time (s). */
  rollSpeed?:number;rollHeading?:number;rollIdle?:number;
  /** Diving toggled with Space in the water (second press, oxygen out or reaching the surface ends it). */
  diving?:boolean;
  /** Initial descent of a dive (until fully under water). */
  diveSink?:boolean;
  /** True when the ball was entered by holding the sprint key (released → back on the paws). */
  rollByHold?:boolean;
  /** Physical facing, retained at rest; render smoothing never writes it. */
  heading?:number;
  /** Desired ground direction for responsive turn animation (independent of camera rendering). */
  intentYaw?:number;
  /** Duration of uninterrupted forward movement, for upright auto-acceleration (0..1). */
  runCharge?:number;
  /** Take-off origin, impact speed and event counters: visual cues, not gameplay authority. */
  jumpOrigin?:'idle'|'run'|'roll';jumpSeq?:number;
  landingSpeed?:number;landingSeq?:number;
  /** Landing type and normalized slide are presentation-only. */
  landingKind?:'idle'|'run'|'roll'|'glide';landingSlide?:number;
  /** Local near-body foot support offsets (metres), optional on a 3D platform. */
  footSupportLeft?:number;footSupportRight?:number;
  /** Saved tick-based jump forgiveness state. No visual state can mutate it. */
  coyoteLeft?:number;coyoteFrom?:'idle'|'run'|'roll';jumpBufferLeft?:number;
  swimStrokeClock?:number;swimStrokeSeq?:number;
  /** Lightweight presentation cues: surface pitch/roll and roll steering residual. */
  groundPitch?:number;groundRoll?:number;rollSlip?:number;
  /** Replayable flight intention/state; independent from the render camera. */
  glideHeading?:number;glidePitch?:number;glideTurnRate?:number;stalled?:boolean;
  /** First deployment per take-off, persisted in deterministic replay. */
  glideDeploymentUsed?:boolean;glideDeploymentRemaining?:number;
  /** Fixed-step airborne secondary jump and charge for intentional stationary gas launch. */
  airBoostUsed?:boolean;groundBoostCharge?:number;
  /** Fuel and visual event sequence owned by simulation. */
  gasReserve?:number;gasCapacityLevel?:number;gasPowerLevel?:number;gasControlLevel?:number;
  gasBoosting?:boolean;gasPulseSeq?:number;gasPulseClock?:number;gasThrust?:number;
  gasPulseRemaining?:number;gasCooldown?:number;gasBoostHeld?:boolean;gasRepeatArmed?:boolean;
}
/** Swimming tuning: depth of the feet under the water line while swimming (body centre ≈ at the
 * surface, head out), dive speed (normal / Shift) and the push down when diving with Space. */
export const SWIM={sink:.48,dive:2.6,diveRun:3.6,divePush:2.4,diveDepth:1} as const;
export const MAX_OXYGEN = 90;
export const MAX_STAMINA = 100;
/** Input forgiveness calibrated for 30 Hz; only enabled when jumpAssist is true. */
export const JUMP_ASSIST={coyote:.10,buffer:.13,nearLanding:.65,maxPrediction:1.4} as const;
/** Boost carries the hamster upwards instead of driving it into the ground. */
export const BOOST_LIFT={stationaryHold:.35,launchVy:7.5,airVy:6.2,glideVy:5.5,airThrustVertical:.55} as const;
/** Climbing tuning: vertical gain while pushing up, lateral speed, stamina use per second. */
export const CLIMB={up:1.8,side:1.4,drainMove:11,drainHang:4,regen:28,minStart:12,grabReach:1.5} as const;
/** Uphill gradient of the outdoor relief at (x,z): slope ratio and unit direction. */
export function reliefGradient(x:number,z:number,h:(x:number,z:number)=>number=terrainHeight,e=.5){const gx=(h(x+e,z)-h(x-e,z))/(2*e),gz=(h(x,z+e)-h(x,z-e))/(2*e),slope=Math.hypot(gx,gz);return {slope,x:slope>1e-6?gx/slope:0,z:slope>1e-6?gz/slope:0};}
export function spawnPlayer(): Player {
  const x = -24,
    z = -183;
  return {
    position: new THREE.Vector3(x, terrainHeight(x, z) + 0.02, z),
    velocity: new THREE.Vector3(),
    mode: 'ground',
    oxygen: MAX_OXYGEN,
    glideReady: false,
    glideDeploymentUsed:false,glideDeploymentRemaining:0,airBoostUsed:false,groundBoostCharge:0,
    gasReserve:GAS.initial,gasCapacityLevel:0,gasPowerLevel:0,gasControlLevel:0,
    gasBoosting:false,gasPulseSeq:0,gasPulseClock:0,gasThrust:0,
    gasPulseRemaining:0,gasCooldown:0,gasBoostHeld:false,gasRepeatArmed:false,
  };
}

export function simulatePlayer(p: Player, keys: Controls, dt: number,collision?:WorldCollisionQuery): void {
  if(!Number.isFinite(dt)||dt<=0||dt>.25)throw Error('Pas de mouvement invalide');
  const { position: pos, velocity: v } = p;
  const oldMode = p.mode;
  let gasTicked=false;
  // Record the contact before a collision resets vertical velocity; never change momentum.
  const recordLanding=()=>{
    const horizontal=Math.hypot(v.x,v.z),impact=Math.max(0,-v.y);
    const material=collision?.materialAt(pos,p.space)??'grass',surface=SURFACE_MOTION[material];
    p.landingKind=oldMode==='glide'||p.mode==='glide'?'glide':p.jumpOrigin==='roll'?'roll':horizontal>MOTION.walk*.9?'run':'idle';
    p.landingSpeed=impact;
    p.landingSlide=clamp(((horizontal-3)*.12+(impact-5)*.025)*(1.25-.17*surface.friction),0,1);
    p.landingSeq=(p.landingSeq??0)+1;
    p.glideDeploymentUsed=false;p.glideDeploymentRemaining=0;
    p.airBoostUsed=false;p.groundBoostCharge=0;
  };
  const len = Math.hypot(keys.forward, keys.right);
  const forward = len > 0 ? keys.forward / Math.max(1, len) : 0;
  const right = len > 0 ? keys.right / Math.max(1, len) : 0;
  const sx = Math.sin(keys.cameraYaw),
    cz = Math.cos(keys.cameraYaw);
  // Camera looks toward +Z at yaw=0: screen-right is world -X.
  const dx = forward * sx - right * cz;
  const dz = forward * cz + right * sx;
  if(len>.1)p.intentYaw=Math.atan2(dx,dz);
  if(keys.autoRun){
    const forwardCharge=(p.mode==='ground'||p.mode==='air')&&keys.forward>.65&&len>.75&&!keys.rollHeld&&!keys.rollPressed;
    // Preserve earned speed charge through a jump; do not gain sprint charge while airborne.
    p.runCharge=clamp((p.runCharge??0)+(forwardCharge?(p.mode==='ground'?dt/1.15:0):-dt*2),0,1);
  }
  const body={...DEFAULT_BODY,...p.body};p.transitioned=undefined;
  const relief=collision?(x:number,z:number)=>collision.reliefHeight(x,z):terrainHeight;
  p.stamina=p.stamina??MAX_STAMINA;p.climbCooldown=Math.max(0,(p.climbCooldown??0)-dt);
  const floorAt=(fromY?:number)=>collision?collision.surfaceAt(pos,p.space,body.radius,{step:body.step,fromY}).floorY:terrainHeight(pos.x,pos.z);
  const atWater = collision?collision.waterAt(pos,p.space):waterSurface(pos.x, pos.z);
  const ground = floorAt();
  const deepEnough = atWater !== null && atWater - ground > 0.62;
  const inWater = deepEnough && pos.y <= atWater + 0.42;
  const assisted=keys.jumpAssist===true;
  let jumpHandled=false;
  if(assisted){
    p.coyoteLeft=Math.max(0,(p.coyoteLeft??0)-dt);
    p.jumpBufferLeft=Math.max(0,(p.jumpBufferLeft??0)-dt);
    if(inWater||oldMode==='swim'||oldMode==='dive'||oldMode==='climb'){
      p.coyoteLeft=0;p.jumpBufferLeft=0;
    }
    const coyote=oldMode==='air'&&p.coyoteLeft>0&&!inWater;
    const height=pos.y-ground;
    const bufferRange=Math.min(JUMP_ASSIST.maxPrediction,Math.max(JUMP_ASSIST.nearLanding,-v.y*JUMP_ASSIST.buffer));
    // Late airborne key presses near the floor request the next grounded jump, not a glide.
    if(keys.jumpPressed&&oldMode==='air'&&!coyote&&v.y<=0&&height>.06&&height<=bufferRange){
      p.jumpBufferLeft=JUMP_ASSIST.buffer;jumpHandled=true;
    }
    if(keys.jumpPressed&&coyote){
      p.jumpOrigin=p.coyoteFrom??'idle';p.jumpSeq=(p.jumpSeq??0)+1;
      v.y=Math.max(v.y,p.jumpOrigin==='roll'?ROLL.jump:7.1);
      p.glideReady=true;p.coyoteLeft=0;p.jumpBufferLeft=0;jumpHandled=true;
    }
  }
  // Roll: from the ground (not in water, not on a boat). X toggles the ball; holding the sprint
  // key (Shift) while moving rolls to go fast and releasing it unrolls (momentum kept).
  const enterRoll=(byHold:boolean)=>{p.mode='roll';p.rollByHold=byHold;p.rollSpeed=Math.hypot(v.x,v.z);p.rollHeading=len>0?Math.atan2(dx,dz):Math.hypot(v.x,v.z)>.3?Math.atan2(v.x,v.z):keys.cameraYaw;p.rollIdle=0;};
  if(keys.rollPressed){
    if(p.mode==='ground'&&!inWater)enterRoll(false);
    else if(p.mode==='roll'){if(p.rollByHold)p.rollByHold=false;else p.mode='ground';}
  }
  else if(keys.rollHeld&&len>.3&&p.mode==='ground'&&!inWater)enterRoll(true);
  else if(p.mode==='roll'&&p.rollByHold&&!keys.rollHeld)p.mode='ground';
  if(p.mode==='roll'&&!inWater){
    rollStep(p,keys,dt,dx,dz,len,relief,collision?.materialAt(pos,p.space)??'grass',!!p.space||ground-relief(pos.x,pos.z)>.2);
    if(assisted){
      if(p.mode==='roll'){
        p.coyoteLeft=JUMP_ASSIST.coyote;p.coyoteFrom='roll';
      }else if(keys.jumpPressed){
        p.coyoteLeft=0;p.jumpBufferLeft=0;jumpHandled=true;
      }
    }
  }else if(p.mode!=='air')p.rollSlip=0;
  // Climbing (outdoor relief only): steeper than the walkable slope, pushed into, with stamina.
  if(p.mode!=='climb'&&!p.space&&p.climbCooldown<=0&&p.stamina>=CLIMB.minStart&&len>.3&&(p.mode==='ground'||p.mode==='air'||p.mode==='glide')){
    const ax=pos.x+dx*.6,az=pos.z+dz*.6,g=reliefGradient(ax,az,relief),hAhead=relief(ax,az);
    if(g.slope>body.maxSlope&&g.x*dx+g.z*dz>.5&&hAhead>pos.y+.3&&pos.y-relief(pos.x,pos.z)<CLIMB.grabReach&&(atWater===null||atWater<pos.y)){p.mode='climb';p.climbDir={x:g.x,z:g.z};v.set(0,0,0);p.glideReady=false;}
  }
  if(p.mode==='climb'){climbStep(p,keys,dt,body.maxSlope,forward,right,relief);if(p.mode==='climb')body.maxSlope=1e3;}
  if (p.mode==='climb'||p.mode==='roll'&&!inWater) {
    // Velocity set by climbStep / rollStep; the relief below is followed after the horizontal move.
  } else if (inWater) {
    // Swimming IN the water: the body centre rides the water line (head and back out), not on top.
    const surfaceY = atWater - SWIM.sink;
    if (oldMode !== 'swim' && oldMode !== 'dive') {
      p.mode = 'swim';p.diving = false;
      v.y = Math.max(v.y, -3) * 0.3; // entry splash: falling speed damped, then the float pulls up
    } else if (keys.jumpPressed) {
      // Space: dive (with a push down), Space again: back up to the surface.
      p.diving = !p.diving;p.diveSink = p.diving;
      if (p.diving) v.y = Math.min(v.y, -SWIM.divePush);
    }
    if (p.oxygen <= 0) p.diving = false;
    // Brasse: short deterministic speed pulse, independent of PC Space dive toggling.
    if(keys.swimStrokePressed){p.swimStrokeClock=.32;p.swimStrokeSeq=(p.swimStrokeSeq??0)+1;}
    else p.swimStrokeClock=Math.max(0,(p.swimStrokeClock??0)-dt);
    const stroke=(p.swimStrokeClock??0)/.32;
    const strokeForward=stroke>0&&len<.14?1:forward,strokeRight=stroke>0&&len<.14?0:right;
    const strokeDx=stroke>0&&len<.14?sx:dx,strokeDz=stroke>0&&len<.14?cz:dz;
    const underwater = !!p.diving || keys.dive;
    const speed = (underwater ? (keys.run ? SWIM.diveRun : SWIM.dive) : keys.run ? 5.0 : 3.15)+stroke*2.5;
    const smoothing = Math.min(1, dt * 6);
    let vyTarget: number;
    if (underwater && !keys.dive) {
      // 3D swimming: forward follows the camera (looking down dives down), strafing stays level.
      const tilt = clamp(keys.cameraPitch ?? 0, -1.2, 1.2), level = Math.cos(tilt);
      // Camera-relative input split: the forward part tilts with the camera, strafing stays level.
      const fx = strokeForward * sx, fz = strokeForward * cz, ix = -strokeRight * cz, iz = strokeRight * sx;
      v.x += ((fx * level + ix) * speed - v.x) * smoothing;
      v.z += ((fz * level + iz) * speed - v.z) * smoothing;
      vyTarget = -Math.sin(tilt) * strokeForward * speed;
      // A dive first goes fully under (head ≈ 0.6 m deep), then floats and follows the camera.
      if (p.diveSink) { if (pos.y <= surfaceY - SWIM.diveDepth + .05) p.diveSink = false; else vyTarget = Math.min(vyTarget, clamp((surfaceY - SWIM.diveDepth - pos.y) * 3, -2, -.6)); }
    } else {
      v.x += (strokeDx * speed - v.x) * smoothing;
      v.z += (strokeDz * speed - v.z) * smoothing;
      // Ctrl held sinks; otherwise the float pulls back to the swimming line (fast from deep water).
      vyTarget = keys.dive ? -3.2 : clamp((surfaceY - pos.y) * 4, -1.5, 3.75);
    }
    v.y += (vyTarget - v.y) * Math.min(1, dt * 5);
    pos.y += v.y * dt;
    const floor = ground + 0.3;
    pos.y = clamp(pos.y, floor, surfaceY + 0.06);
    // Rising back to the swimming line ends a dive by itself.
    if (p.diving && pos.y >= surfaceY - 0.08 && v.y > 0) p.diving = false;
    p.mode = pos.y < surfaceY - 0.35 ? 'dive' : 'swim';
    if (p.mode === 'dive') p.oxygen = Math.max(0, p.oxygen - dt);
    else p.oxygen = Math.min(MAX_OXYGEN, p.oxygen + dt * 9);
    p.glideReady = false;
  } else {
    p.swimStrokeClock=0;
    if (oldMode === 'swim' || oldMode === 'dive') {
      p.mode = 'air';
      v.y = Math.max(0, v.y);
    }
    const grounded = pos.y <= ground + 0.06 && v.y <= 0;
    if (grounded) {
      p.mode = 'ground';
      p.glideDeploymentUsed=false;p.glideDeploymentRemaining=0;
      p.airBoostUsed=false;
      pos.y = ground;
      v.y = 0;
      p.glideReady = false;
      if(assisted){
        p.coyoteLeft=JUMP_ASSIST.coyote;
        p.coyoteFrom=Math.hypot(v.x,v.z)>MOTION.walk*.75?'run':'idle';
      }
      if ((keys.jumpPressed&&!jumpHandled) || (assisted&&(p.jumpBufferLeft??0)>0)) {
        p.jumpOrigin=Math.hypot(v.x,v.z)>MOTION.walk*.75?'run':'idle';
        p.jumpSeq=(p.jumpSeq??0)+1;
        p.mode = 'air';jumpHandled=true;
        v.y = 7.1;
        p.glideReady = true;
        if(assisted){p.coyoteLeft=0;p.jumpBufferLeft=0;}
      }
    } else if (p.mode === 'ground') {
      p.mode = 'air';
      p.jumpOrigin=undefined; // Stepping off a ledge is not a previous rolling jump.
      p.glideReady = true;
    }
    // Holding acceleration while standing still launches a gas-powered hop.
    // A quick mobile tap still selects the roll mode; moving never charges this launch.
    if(p.mode==='ground'&&!inWater&&len<.15&&!keys.rollPressed&&keys.boostHeld&&gasShots(p)>0){
      p.groundBoostCharge=Math.min(BOOST_LIFT.stationaryHold,(p.groundBoostCharge??0)+dt);
      if(p.groundBoostCharge>=BOOST_LIFT.stationaryHold-1e-8){
        p.mode='air';p.jumpOrigin='idle';p.jumpSeq=(p.jumpSeq??0)+1;
        p.glideReady=true;v.y=Math.max(v.y,BOOST_LIFT.launchVy);
        p.coyoteLeft=0;p.jumpBufferLeft=0;jumpHandled=true;
        // The ground-held button becomes a fresh airborne gas pulse on launch.
        gasBoostStep(p,false,false,0);
      }
    }else p.groundBoostCharge=0;
    if(p.mode!=='ground')p.groundBoostCharge=0;
    if (p.mode === 'air' || p.mode === 'glide') {
      if (keys.jumpPressed && !jumpHandled && p.glideReady && oldMode !== 'ground' && oldMode !== 'climb' && oldMode !== 'roll') {
        p.mode = p.mode === 'glide' ? 'air' : 'glide';
        p.glideHeading=Math.hypot(v.x,v.z)>.1?Math.atan2(v.x,v.z):(p.heading??p.intentYaw??keys.cameraYaw);
        p.glidePitch=undefined;
        if(p.mode==='glide'&&!p.glideDeploymentUsed){
          p.glideDeploymentUsed=true;p.glideDeploymentRemaining=GLIDE_DEPLOY.duration;
        }else p.glideDeploymentRemaining=0;
      }
      if (p.mode === 'glide') {
        const previousPulse=p.gasPulseSeq??0;
        const gasAcceleration=gasBoostStep(p,keys.boostHeld===true,true,dt);gasTicked=true;
        if((p.gasPulseSeq??0)>previousPulse){
          // Lift once per gas pulse, even when deploying during a descending glide.
          v.y=Math.max(v.y,BOOST_LIFT.glideVy);
          p.glidePitch=Math.atan2(v.y,Math.max(Math.hypot(v.x,v.z),.01));
        }
        const flightPitch=forward>=0?forward*.85:forward*.65;
        glideVelocity(p,glideSteeringYaw(p,right,dt),flightPitch,0,dt,undefined,gasAcceleration,gasMastery(p));
        glideDeploymentStep(p,dt);
      } else {
        const previousPulse=p.gasPulseSeq??0;
        // One gas-powered double jump in freefall per take-off; gliding remains
        // eligible for repeated pulses from the regular consumable gas reserve.
        const acceleration=gasBoostStep(p,keys.boostHeld===true&&!p.airBoostUsed,true,dt);
        gasTicked=true;
        if((p.gasPulseSeq??0)>previousPulse){
          p.airBoostUsed=true;v.y=Math.max(v.y,BOOST_LIFT.airVy);
        }
        airVelocity(v,dx,dz,keys.run?7.2:5.2,dt);
        if(p.airBoostUsed&&acceleration>0)v.y+=acceleration*dt*BOOST_LIFT.airThrustVertical;
      }
      // Vertical integration is swept together with XZ below when collisions are available.
      if(!collision)pos.y+=v.y*dt;
    } else {
      const charge=p.runCharge??0,blend=charge*charge*(3-2*charge);
      const uprightTarget=keys.run?MOTION.run:keys.autoRun?MOTION.walk+(MOTION.run-MOTION.walk)*blend:MOTION.walk;
      groundVelocity(v,dx,dz,uprightTarget,dt);
    }
    p.oxygen = Math.min(MAX_OXYGEN, p.oxygen + dt * 14);
  }
  const from=collision?{x:pos.x,y:pos.y,z:pos.z}:null;
  if(collision&&(p.mode==='air'||p.mode==='glide'))pos.y+=v.y*dt;
  pos.x += v.x * dt;
  pos.z += v.z * dt;
  if(collision&&from){
    const moved=collision.sweep(from,pos,body.radius,body.height,{space:p.space,body});
    pos.set(moved.position.x,moved.position.y,moved.position.z);
    if(moved.blockedY&&(p.mode==='air'||p.mode==='glide')){
      if(v.y<0){recordLanding();p.mode='ground';p.glideReady=false;}else if(p.mode==='glide')p.mode='air';
      v.y=0;
    }
    if(moved.blockedX)v.x=0;if(moved.blockedZ)v.z=0;
    if(p.mode==='roll'&&(moved.blockedX||moved.blockedZ)){p.rollSpeed=Math.hypot(v.x,v.z);p.rollHeading=Math.atan2(v.x,v.z)||p.rollHeading;}
  }
  if (!insideWorld(pos.x, pos.z)) {
    const bounds = getTerrainConfig();
    pos.x = clamp(pos.x, -bounds.width / 2 + 3, bounds.width / 2 - 3);
    pos.z = clamp(pos.z, -bounds.length / 2 + 12, bounds.length / 2 - 14);
    v.x *= 0.2;
    v.z *= 0.2;
  }
  const surface=collision?.surfaceAt(pos,p.space,body.radius,{step:body.step});
  const newGround = surface?.floorY??terrainHeight(pos.x, pos.z);
  if(surface?.ceilingY!==null&&surface?.ceilingY!==undefined&&pos.y+body.height>surface.ceilingY){pos.y=Math.max(newGround,surface.ceilingY-body.height);v.y=Math.min(0,v.y);if(pos.y>newGround+.06)p.mode='air';}
  if(p.mode==='ground'){if(pos.y-newGround>.45){p.mode='air';p.glideReady=true;}else pos.y=newGround;}
  if (p.mode === 'roll') { if (pos.y - newGround > .45) { p.jumpOrigin='roll';p.mode = 'air'; p.glideReady = true; } else {const gain=newGround-(from?.y??pos.y);pos.y=newGround;v.y=gain/dt;} }
  if (p.mode === 'climb') pos.y = newGround;
  else if (p.mode !== 'glide' && p.mode !== 'air') p.stamina = Math.min(MAX_STAMINA, p.stamina + CLIMB.regen * dt);
  if ((p.mode === 'air' || p.mode === 'glide') && pos.y < newGround) {
    pos.y = newGround;
    recordLanding();
    v.y = 0;
    p.mode = 'ground';
    p.glideReady = false;
  }
  // Water is evaluated after horizontal motion as well, to avoid passing through the banks.
  const newWater = collision?collision.waterAt(pos,p.space):waterSurface(pos.x, pos.z);
  if (
    newWater !== null &&
    newWater - newGround > 0.62 &&
    pos.y <= newWater + 0.25 &&
    p.mode !== 'swim' &&
    p.mode !== 'dive'
  ) {
    p.mode = 'swim';p.diving = false;
    v.y = 0;
    // Entering deep water while walking: the float brings the body to the swimming line (no snap).
    pos.y = Math.min(pos.y, newWater + 0.08);
    p.glideReady = false;
  }
  // Buffered jump can fire on the SAME tick as physical landing. Its impulse is
  // integrated next tick; no synthetic teleport, double-jump or extra glide toggle.
  if(assisted&&p.mode==='ground'&&!jumpHandled&&(p.jumpBufferLeft??0)>0){
    p.jumpOrigin=Math.hypot(v.x,v.z)>MOTION.walk*.75?'run':'idle';
    p.jumpSeq=(p.jumpSeq??0)+1;p.mode='air';v.y=7.1;p.glideReady=true;
    p.jumpBufferLeft=0;p.coyoteLeft=0;jumpHandled=true;
  }
  // Cosmetic slope samples only for genuine terrain contact, not decks or underground spaces.
  const heightfieldContact=p.mode==='ground'&&!p.space&&Math.abs(newGround-relief(pos.x,pos.z))<.12;
  if(heightfieldContact){
    const heading=p.heading??p.intentYaw??0;
    const fx=Math.sin(heading),fz=Math.cos(heading),sx=Math.cos(heading),sz=-Math.sin(heading),half=.25;
    const up=relief(pos.x+fx*half,pos.z+fz*half),down=relief(pos.x-fx*half,pos.z-fz*half);
    const left=relief(pos.x-sx*half,pos.z-sz*half),right=relief(pos.x+sx*half,pos.z+sz*half);
    p.groundPitch=clamp(Math.atan2(up-down,2*half),-.4,.4);
    p.groundRoll=clamp(Math.atan2(right-left,2*half),-.4,.4);
  }else{p.groundPitch=0;p.groundRoll=0;}
  // The ordinary heightfield gives a smooth support plane. Only on raised obstacle
  // tops do we spend two narrow contact queries to adjust each foot independently.
  // These cues affect bones only: the collision body and velocity remain untouched.
  const obstacleContact=!!collision&&p.mode==='ground'&&!p.space
    &&!(newWater!==null&&newWater-newGround>.62)
    &&newGround-relief(pos.x,pos.z)>.12;
  if(obstacleContact&&collision){
    const yaw=p.heading??p.intentYaw??0,sideX=Math.cos(yaw)*.22,sideZ=-Math.sin(yaw)*.22;
    const forwardX=Math.sin(yaw)*.08,forwardZ=Math.cos(yaw)*.08;
    const foot=(sign:number)=>{
      const sample=collision.surfaceAt({x:pos.x+forwardX+sideX*sign,y:newGround,z:pos.z+forwardZ+sideZ*sign},
        p.space,.025,{step:body.step,fromY:newGround});
      return clamp(sample.floorY-newGround,-.25,.12);
    };
    p.footSupportLeft=foot(-1);p.footSupportRight=foot(1);
  }else{p.footSupportLeft=undefined;p.footSupportRight=undefined;}
  // Explicit connections between spaces (mine entrance, stairs, shafts): never implicit.
  const transition=collision?.transitionAt(pos,p.space);
  if(p.mode!=='glide'){
    // The old ground gate must not cancel a gas pulse already running in freefall.
    if(!gasTicked)gasBoostStep(p,keys.run===true||keys.boostHeld===true,false,dt);
    else if(p.mode!=='air')gasBoostStep(p,false,false,0);
    p.stalled=false;p.glideHeading=undefined;p.glidePitch=undefined;p.glideTurnRate=0;p.glideDeploymentRemaining=0;
  }
  if(p.mode==='ground'||p.mode==='swim'||p.mode==='dive'||p.mode==='climb'){
    p.glideDeploymentUsed=false;p.airBoostUsed=false;p.groundBoostCharge=0;
  }
  if(Math.hypot(v.x,v.z)>.01)p.heading=Math.atan2(v.x,v.z);
  if(transition){p.space=transition.to??undefined;pos.set(transition.arrival.x,transition.arrival.y,transition.arrival.z);v.set(0,0,0);p.mode='ground';p.glideReady=false;p.transitioned=transition.id;p.coyoteLeft=0;p.jumpBufferLeft=0;p.footSupportLeft=undefined;p.footSupportRight=undefined;p.glideDeploymentUsed=false;p.glideDeploymentRemaining=0;p.airBoostUsed=false;p.groundBoostCharge=0;gasBoostStep(p,keys.run===true||keys.boostHeld===true,false,0);}
}

/** One climbing step: forward = up the slope, sideways along it; jump leaps off (glide possible),
 * exhaustion drops the player, a walkable slope ahead ends the climb on the ridge. */
function climbStep(p:Player,keys:Controls,dt:number,maxSlope:number,forward:number,right:number,relief:(x:number,z:number)=>number){
  const pos=p.position,v=p.velocity,g=reliefGradient(pos.x,pos.z,relief),ahead=reliefGradient(pos.x+(p.climbDir?.x??g.x)*.7,pos.z+(p.climbDir?.z??g.z)*.7,relief);
  if(g.slope>.05)p.climbDir={x:g.x,z:g.z};const u=p.climbDir??{x:0,z:1};
  if(keys.jumpPressed){p.mode='air';v.set(-u.x*3.2,6.2,-u.z*3.2);p.glideReady=true;p.climbCooldown=.6;return;}
  if(p.stamina!<=0){p.mode='air';v.set(-u.x*.8,0,-u.z*.8);p.glideReady=true;p.climbCooldown=1.5;return;}
  if(Math.max(g.slope,ahead.slope)<maxSlope*.85){p.mode='ground';v.set(u.x*forward*2,0,u.z*forward*2);return;}
  // Lateral axis follows the camera's screen-right, so « right » never inverts on the wall.
  const camRight={x:-Math.cos(keys.cameraYaw),z:Math.sin(keys.cameraYaw)};let t={x:-u.z,z:u.x};if(t.x*camRight.x+t.z*camRight.z<0)t={x:-t.x,z:-t.z};
  const slope=Math.max(g.slope,.5),upH=forward*CLIMB.up/slope;
  v.set(u.x*upH+t.x*right*CLIMB.side,0,u.z*upH+t.z*right*CLIMB.side);
  const moving=Math.abs(forward)+Math.abs(right)>.1;p.stamina=Math.max(0,p.stamina!-(moving?CLIMB.drainMove:CLIMB.drainHang)*dt);
}
/** One roll step: heading turns toward the input at a limited rate, speed accelerates toward the
 * top speed with input, rolls on (friction) without, brakes when pushed backwards; slopes add a
 * moderate share of gravity. Jump leaves the ball keeping the momentum; a stop leaves it too. */
function rollStep(p:Player,keys:Controls,dt:number,dx:number,dz:number,len:number,relief:(x:number,z:number)=>number,material:GroundMaterial,flatSupport:boolean){
 const pos=p.position,v=p.velocity;let speed=Math.hypot(v.x,v.z),heading=speed>.05?Math.atan2(v.x,v.z):p.rollHeading??keys.cameraYaw;
 if(keys.jumpPressed){p.jumpOrigin='roll';p.jumpSeq=(p.jumpSeq??0)+1;p.mode='air';v.y=Math.max(0,v.y)+ROLL.jump;p.glideReady=true;return;}
 const surface=SURFACE_MOTION[material];
 let slipTarget=0;
 if(len>.1){
  const want=Math.atan2(dx,dz),delta=angleDelta(heading,want),align=Math.cos(delta);
  if(speed<1.5){heading=want;speed=Math.min(ROLL.max+(keys.run?2:0),speed+ROLL.accel*dt*Math.min(1,len)*(keys.run?1.4:1));}
  else if(align<-.3)speed=Math.max(0,speed-ROLL.brake*dt);
  else{
   const rate=ROLL.turnRate*surface.grip/(1+speed*.035),turn=Math.max(-rate*dt,Math.min(rate*dt,delta));
   heading+=turn;speed*=Math.exp(-ROLL.turnLoss*Math.abs(turn));
   const driveLimit=(ROLL.max+(keys.run?2:0))/(1+Math.abs(turn/dt)*.35);
   if(speed<driveLimit)speed=Math.min(driveLimit,speed+ROLL.accel*(keys.run?1.4:1)*dt*Math.min(1,len));
  }
  // Remaining steering error is the (signed) visual skid; low-grip surfaces amplify it.
  const residual=angleDelta(heading,want);
  slipTarget=clamp(residual*.55*Math.min(1,speed/7)*(1.5-surface.grip),-1,1);
  p.rollIdle=0;
 }else p.rollIdle=(p.rollIdle??0)+dt;
 p.rollSlip=(p.rollSlip??0)+(slipTarget-(p.rollSlip??0))*Math.min(1,dt*9);
 speed=Math.max(0,speed-ROLL.friction*surface.friction*(len>.1?.25:1)*dt);
 // Gravity projected onto the heightfield tangent plane. It also turns a freely rolling ball.
 const gx=flatSupport?0:relief(pos.x+.5,pos.z)-relief(pos.x-.5,pos.z),gz=flatSupport?0:relief(pos.x,pos.z+.5)-relief(pos.x,pos.z-.5);
 const gravity=MOTION.gravity*ROLL.slopeGravity*dt/(1+gx*gx+gz*gz);
 v.x=Math.sin(heading)*speed-gx*gravity;v.z=Math.cos(heading)*speed-gz*gravity;
 speed=Math.hypot(v.x,v.z);if(speed>ROLL.downhillMax){const k=ROLL.downhillMax/speed;v.x*=k;v.z*=k;speed=ROLL.downhillMax;}
 p.rollSpeed=speed;p.rollHeading=speed>.01?Math.atan2(v.x,v.z):heading;
 // A manually toggled ball remains selected until the player toggles it off.
  if(p.rollByHold&&speed<ROLL.exitSpeed&&(p.rollIdle??0)>ROLL.exitIdle&&gx*v.x+gz*v.z>=-1e-4){p.mode='ground';v.set(0,0,0);}
}
