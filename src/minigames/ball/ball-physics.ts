/**
 * BallPhysics (doc 107 §physique): compact fixed-step sphere simulation shared by every ball
 * mini-game. Structure-of-arrays (Float64Array), no allocation in `step`, no Three.js, no
 * wall clock, no randomness: identical inputs give bit-identical states (server-ready).
 *
 * - Ground: the SAME relief function as the player (`WorldCollisionQuery.reliefHeight`),
 *   slope normal from central differences, gravity `MOTION.gravity`, rolling resistance
 *   scaled by the ground material friction of `SURFACE_MOTION` (both reused, not copied).
 * - Bounces with restitution, oriented static boxes (walls, obstacles, goal posts), shared
 *   static colliders through `solidsNear`, sphere/sphere impulses, water flag.
 * - Bounded sub-steps (≤ `BALL_LIMITS.maxSubsteps`) keep travel per sub-step ≤ ½ radius
 *   up to `maxSubsteps · r/2 · 30` m/s; speeds are clamped, impulses bounded.
 * - Sleeping: a grounded ball slower than `sleepSpeed` for `sleepTicks` ticks stops being
 *   integrated until an impulse or a contact wakes it. Asleep worlds cost ~nothing.
 */
import {MOTION,SURFACE_MOTION} from '../../physics/motion.ts';
import type {Bounds} from '../../physics/collision-world.ts';
import type {MiniGameEnvironment} from '../types.ts';

export const BALL_LIMITS={maxBalls:32,maxSubsteps:8,maxSpeed:30,sleepSpeed:.06,sleepTicks:12,bounceMin:.9,airDrag:.02,
  /** Rolling deceleration = rolling × material friction × g × this coefficient. */rollCoefficient:.15} as const;
export interface BallSpec {id:string;x:number;y:number;z:number;radius:number;mass:number;restitution:number;rolling:number;asleep?:boolean}
/** Oriented box: yaw rotation in XZ (same frame convention as the mini-game area), AABB in Y. */
export interface StaticBox {cx:number;cz:number;hx:number;hz:number;minY:number;maxY:number;cos:number;sin:number;restitution:number}
export function orientedBox(cx:number,cz:number,width:number,depth:number,minY:number,maxY:number,yaw:number,restitution=.6):StaticBox{
  return {cx,cz,hx:width/2,hz:depth/2,minY,maxY,cos:Math.cos(yaw),sin:Math.sin(yaw),restitution};
}
export interface BallWorldSnapshot {ids:string[];state:number[]}
const STRIDE=9;

