/** Deterministic downhill skiing: no DOM, meshes, transport or global state. */
export type SnowEquipment = 'snowboard' | 'skis';
export type SnowMaterial = 'snow' | 'ice';
export interface SnowPoint { x:number; y:number; z:number }
export interface SnowActor {
  position:SnowPoint; velocity:SnowPoint;
  snowHeading?:number; snowEdge?:number;
}
export interface SnowInput { right:number; forward:number; brake:boolean; cameraYaw:number }
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
export const SNOW_TUNING={
  gravity:17.2, maxSpeed:26, sampleM:.65,
  snowFriction:.065, iceFriction:.025,
  airDrag:.007, edgeBrake:5.5, hardBrake:9,
  boardTurn:1.5, skiTurn:1.85
} as const;
/** Finite-difference slope; sign is positive uphill, independent of camera. */
export function snowGradient(height:(x:number,z:number)=>number,x:number,z:number,e=SNOW_TUNING.sampleM){
  const gx=(height(x+e,z)-height(x-e,z))/(2*e),gz=(height(x,z+e)-height(x,z-e))/(2*e);
  return {x:gx,z:gz,grade:Math.hypot(gx,gz)};
}
/** Momentum is preserved across turns and gradients. Player input never supplies free downhill speed. */
export function stepSnowSlide(actor:SnowActor,input:SnowInput,height:(x:number,z:number)=>number,
    surface:SnowMaterial,equipment:SnowEquipment,dt:number):void {
  if(!Number.isFinite(dt)||dt<=0||dt>.25)throw Error('Snow dt invalide');
  const v=actor.velocity,pos=actor.position;
  let speed=Math.hypot(v.x,v.z);
  let heading=actor.snowHeading??(speed>.1?Math.atan2(v.x,v.z):input.cameraYaw);
  const grip=surface==='ice'?.48:equipment==='skis'?1.12:1;
  const steer=clamp(input.right,-1,1);
  const maxTurn=(equipment==='skis'?SNOW_TUNING.skiTurn:SNOW_TUNING.boardTurn)*grip/(1+speed*.065);
  const turn=steer*maxTurn*dt;
  heading=wrap(heading-turn);
  // Steering dissipates a small amount of energy, rather than acting as thrust.
  speed*=Math.exp(-Math.abs(turn)*(.12+speed*.005));
  const grad=snowGradient(height,pos.x,pos.z);
  const denom=Math.sqrt(1+grad.grade*grad.grade),g=SNOW_TUNING.gravity;
  // Tangential gravity projected to the terrain's local plane.
  let dx=-g*grad.x/(denom*denom),dz=-g*grad.z/(denom*denom);
  const mu=surface==='ice'?SNOW_TUNING.iceFriction:SNOW_TUNING.snowFriction;
  const friction=mu*g/denom;
  const brake=clamp(-input.forward,0,1)*SNOW_TUNING.edgeBrake+
    (input.brake?SNOW_TUNING.hardBrake:0);
  const resistance=friction+brake+SNOW_TUNING.airDrag*speed*speed;
  let vx=Math.sin(heading)*speed,vz=Math.cos(heading)*speed;
  vx+=dx*dt;vz+=dz*dt;
  const next=Math.hypot(vx,vz);
  const reduced=Math.max(0,next-resistance*dt);
  if(next>1e-8){vx*=reduced/next;vz*=reduced/next;}
  const bounded=Math.hypot(vx,vz),scale=bounded>SNOW_TUNING.maxSpeed?SNOW_TUNING.maxSpeed/bounded:1;
  v.x=vx*scale;v.z=vz*scale;
  actor.snowHeading=Math.hypot(v.x,v.z)>.12?Math.atan2(v.x,v.z):heading;
  actor.snowEdge=steer*grip;
}
