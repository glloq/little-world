/** Allocation-free locomotion kernels. No rendering, DOM, world singleton or wall clock.
 * Input yaw/pitch is an intention, independent of the character/camera follow animation. */
export interface Velocity {x:number;y:number;z:number}
export interface FlightState {velocity:Velocity;glideHeading?:number;glidePitch?:number;glideTurnRate?:number;stalled?:boolean;glideDeploymentRemaining?:number}
export const MOTION={gravity:17.2,fallMax:48,walk:4.65,run:8.7,groundAcceleration:28,groundBrake:18,airDrag:.035,airTurn:1.9} as const;
export const GLIDE={minCruise:11,max:60,stall:6,finesse:8,pitchRate:1.25,turnRate:1.15,maxDive:1.05,maxClimb:.58,diveEfficiency:1,drag:.10,speedDrag:.0016,turnLoss:.12,stallPitch:.7} as const;
/** Single bounded arcade assist on first deployment. */
export const GLIDE_DEPLOY={duration:.25,forward:2,lift:.8} as const;
export const ROLL={max:11,downhillMax:18,accel:5,friction:1.2,brake:9,turnRate:1.8,turnLoss:.12,slopeGravity:.5,jump:6.5,minEnter:0,exitSpeed:.6,exitIdle:.35} as const;
export type GroundMaterial='grass'|'rock'|'sand'|'mud'|'wood'|'snow'|'ice';
export const SURFACE_MOTION:Record<GroundMaterial,{friction:number;grip:number}>={grass:{friction:1,grip:1},rock:{friction:.65,grip:.85},sand:{friction:2.1,grip:.8},mud:{friction:2.8,grip:.55},wood:{friction:.8,grip:.95},snow:{friction:.18,grip:.75},ice:{friction:.035,grip:.3}};
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export function groundVelocity(v:Velocity,dx:number,dz:number,speed:number,dt:number){
 const x=dx*speed-v.x,z=dz*speed-v.z,d=Math.hypot(x,z),a=(dx||dz?MOTION.groundAcceleration:MOTION.groundBrake)*dt;
 const k=d>a?a/d:1;v.x+=x*k;v.z+=z*k;
}
/** Air steering preserves launch momentum; no-input flight no longer brakes toward zero. */
export function airVelocity(v:Velocity,dx:number,dz:number,speed:number,dt:number){
 let s=Math.hypot(v.x,v.z)*Math.exp(-MOTION.airDrag*dt);
 if(dx||dz){const heading=Math.atan2(v.x,v.z),turn=clamp(angleDelta(heading,Math.atan2(dx,dz)),-MOTION.airTurn*dt,MOTION.airTurn*dt);
  if(s<speed)s+=(speed-s)*(1-Math.exp(-MOTION.airTurn*dt));
  v.x=Math.sin(heading+turn)*s;v.z=Math.cos(heading+turn)*s;
 }else{const k=s/(Math.hypot(v.x,v.z)||1);v.x*=k;v.z*=k;}
 v.y=Math.max(-MOTION.fallMax,v.y-MOTION.gravity*dt);
}
/** Relative turn intent: the view angle never becomes a flight heading. */
export function glideSteeringYaw(p:FlightState,right:number,dt:number,tuning:Readonly<Record<keyof typeof GLIDE,number>>=GLIDE){
 const v=p.velocity,speed=Math.hypot(v.x,v.y,v.z),horizontal=Math.hypot(v.x,v.z);
 const heading=p.glideHeading??(horizontal>.1?Math.atan2(v.x,v.z):0);
 const maxTurn=tuning.turnRate*dt/(1+Math.max(0,speed-15)*.022);
 return heading-clamp(right,-1,1)*maxTurn;
}
/** Spread the single launch assist over fixed simulation steps; never orient it to the camera.
 * This is deliberate gameplay energy, distinct from gravity and the consumable gas boost. */