export class BallWorld {
  readonly capacity:number;count=0;readonly ids:string[]=[];
  readonly px:Float64Array;readonly py:Float64Array;readonly pz:Float64Array;
  readonly vx:Float64Array;readonly vy:Float64Array;readonly vz:Float64Array;
  /** Positions at the start of the last step, for render interpolation. */
  readonly ox:Float64Array;readonly oy:Float64Array;readonly oz:Float64Array;
  readonly radius:Float64Array;readonly invMass:Float64Array;readonly restitution:Float64Array;readonly rolling:Float64Array;
  readonly asleep:Uint8Array;readonly enabled:Uint8Array;readonly grounded:Uint8Array;readonly inWater:Uint8Array;readonly idle:Uint16Array;
  /** Strongest contact closing speed during the last step (pins, sounds, events). */
  readonly hitSpeed:Float64Array;
  /** Local oriented obstacles of the activity. */
  boxes:StaticBox[]=[];
  /** Number of integrated (awake) ball sub-steps during the last step (benchmarks). */
  lastWork=0;
  private shared:StaticBox[]=[];private sharedCount=0;
  private readonly g=MOTION.gravity;
  private readonly env:MiniGameEnvironment;
  constructor(env:MiniGameEnvironment,capacity=16){
    this.env=env;
    if(!Number.isSafeInteger(capacity)||capacity<1||capacity>BALL_LIMITS.maxBalls)throw Error('Capacité de balles invalide');
    this.capacity=capacity;const f=()=>new Float64Array(capacity);
    this.px=f();this.py=f();this.pz=f();this.vx=f();this.vy=f();this.vz=f();this.ox=f();this.oy=f();this.oz=f();
    this.radius=f();this.invMass=f();this.restitution=f();this.rolling=f();this.hitSpeed=f();
    this.asleep=new Uint8Array(capacity);this.enabled=new Uint8Array(capacity);this.grounded=new Uint8Array(capacity);this.inWater=new Uint8Array(capacity);this.idle=new Uint16Array(capacity);
  }
  add(s:BallSpec):number{
    if(this.count>=this.capacity)throw Error('Trop de balles');
    if(![s.x,s.y,s.z].every(Number.isFinite)||!(s.radius>=.03&&s.radius<=3)||!(s.mass>0&&s.mass<=1000)||!(s.restitution>=0&&s.restitution<=1)||!(s.rolling>=0&&s.rolling<=10))throw Error('Balle invalide');
    const i=this.count++;this.ids[i]=s.id;
    this.radius[i]=s.radius;this.invMass[i]=1/s.mass;this.restitution[i]=s.restitution;this.rolling[i]=s.rolling;
    this.enabled[i]=1;this.place(i,s.x,s.y,s.z);this.asleep[i]=s.asleep?1:0;return i;
  }
  /** Teleport at rest (round reset, out of bounds). `y` undefined = resting on the ground. */
  place(i:number,x:number,y:number|undefined,z:number){
    const r=this.radius[i],ground=this.env.height(x,z)+r;
    this.px[i]=this.ox[i]=x;this.pz[i]=this.oz[i]=z;this.py[i]=this.oy[i]=y===undefined?ground:Math.max(ground,y);
    this.vx[i]=this.vy[i]=this.vz[i]=0;this.asleep[i]=1;this.idle[i]=0;this.inWater[i]=0;this.grounded[i]=1;this.hitSpeed[i]=0;
  }
  setEnabled(i:number,on:boolean){this.enabled[i]=on?1:0;if(!on){this.vx[i]=this.vy[i]=this.vz[i]=0;this.asleep[i]=1;}}
  /** Bounded velocity change (impulse / mass already applied). Wakes the ball. */
  addVelocity(i:number,dx:number,dy:number,dz:number,maxDelta:number=BALL_LIMITS.maxSpeed){
    if(!this.enabled[i]||!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(dz))return;
    const m=Math.hypot(dx,dy,dz);if(m<1e-9)return;const k=m>maxDelta?maxDelta/m:1;
    this.vx[i]+=dx*k;this.vy[i]+=dy*k;this.vz[i]+=dz*k;this.clampSpeed(i);this.asleep[i]=0;this.idle[i]=0;
  }
  speed(i:number){return Math.hypot(this.vx[i],this.vy[i],this.vz[i]);}
  get awakeCount(){let n=0;for(let i=0;i<this.count;i++)if(this.enabled[i]&&!this.asleep[i])n++;return n;}
  private clampSpeed(i:number){const s=this.speed(i);if(s>BALL_LIMITS.maxSpeed){const k=BALL_LIMITS.maxSpeed/s;this.vx[i]*=k;this.vy[i]*=k;this.vz[i]*=k;}}

