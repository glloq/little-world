/**
 * Hamster ↔ ball interactions (doc 107 §poussée). One-way: the ball reacts to the actor's
 * fixed-step body; the player controller (`simulatePlayer`) is never modified or slowed.
 * Every velocity change is bounded per tick, so several hamsters pushing a big ball add up
 * without ever producing unbounded accelerations.
 */
import {BALL_LIMITS,type BallWorld} from './ball-physics.ts';
import type {MiniGameActor} from '../types.ts';

export const PUSH:{readonly actorMass:number;readonly walkMax:number;readonly rollMax:number;readonly maxDeltaPerTick:number;readonly restitution:number;readonly bodyScale:number;readonly reach:number}={
  /** Effective mass of a hamster body for contact impulses (kg-like units of BallSpec.mass). */actorMass:1.2,
  /** Normal speed given by an ordinary walking contact, and by a roll (ball mode). */walkMax:5.5,rollMax:13,
  /** Maximum velocity change one actor may impart to one ball in one tick. */maxDeltaPerTick:8,
  /** Restitution of the hamster body. */restitution:.4,
  /** Fraction of the actor's radius that counts as the contact body (the hamster is round). */bodyScale:.8,
  /** Reach to kick/throw/putt a ball (metres between body edge and ball surface). */reach:1.1,
} as const;

/** Contact pushes for all actors against all enabled balls. Returns the strongest
 * transferred speed per ball index through `out` (0 when untouched) and the toucher. */
export function pushBalls(world:BallWorld,actors:readonly MiniGameActor[],out:{speed:Float64Array;by:(string|null)[]},filter?:(ball:number)=>boolean){
  out.speed.fill(0);for(let i=0;i<world.count;i++)out.by[i]=null;
  for(const a of actors){
    const ar=a.radius*PUSH.bodyScale,cap=a.mode==='roll'?PUSH.rollMax:PUSH.walkMax;
    for(let i=0;i<world.count;i++){
      if(!world.enabled[i]||filter&&!filter(i))continue;
      const r=world.radius[i],dx=world.px[i]-a.x,dz=world.pz[i]-a.z,min=r+ar;
      if(Math.abs(dx)>min||Math.abs(dz)>min||world.py[i]-r>a.y+a.height||world.py[i]+r<a.y)continue;
      const d=Math.hypot(dx,dz);if(d>=min)continue;
      // Direction: away from the body centre (or along the actor's motion when exactly centred).
      const sp=Math.hypot(a.vx,a.vz),nx=d>1e-6?dx/d:sp>1e-6?a.vx/sp:0,nz=d>1e-6?dz/d:sp>1e-6?a.vz/sp:1;
      world.px[i]=a.x+nx*min;world.pz[i]=a.z+nz*min; // Ball-only separation.
      const approach=(a.vx-world.vx[i])*nx+(a.vz-world.vz[i])*nz;
      if(approach<=0)continue;
      const mB=1/world.invMass[i],transfer=approach*(1+PUSH.restitution)*PUSH.actorMass/(PUSH.actorMass+mB);
      // Target normal speed limited by mode cap; delta limited per tick.
      const current=world.vx[i]*nx+world.vz[i]*nz,target=Math.min(cap,current+transfer),dv=Math.max(0,target-current);
      if(dv<1e-6)continue;
      world.addVelocity(i,nx*dv,a.mode==='roll'?Math.min(1.5,dv*.12):0,nz*dv,PUSH.maxDeltaPerTick);
      if(dv>out.speed[i]){out.speed[i]=dv;out.by[i]=a.id;}
    }
  }
}
/** Distance between the actor body edge and the ball surface (XZ). */
export function reachTo(world:BallWorld,i:number,a:MiniGameActor){return Math.hypot(world.px[i]-a.x,world.pz[i]-a.z)-world.radius[i]-a.radius*PUSH.bodyScale;}
/** Voluntary launch (kick / throw / putt): bounded speed along `yaw` (0 = +Z), optional loft. */
export function launchBall(world:BallWorld,i:number,yaw:number,speed:number,loft=0){
  const s=Math.max(0,Math.min(BALL_LIMITS.maxSpeed,speed));
  world.vx[i]=world.vy[i]=world.vz[i]=0;
  world.addVelocity(i,Math.sin(yaw)*s,Math.max(0,Math.min(6,loft)),Math.cos(yaw)*s);
}
