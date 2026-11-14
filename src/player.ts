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
  jumpPressed: boolean;
  /** Roll toggle pressed this step (hamster ball mode). Optional for older callers. */
  rollPressed?: boolean;
  /** Sprint key held (Shift): the hamster rolls into a ball to go fast while it moves on the
   * ground, and unrolls when the key is released. Optional for older callers. */
  rollHeld?: boolean;
  spaceHeld: boolean;
  dive: boolean;
  cameraYaw: number;
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
  /** True when the ball was entered by holding the sprint key (released → back on the paws). */
  rollByHold?:boolean;
}
export const MAX_OXYGEN = 90;
export const MAX_STAMINA = 100;
/** Roll tuning (kinematic ball, not a physics simulation): top speed, acceleration, rolling
 * friction, braking, turn rate (rad/s), share of gravity felt on slopes, jump-off speed. */
export const ROLL={max:11,accel:5,friction:1.2,brake:9,turnRate:1.8,slopeGravity:.5,jump:6.5,minEnter:0,exitSpeed:.6,exitIdle:.35} as const;
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
  };
}

export function simulatePlayer(p: Player, keys: Controls, dt: number,collision?:WorldCollisionQuery): void {
  const { position: pos, velocity: v } = p;
  const oldMode = p.mode;
  const len = Math.hypot(keys.forward, keys.right);
  const forward = len > 0 ? keys.forward / Math.max(1, len) : 0;
  const right = len > 0 ? keys.right / Math.max(1, len) : 0;
  const sx = Math.sin(keys.cameraYaw),
    cz = Math.cos(keys.cameraYaw);
  // Camera looks toward +Z at yaw=0: screen-right is world -X.
  const dx = forward * sx - right * cz;
  const dz = forward * cz + right * sx;
  const body={...DEFAULT_BODY,...p.body};p.transitioned=undefined;
  const relief=collision?(x:number,z:number)=>collision.reliefHeight(x,z):terrainHeight;
  p.stamina=p.stamina??MAX_STAMINA;p.climbCooldown=Math.max(0,(p.climbCooldown??0)-dt);
  const floorAt=(fromY?:number)=>collision?collision.surfaceAt(pos,p.space,body.radius,{step:body.step,fromY}).floorY:terrainHeight(pos.x,pos.z);
  const atWater = collision?collision.waterAt(pos,p.space):waterSurface(pos.x, pos.z);
  const ground = floorAt();
  const deepEnough = atWater !== null && atWater - ground > 0.62;
  const inWater = deepEnough && pos.y <= atWater + 0.42;
  // Roll: from the ground (not in water, not on a boat). X toggles the ball; holding the sprint
  // key (Shift) while moving rolls to go fast and releasing it unrolls (momentum kept).
  const enterRoll=(byHold:boolean)=>{p.mode='roll';p.rollByHold=byHold;p.rollSpeed=Math.max(Math.hypot(v.x,v.z),2.5);p.rollHeading=len>0?Math.atan2(dx,dz):Math.hypot(v.x,v.z)>.3?Math.atan2(v.x,v.z):keys.cameraYaw;p.rollIdle=0;};
  if(keys.rollPressed){if(p.mode==='ground'&&!inWater)enterRoll(false);else if(p.mode==='roll')p.mode='ground';}
  else if(keys.rollHeld&&len>.3&&p.mode==='ground'&&!inWater)enterRoll(true);
  else if(p.mode==='roll'&&p.rollByHold&&!keys.rollHeld)p.mode='ground';
  if(p.mode==='roll'&&!inWater)rollStep(p,keys,dt,dx,dz,len,relief);
  // Climbing (outdoor relief only): steeper than the walkable slope, pushed into, with stamina.
  if(p.mode!=='climb'&&!p.space&&p.climbCooldown<=0&&p.stamina>=CLIMB.minStart&&len>.3&&(p.mode==='ground'||p.mode==='air'||p.mode==='glide')){
    const ax=pos.x+dx*.6,az=pos.z+dz*.6,g=reliefGradient(ax,az,relief),hAhead=relief(ax,az);
    if(g.slope>body.maxSlope&&g.x*dx+g.z*dz>.5&&hAhead>pos.y+.3&&pos.y-relief(pos.x,pos.z)<CLIMB.grabReach&&(atWater===null||atWater<pos.y)){p.mode='climb';p.climbDir={x:g.x,z:g.z};v.set(0,0,0);p.glideReady=false;}
  }
  if(p.mode==='climb'){climbStep(p,keys,dt,body.maxSlope,forward,right,relief);if(p.mode==='climb')body.maxSlope=1e3;}
  if (p.mode==='climb'||p.mode==='roll'&&!inWater) {
    // Velocity set by climbStep / rollStep; the relief below is followed after the horizontal move.
  } else if (inWater) {
    if (oldMode !== 'swim' && oldMode !== 'dive') {
      p.mode = 'swim';
      v.y = 0;
      pos.y = Math.min(pos.y, atWater + 0.12);
    }
    const speed = keys.run ? 5.0 : 3.15;
    const smoothing = Math.min(1, dt * 6);
    v.x += (dx * speed - v.x) * smoothing;
    v.z += (dz * speed - v.z) * smoothing;
    let vyTarget = 0;
    if (keys.dive) vyTarget = -3.2;
    else if (keys.spaceHeld || p.oxygen <= 0) vyTarget = 3.75;
    else if (pos.y >= atWater - 0.3) vyTarget = 1.2;
    v.y += (vyTarget - v.y) * Math.min(1, dt * 5);
    pos.y += v.y * dt;
    const floor = ground + 0.45;
    pos.y = clamp(pos.y, floor, atWater + 0.12);
    p.mode = pos.y < atWater - 0.55 ? 'dive' : 'swim';
    if (p.mode === 'dive') p.oxygen = Math.max(0, p.oxygen - dt);
    else p.oxygen = Math.min(MAX_OXYGEN, p.oxygen + dt * 9);
    p.glideReady = false;
  } else {
    if (oldMode === 'swim' || oldMode === 'dive') {
      p.mode = 'air';
      v.y = Math.max(0, v.y);
    }
    const grounded = pos.y <= ground + 0.06 && v.y <= 0;
    if (grounded) {
      p.mode = 'ground';
      pos.y = ground;
      v.y = 0;
      p.glideReady = false;
      if (keys.jumpPressed) {
        p.mode = 'air';
        v.y = 7.1;
        p.glideReady = true;
      }
    } else if (p.mode === 'ground') {
      p.mode = 'air';
      p.glideReady = true;
    }
    if (p.mode === 'air' || p.mode === 'glide') {
      if (keys.jumpPressed && p.glideReady && oldMode !== 'ground' && oldMode !== 'climb' && oldMode !== 'roll') {
        p.mode = p.mode === 'glide' ? 'air' : 'glide';
      }
      if (p.mode === 'glide') {
        const forwardSpeed = 10.4,
          a = Math.min(1, dt * 2.1);
        v.x += (dx * forwardSpeed - v.x) * a;
        v.z += (dz * forwardSpeed - v.z) * a;
        v.y = Math.max(-2.8, v.y - 5.0 * dt);
        v.y = Math.min(v.y, 2.8);
      } else {
        v.y -= 17.2 * dt;
        const speed = keys.run ? 7.2 : 5.2;
        const a = Math.min(1, dt * 1.9);
        v.x += (dx * speed - v.x) * a;
        v.z += (dz * speed - v.z) * a;
      }
      const before=pos.y;pos.y += v.y * dt;
      const nextGround = floorAt(before);
      if (pos.y <= nextGround && v.y <= 0) {
        pos.y = nextGround;
        v.y = 0;
        p.mode = 'ground';
        p.glideReady = false;
      }
    } else {
      const speed = keys.run ? 8.7 : 4.65;
      const a = Math.min(1, dt * 10);
      v.x += (dx * speed - v.x) * a;
      v.z += (dz * speed - v.z) * a;
    }
    p.oxygen = Math.min(MAX_OXYGEN, p.oxygen + dt * 14);
  }
  const from=collision?{x:pos.x,y:pos.y,z:pos.z}:null;
  pos.x += v.x * dt;
  pos.z += v.z * dt;
  if(collision&&from){const moved=collision.move(from,pos,body.radius,body.height,{space:p.space,body});pos.x=moved.position.x;pos.z=moved.position.z;if(moved.blockedX)v.x=0;if(moved.blockedZ)v.z=0;if(p.mode==='roll'&&(moved.blockedX||moved.blockedZ)){p.rollSpeed=(p.rollSpeed??0)*.35;p.rollHeading=Math.atan2(v.x,v.z)||p.rollHeading;}}
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
  if (p.mode === 'ground') pos.y = Math.max(pos.y, newGround);
  if (p.mode === 'roll') { if (pos.y - newGround > .45) { p.mode = 'air'; p.glideReady = true; } else { pos.y = newGround; v.y = 0; } }
  if (p.mode === 'climb') pos.y = newGround;
  else if (p.mode !== 'glide' && p.mode !== 'air') p.stamina = Math.min(MAX_STAMINA, p.stamina + CLIMB.regen * dt);
  if ((p.mode === 'air' || p.mode === 'glide') && pos.y < newGround) {
    pos.y = newGround;
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
    p.mode = 'swim';
    v.y = 0;
    pos.y = newWater + 0.08;
    p.glideReady = false;
  }
  // Explicit connections between spaces (mine entrance, stairs, shafts): never implicit.
  const transition=collision?.transitionAt(pos,p.space);
  if(transition){p.space=transition.to??undefined;pos.set(transition.arrival.x,transition.arrival.y,transition.arrival.z);v.set(0,0,0);p.mode='ground';p.glideReady=false;p.transitioned=transition.id;}
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
function rollStep(p:Player,keys:Controls,dt:number,dx:number,dz:number,len:number,relief:(x:number,z:number)=>number){
  const pos=p.position,v=p.velocity;let speed=p.rollSpeed??0,heading=p.rollHeading??0;
  if(keys.jumpPressed){p.mode='air';v.y=ROLL.jump;p.glideReady=true;return;}
  const hx=Math.sin(heading),hz=Math.cos(heading);
  if(len>.1){
    const want=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(want-heading),Math.cos(want-heading)),align=(dx*hx+dz*hz)/Math.max(1e-6,Math.hypot(dx,dz));
    // Almost stopped: the ball simply turns toward the input; moving: pushing backwards brakes.
    if(speed<1.5){heading=want;speed=Math.min(ROLL.max,speed+ROLL.accel*dt*Math.min(1,len));}
    else if(align<-.3)speed=Math.max(0,speed-ROLL.brake*dt);
    else{heading+=Math.max(-ROLL.turnRate*dt,Math.min(ROLL.turnRate*dt,delta));speed=Math.min(ROLL.max,speed+ROLL.accel*dt*Math.min(1,len));}
    p.rollIdle=0;
  }else{speed=Math.max(0,speed-ROLL.friction*dt);p.rollIdle=(p.rollIdle??0)+dt;}
  // Slope along the heading: downhill speeds up, uphill slows down (moderate, bounded).
  const e=1,slope=(relief(pos.x+hx*e,pos.z+hz*e)-relief(pos.x-hx*e,pos.z-hz*e))/(2*e);
  speed=Math.max(0,Math.min(ROLL.max*1.25,speed-9.81*ROLL.slopeGravity*Math.max(-1,Math.min(1,slope))*dt));
  p.rollSpeed=speed;p.rollHeading=heading;
  v.set(Math.sin(heading)*speed,0,Math.cos(heading)*speed);
  if(speed<ROLL.exitSpeed&&(p.rollIdle??0)>ROLL.exitIdle){p.mode='ground';v.set(0,0,0);}
}