  step(dt:number){
    if(!(dt>0&&dt<=.25))throw Error('Pas de balle invalide');
    let maxV=0,minR=Infinity,awake=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let i=0;i<this.count;i++){
      this.ox[i]=this.px[i];this.oy[i]=this.py[i];this.oz[i]=this.pz[i];this.hitSpeed[i]=0;
      if(!this.enabled[i]||this.asleep[i])continue;
      awake++;const v=this.speed(i),r=this.radius[i],reach=v*dt+r;maxV=Math.max(maxV,v);minR=Math.min(minR,r);
      minX=Math.min(minX,this.px[i]-reach);maxX=Math.max(maxX,this.px[i]+reach);minZ=Math.min(minZ,this.pz[i]-reach);maxZ=Math.max(maxZ,this.pz[i]+reach);
    }
    this.lastWork=0;if(!awake)return;
    this.gatherShared(minX,maxX,minZ,maxZ);
    const n=Math.min(BALL_LIMITS.maxSubsteps,Math.max(1,Math.ceil(maxV*dt/(minR*.5)))),h=dt/n;
    for(let k=0;k<n;k++){
      for(let i=0;i<this.count;i++){if(!this.enabled[i]||this.asleep[i])continue;this.lastWork++;this.integrate(i,h);this.ground(i,h);this.collideBoxes(i,this.boxes,this.boxes.length);this.collideBoxes(i,this.shared,this.sharedCount);}
      this.collidePairs();
    }
    for(let i=0;i<this.count;i++){
      if(!this.enabled[i]||this.asleep[i])continue;
      if(this.grounded[i]&&this.speed(i)<BALL_LIMITS.sleepSpeed){if(++this.idle[i]>=BALL_LIMITS.sleepTicks){this.asleep[i]=1;this.vx[i]=this.vy[i]=this.vz[i]=0;}}
      else this.idle[i]=0;
    }
  }
  /** Shared colliders copied into a reused pool once per step (no per-sub-step broadphase). */
  private gatherShared(minX:number,maxX:number,minZ:number,maxZ:number){
    this.sharedCount=0;const solids=this.env.solids?.(minX,maxX,minZ,maxZ);if(!solids)return;
    for(const b of solids as readonly Bounds[]){
      const box=this.shared[this.sharedCount]??(this.shared[this.sharedCount]={cx:0,cz:0,hx:0,hz:0,minY:0,maxY:0,cos:1,sin:0,restitution:.5});
      box.cx=(b.minX+b.maxX)/2;box.cz=(b.minZ+b.maxZ)/2;box.hx=(b.maxX-b.minX)/2;box.hz=(b.maxZ-b.minZ)/2;box.minY=b.minY;box.maxY=b.maxY;
      if(++this.sharedCount>=256)break;
    }
  }
  private integrate(i:number,h:number){
    this.vy[i]-=this.g*h;
    const drag=1-BALL_LIMITS.airDrag*h;this.vx[i]*=drag;this.vy[i]*=drag;this.vz[i]*=drag;
    this.clampSpeed(i);
    this.px[i]+=this.vx[i]*h;this.py[i]+=this.vy[i]*h;this.pz[i]+=this.vz[i]*h;
  }
  private ground(i:number,h:number){
    const x=this.px[i],z=this.pz[i],r=this.radius[i],env=this.env,ground=env.height(x,z);
    const e=Math.max(.15,r),gx=(env.height(x+e,z)-env.height(x-e,z))/(2*e),gz=(env.height(x,z+e)-env.height(x,z-e))/(2*e),len=Math.hypot(gx,1,gz);
    const nx=-gx/len,ny=1/len,nz=-gz/len,rest=ground+r/ny;
    const level=this.env.water?.(x,z)??null;this.inWater[i]=level!==null&&this.py[i]<level?1:0;
    if(this.inWater[i]){this.vy[i]+=this.g*1.4*h;const d=1-2*h;this.vx[i]*=d;this.vy[i]*=d;this.vz[i]*=d;}
    if(this.py[i]>rest+.002){this.grounded[i]=0;return;}
    this.py[i]=rest;this.grounded[i]=1;
    const vn=this.vx[i]*nx+this.vy[i]*ny+this.vz[i]*nz;
    if(vn<0){const k=-vn>BALL_LIMITS.bounceMin?1+this.restitution[i]:1;this.vx[i]-=k*vn*nx;this.vy[i]-=k*vn*ny;this.vz[i]-=k*vn*nz;if(-vn>BALL_LIMITS.bounceMin)this.hitSpeed[i]=Math.max(this.hitSpeed[i],-vn);}
    // Rolling resistance on the tangential velocity; material friction reused from the player.
    const vn2=this.vx[i]*nx+this.vy[i]*ny+this.vz[i]*nz,tx=this.vx[i]-vn2*nx,ty=this.vy[i]-vn2*ny,tz=this.vz[i]-vn2*nz,ts=Math.hypot(tx,ty,tz);
    if(ts<1e-12)return;
    const friction=SURFACE_MOTION[this.env.material?.(x,z)??'grass'].friction,decel=this.rolling[i]*friction*this.g*BALL_LIMITS.rollCoefficient*h;
    const k=ts<=decel?1:decel/ts;this.vx[i]-=tx*k;this.vy[i]-=ty*k;this.vz[i]-=tz*k;
  }
  private collideBoxes(i:number,boxes:readonly StaticBox[],count:number){
    const r=this.radius[i];
    for(let b=0;b<count;b++){
      const box=boxes[b],dx=this.px[i]-box.cx,dz=this.pz[i]-box.cz;
      if(Math.abs(dx)>box.hx+box.hz+r||Math.abs(dz)>box.hx+box.hz+r||this.py[i]+r<box.minY||this.py[i]-r>box.maxY)continue;
      const c=box.cos,s=box.sin,lx=dx*c-dz*s,lz=dx*s+dz*c;
      const qx=Math.max(-box.hx,Math.min(box.hx,lx)),qz=Math.max(-box.hz,Math.min(box.hz,lz)),qy=Math.max(box.minY,Math.min(box.maxY,this.py[i]));
      let ax=lx-qx,ay=this.py[i]-qy,az=lz-qz,d=Math.hypot(ax,ay,az);
      if(d>=r)continue;
      let pen:number;
      if(d>1e-9){ax/=d;ay/=d;az/=d;pen=r-d;}
      else{ // Centre inside the box: leave by the nearest face.
        const fx=box.hx-Math.abs(lx),fz=box.hz-Math.abs(lz),fy=box.maxY-this.py[i];
        if(fy<=fx&&fy<=fz){ax=0;ay=1;az=0;pen=fy+r;}else if(fx<=fz){ax=lx<0?-1:1;ay=0;az=0;pen=fx+r;}else{ax=0;ay=0;az=lz<0?-1:1;pen=fz+r;}
      }
      const nx=ax*c+az*s,nz=-ax*s+az*c,ny=ay;
      this.px[i]+=nx*pen;this.py[i]+=ny*pen;this.pz[i]+=nz*pen;
      const vn=this.vx[i]*nx+this.vy[i]*ny+this.vz[i]*nz;
      if(vn<0){const k=1+Math.min(this.restitution[i],box.restitution);this.vx[i]-=k*vn*nx;this.vy[i]-=k*vn*ny;this.vz[i]-=k*vn*nz;this.hitSpeed[i]=Math.max(this.hitSpeed[i],-vn);}
      if(ny>.7)this.grounded[i]=1;
    }
  }
  private collidePairs(){
    for(let i=0;i<this.count;i++){
      if(!this.enabled[i])continue;
      for(let j=i+1;j<this.count;j++){
        if(!this.enabled[j]||this.asleep[i]&&this.asleep[j])continue;
        const dx=this.px[j]-this.px[i],dy=this.py[j]-this.py[i],dz=this.pz[j]-this.pz[i],R=this.radius[i]+this.radius[j];
        if(Math.abs(dx)>R||Math.abs(dz)>R||Math.abs(dy)>R)continue;
        const d=Math.hypot(dx,dy,dz);if(d>=R||d<1e-9)continue;
        const nx=dx/d,ny=dy/d,nz=dz/d,wi=this.invMass[i],wj=this.invMass[j],w=wi+wj,pen=R-d;
        this.px[i]-=nx*pen*wi/w;this.py[i]-=ny*pen*wi/w;this.pz[i]-=nz*pen*wi/w;
        this.px[j]+=nx*pen*wj/w;this.py[j]+=ny*pen*wj/w;this.pz[j]+=nz*pen*wj/w;
        const vr=(this.vx[j]-this.vx[i])*nx+(this.vy[j]-this.vy[i])*ny+(this.vz[j]-this.vz[i])*nz;
        if(vr>=0)continue;
        const J=-(1+Math.min(this.restitution[i],this.restitution[j]))*vr/w;
        this.vx[i]-=J*wi*nx;this.vy[i]-=J*wi*ny;this.vz[i]-=J*wi*nz;
        this.vx[j]+=J*wj*nx;this.vy[j]+=J*wj*ny;this.vz[j]+=J*wj*nz;
        this.asleep[i]=this.asleep[j]=0;this.idle[i]=this.idle[j]=0;
        this.hitSpeed[i]=Math.max(this.hitSpeed[i],-vr);this.hitSpeed[j]=Math.max(this.hitSpeed[j],-vr);
      }
    }
  }
  snapshot():BallWorldSnapshot{
    const state:number[]=[];
    for(let i=0;i<this.count;i++)state.push(this.px[i],this.py[i],this.pz[i],this.vx[i],this.vy[i],this.vz[i],this.asleep[i],this.enabled[i],this.idle[i]);
    return {ids:this.ids.slice(0,this.count),state};
  }
  restore(s:BallWorldSnapshot){
    if(!s||!Array.isArray(s.ids)||s.ids.length!==this.count||s.ids.some((id,i)=>id!==this.ids[i])||!Array.isArray(s.state)||s.state.length!==this.count*STRIDE||!s.state.every(Number.isFinite))throw Error('Instantané de balles incompatible');
    for(let i=0;i<this.count;i++){const o=i*STRIDE;
      this.px[i]=this.ox[i]=s.state[o];this.py[i]=this.oy[i]=s.state[o+1];this.pz[i]=this.oz[i]=s.state[o+2];
      this.vx[i]=s.state[o+3];this.vy[i]=s.state[o+4];this.vz[i]=s.state[o+5];this.asleep[i]=s.state[o+6]?1:0;this.enabled[i]=s.state[o+7]?1:0;this.idle[i]=s.state[o+8];}
  }
}
