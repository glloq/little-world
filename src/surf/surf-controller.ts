/** Arcade surf locomotion with conserved momentum, driven only by a fixed simulation tick.
 * Rendering, input events, rewards and ocean meshes never modify this state. */
import type {SurfWaveField,SurfWaveSample} from './wave-field.ts';

export type SurfStage='paddle'|'ride'|'air';
export interface SurfActor {
  position:{x:number;y:number;z:number};
  velocity:{x:number;y:number;z:number};
  mode:string;
  surfStage?:SurfStage;
  surfHeading?:number;
  surfAirborne?:boolean;
  surfWaveId?:number;
  surfPaddleClock?:number;
  surfJumpSeq?:number;
  surfLandingSeq?:number;
  surfWipeoutSeq?:number;
}
export interface SurfInput {
  forward:number;right:number;cameraYaw:number;
  paddle:boolean;jumpPressed:boolean;brake:boolean;pump?:boolean;
}
export interface SurfEvent {
  kind:'none'|'caught'|'paddle'|'jump'|'land'|'wipeout';
  wave:SurfWaveSample|null;
}
export const SURF_MOTION={
  gravity:9.81,maxSpeed:30,turnRate:2.2,
  paddleAccel:4.8,paddleMax:4.8,paddleCycle:.26,
  rideDrag:.08,boardHeight:.12,
  jumpVertical:5.4,jumpSpeedLift:.16,
} as const;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const FALL_SPEED=10;
export function stepSurf(actor:SurfActor,input:SurfInput,field:SurfWaveField,tick:number,dt:number):SurfEvent {
  if(!Number.isFinite(dt)||dt<=0||dt>.25)throw Error('Pas de surf invalide');
  const p=actor.position,v=actor.velocity,at=field.sample(p.x,p.z,tick);
  if(!at){
    actor.surfAirborne=false;actor.surfStage=undefined;
    if(actor.mode==='surf'){actor.mode='swim';v.y=0;}
    return {kind:'none',wave:null};
  }
  let event:SurfEvent['kind']='none';
  const speed0=Math.hypot(v.x,v.z);
  let heading=actor.surfHeading??(speed0>.15?Math.atan2(v.x,v.z):input.cameraYaw);
  if(actor.surfAirborne){
    // Air is an explicit surf sub-state. The ordinary glider/double jump must not intervene.
    v.y-=SURF_MOTION.gravity*dt;
    v.x*=Math.exp(-.02*dt);v.z*=Math.exp(-.02*dt);
    p.x+=v.x*dt;p.z+=v.z*dt;p.y+=v.y*dt;
    const landing=field.sample(p.x,p.z,tick);
    if(landing&&v.y<=0&&p.y<=landing.height+SURF_MOTION.boardHeight){
      if(v.y>=-FALL_SPEED&&Math.abs(v.x*landing.gradientX+v.z*landing.gradientZ)<16){
        p.y=landing.height+SURF_MOTION.boardHeight;
        v.y=landing.velocityY;actor.mode='surf';actor.surfStage='ride';actor.surfAirborne=false;
        actor.surfLandingSeq=(actor.surfLandingSeq??0)+1;event='land';
      }else{
        actor.mode='swim';actor.surfStage=undefined;actor.surfAirborne=false;
        actor.surfWipeoutSeq=(actor.surfWipeoutSeq??0)+1;
        v.x*=.45;v.z*=.45;v.y=0;p.y=landing.height-.48;event='wipeout';
      }
    }else if(!landing&&p.y<=field.zone.seaLevel+.15){
      actor.mode='swim';actor.surfStage=undefined;actor.surfAirborne=false;v.y=0;
      actor.surfWipeoutSeq=(actor.surfWipeoutSeq??0)+1;event='wipeout';
    }
    return {kind:event,wave:landing};
  }
  actor.mode='surf';
  let stage:SurfStage=actor.surfStage==='ride'?'ride':'paddle';
  if(stage==='paddle'){
    const want=input.forward>.1?input.cameraYaw:heading;
    const delta=angle(want-heading),turn=clamp(delta,-2.5*dt,2.5*dt);
    heading=angle(heading+turn);
    actor.surfPaddleClock=Math.max(0,(actor.surfPaddleClock??0)-dt);
    const paddleHeld=input.paddle||input.forward>.15;
    if(paddleHeld&&actor.surfPaddleClock<=0){
      const strength=clamp(1-speed0/SURF_MOTION.paddleMax,.08,1);
      v.x+=Math.sin(heading)*SURF_MOTION.paddleAccel*SURF_MOTION.paddleCycle*strength;
      v.z+=Math.cos(heading)*SURF_MOTION.paddleAccel*SURF_MOTION.paddleCycle*strength;
      actor.surfPaddleClock=SURF_MOTION.paddleCycle;event='paddle';
    }
    const downhill=-(at.gradientX*at.directionX+at.gradientZ*at.directionZ);
    const speed=Math.hypot(v.x,v.z),along=(v.x*at.directionX+v.z*at.directionZ)/Math.max(.001,speed);
    if(downhill>.055&&at.crest>.3&&speed>1.4&&along>.25){stage='ride';event='caught';}
    v.x*=Math.exp(-.3*dt);v.z*=Math.exp(-.3*dt);
  }
  if(stage==='ride'){
    const rotation=-clamp(input.right,-1,1)*SURF_MOTION.turnRate/(1+speed0*.07)*dt;
    heading=angle(heading+rotation);
    const speed=Math.hypot(v.x,v.z);
    const loss=Math.exp(-Math.abs(rotation)*(.08+.012*speed));
    let vx=Math.sin(heading)*speed*loss,vz=Math.cos(heading)*speed*loss;
    const grad=at.gradientX*at.directionX+at.gradientZ*at.directionZ;
    const normal2=1+at.gradientX*at.gradientX+at.gradientZ*at.gradientZ;
    vx+=(-SURF_MOTION.gravity*at.gradientX/normal2)*dt;
    vz+=(-SURF_MOTION.gravity*at.gradientZ/normal2)*dt;
    // A weak wave transport models being carried by a breaking swell. It never sets v=c.
    const carry=clamp(-grad,0,.5)*3.0*(1-at.breaking*.5);
    vx+=at.directionX*carry*dt;vz+=at.directionZ*carry*dt;
    // Pump is effective only on a moving slope, never on flat, stationary water.
    if(input.pump&&Math.abs(grad)>.06&&speed>2){
      const pump=Math.min(.9,Math.abs(grad)*1.8);
      vx+=Math.sin(heading)*pump*dt;vz+=Math.cos(heading)*pump*dt;
    }
    let resistance=SURF_MOTION.rideDrag+.008*speed*speed;
    if(input.brake||input.forward<-.4)resistance+=6;
    const next=Math.hypot(vx,vz),reduced=Math.max(0,next-resistance*dt);
    v.x=next>1e-8?vx*reduced/next:0;v.z=next>1e-8?vz*reduced/next:0;
    // Lose the wave if barely moving and in its trough; recover by paddling.
    if(reduced<1&&at.crest<.32)stage='paddle';
  }
  const speed=Math.hypot(v.x,v.z);
  if(speed>SURF_MOTION.maxSpeed){const k=SURF_MOTION.maxSpeed/speed;v.x*=k;v.z*=k;}
  actor.surfHeading=heading;actor.surfStage=stage;actor.surfWaveId=at.waveId;
  if(input.jumpPressed&&stage==='ride'&&at.crest>.35&&speed>2.2){
    actor.surfStage='air';actor.surfAirborne=true;actor.mode='air';
    v.y=Math.max(0,at.velocityY)+SURF_MOTION.jumpVertical+Math.min(3,speed*SURF_MOTION.jumpSpeedLift);
    actor.surfJumpSeq=(actor.surfJumpSeq??0)+1;event='jump';
  }else v.y=at.velocityY;
  // Horizontal movement here is independent of render interpolation.
  p.x+=v.x*dt;p.z+=v.z*dt;
  if(actor.surfAirborne)p.y+=v.y*dt;
  else {
    const newWave=field.sample(p.x,p.z,tick);
    if(!newWave){actor.mode='swim';actor.surfStage=undefined;v.y=0;event='wipeout';}
    else p.y=newWave.height+SURF_MOTION.boardHeight;
  }
  return {kind:event,wave:at};
}