export function glideDeploymentStep(p:FlightState,dt:number){
 const remaining=p.glideDeploymentRemaining??0;
 if(remaining<=0)return;
 const portion=Math.min(dt,remaining)/GLIDE_DEPLOY.duration;
 p.glideDeploymentRemaining=Math.max(0,remaining-dt);
 const v=p.velocity,before=Math.hypot(v.x,v.y,v.z);
 const horizontal=Math.hypot(v.x,v.z);
 const heading=p.glideHeading??(horizontal>.1?Math.atan2(v.x,v.z):0);
 const dv=Math.min(GLIDE_DEPLOY.forward*portion,Math.max(0,GLIDE.max-before));
 v.x+=Math.sin(heading)*dv;v.z+=Math.cos(heading)*dv;v.y+=GLIDE_DEPLOY.lift*portion;
 const speed=Math.hypot(v.x,v.y,v.z);
 if(speed>GLIDE.max){const k=GLIDE.max/speed;v.x*=k;v.y*=k;v.z*=k;}
 p.glidePitch=clamp(Math.atan2(v.y,Math.max(Math.hypot(v.x,v.z),.01)),-GLIDE.maxDive,GLIDE.maxClimb);
}
/** Arcade glider with a dissipative energy budget E = |v|²/2 + gravity*altitude.
 * Steering rotates velocity without thrust. The positive quadratic root accounts for the
 * height traversed by the integration's final velocity: climbing spends kinetic energy,
 * diving gains speed, drag/turns only remove energy. No minimum-speed injection. */
export function glideVelocity(p:FlightState,yaw:number,pitchControl:number,brake:number,dt:number,tuning:Readonly<Record<keyof typeof GLIDE,number>>=GLIDE,boostAcceleration=0,turnLossFactor=1){
 const v=p.velocity,speed=Math.hypot(v.x,v.y,v.z),horizontal=Math.hypot(v.x,v.z);
 let heading=p.glideHeading??(horizontal>.1?Math.atan2(v.x,v.z):yaw);
 let pitch=p.glidePitch??Math.atan2(v.y,Math.max(horizontal,.01));
 // At high speed the turn radius grows: no instantaneous high-speed turns.
 const maxTurn=tuning.turnRate*dt/(1+Math.max(0,speed-15)*.022);
 const turn=clamp(angleDelta(heading,yaw),-maxTurn,maxTurn);heading+=turn;
 const stall=clamp((tuning.stall-speed)/tuning.stall,0,1);
 let target=clamp(-pitchControl-Math.atan(1/tuning.finesse),-tuning.maxDive,tuning.maxClimb);
 target=target*(1-stall)-tuning.stallPitch*stall;
 pitch+=clamp(target-pitch,-tuning.pitchRate*dt,tuning.pitchRate*dt);
 // Stall sinks rather than granting forward speed; recovering requires altitude.
 pitch=clamp(pitch,-tuning.maxDive,tuning.maxClimb);
 // Induced drag dominates near stall; parasitic drag dominates at speed. Both dissipate
 // energy, leaving enough powered thrust to reach the experimental 60 m/s cap.
 const induced=MOTION.gravity/tuning.finesse*(tuning.minCruise/Math.max(speed,tuning.stall))**2;
 const drag=tuning.drag+induced+tuning.speedDrag*speed*speed+clamp(brake,0,1)*1.5;
 const work=drag*Math.max(speed,.1)*dt+tuning.turnLoss*Math.max(0,Math.min(1,turnLossFactor))*Math.abs(turn)*speed*speed;
 const verticalGravity=MOTION.gravity*Math.sin(pitch);
 const a=verticalGravity*dt*(verticalGravity<0?clamp(tuning.diveEfficiency,0,1):1);
 const next=Math.min(tuning.max,Math.max(0,Math.sqrt(a*a+Math.max(0,(speed+Math.max(0,boostAcceleration)*dt)**2-2*work))-a));
 const h=Math.cos(pitch)*next;v.x=Math.sin(heading)*h;v.z=Math.cos(heading)*h;v.y=Math.sin(pitch)*next;
 p.glideHeading=heading;p.glidePitch=pitch;p.glideTurnRate=turn/dt;p.stalled=speed<tuning.stall;
}
export function movementEnergy(y:number,v:Velocity){return MOTION.gravity*y+(v.x*v.x+v.y*v.y+v.z*v.z)/2;}
