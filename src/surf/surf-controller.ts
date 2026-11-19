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
  /** Gas boost acceleration along the board (m/s², from gasBoostStep; 0 when idle). */
  boost?:number;
}
export interface SurfEvent {
  kind:'none'|'caught'|'paddle'|'jump'|'land'|'wipeout';
  wave:SurfWaveSample|null;
}
/** Arcade surfing (old low-poly surf games): the face catches a board pointed at the shore,
 * then holds it at a sweet spot on the face while the player carves down the line. */
export const SURF_MOTION={
  gravity:9.81,maxSpeed:30,turnRate:2.4,
  /** Paddling stays slower than the swells, so a wave always reaches a waiting surfer quickly. */
  paddleAccel:4.8,paddleMax:3.2,paddleCycle:.26,
  rideDrag:.08,boardHeight:.12,
  jumpVertical:5.6,jumpSpeedLift:.16,paddleJumpVertical:4.2,lipJumpBonus:1.6,
  /** Catch window: anywhere except the upper back of a passing crest, board facing the shore. */
  catchBackCrest:.45,catchCrestMax:.97,catchFacing:.2,
  /** On the back of a wave the board waits (slower than the swell) for the next face. */
  backLock:.3,
  /** Face lock: along-wave speed relaxes to the wave speed, settling at crest ≈ 0.7. */
  lockRate:3.2,lockSweetSpot:.68,lockGain:1.2,
  /** Down-the-line speed: base + face slope, carving converts it across the wave. */
  rideBase:6,rideSlopeGain:16,rideMax:15,rideRelax:2.6,boostBleed:.45,
  /** Landing tolerance (m/s) for big airs. */
  maxLandingFall:14,
  /** Share of the gas thrust used on the board. */
  boostShare:.25,
  /** Largest board angle from the wave direction while riding (≈ 95°: along the line). */
  maxLineAngle:1.66,
} as const;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
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
    // A little air control: the board can be turned before landing.
    heading=angle(heading-clamp(input.right,-1,1)*SURF_MOTION.turnRate*.6*dt);
    p.x+=v.x*dt;p.z+=v.z*dt;p.y+=v.y*dt;
    const landing=field.sample(p.x,p.z,tick);
    if(landing&&v.y<=0&&p.y<=landing.height+SURF_MOTION.boardHeight){
      if(v.y>=-SURF_MOTION.maxLandingFall&&Math.abs(v.x*landing.gradientX+v.z*landing.gradientZ)<18){
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
    actor.surfHeading=heading;
    return {kind:event,wave:landing};
  }
  actor.mode='surf';
  let stage:SurfStage=actor.surfStage==='ride'?'ride':'paddle';
  // Wave frame: along = travel direction of the swell (toward the shore), across = down the line.
  const dx=at.directionX,dz=at.directionZ,ax=-dz,az=dx;
  const downhill=-(at.gradientX*dx+at.gradientZ*dz);
  // Front face ⇔ the water is rising under the board (independent of the zone envelope slope).
  const rising=at.velocityY>0;
  const boost=Math.max(0,input.boost??0)*SURF_MOTION.boostShare;
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
    v.x+=Math.sin(heading)*boost*dt;v.z+=Math.cos(heading)*boost*dt;
    // Arcade catch: the face reaching a board pointed at the shore pops the surfer up at
    // the wave speed. No speed threshold: paddling (or a boost) toward shore is enough.
    const facing=Math.sin(heading)*dx+Math.cos(heading)*dz;
    const alongNow=v.x*dx+v.z*dz;
    const catchable=at.crest<SURF_MOTION.catchCrestMax&&(rising||at.crest<SURF_MOTION.catchBackCrest);
    if(catchable&&facing>SURF_MOTION.catchFacing&&(paddleHeld||boost>0||alongNow>.5)){
      stage='ride';event='caught';
      const across=v.x*ax+v.z*az,along=Math.max(alongNow,at.phaseSpeed*(rising?.95:SURF_MOTION.backLock));
      v.x=dx*along+ax*across;v.z=dz*along+az*across;
    }else{v.x*=Math.exp(-.3*dt);v.z*=Math.exp(-.3*dt);}
  }
  if(stage==='ride'){
    const rotation=-clamp(input.right,-1,1)*SURF_MOTION.turnRate/(1+speed0*.04)*dt;
    // Arcade steering: holding a direction runs down the line instead of spinning back to sea.
    const waveHeading=Math.atan2(dx,dz);
    heading=angle(waveHeading+clamp(angle(heading+rotation-waveHeading),-SURF_MOTION.maxLineAngle,SURF_MOTION.maxLineAngle));
    const hx=Math.sin(heading),hz=Math.cos(heading);
    const facing=hx*dx+hz*dz,line=hx*ax+hz*az;
    let along=v.x*dx+v.z*dz,across=v.x*ax+v.z*az;
    // Face lock: along-wave speed relaxes toward the wave speed, faster high on the face and
    // slower ahead of it, so the board settles near the sweet spot instead of being dropped.
    // Back of a wave: wait at a slower pace until the next face arrives (continuous at the trough).
    const target=rising?at.phaseSpeed*(1+SURF_MOTION.lockGain*(at.crest-SURF_MOTION.lockSweetSpot)):
      at.phaseSpeed*SURF_MOTION.backLock;
    const lock=(1-Math.exp(-SURF_MOTION.lockRate*dt))*(facing>-.35?1:.15);
    along+=(target-along)*lock;
    // Down the line: the face slope feeds the carving speed, heading chooses the side.
    const lineSpeed=clamp(SURF_MOTION.rideBase+SURF_MOTION.rideSlopeGain*Math.max(0,downhill)+(input.pump?1.2:0),
      0,SURF_MOTION.rideMax);
    // Extra speed (gas boost, boost pads) bleeds off slowly; missing speed builds up quickly.
    const lineTarget=line*lineSpeed,excess=Math.sign(across)===Math.sign(lineTarget)&&Math.abs(across)>Math.abs(lineTarget);
    across+=(lineTarget-across)*(1-Math.exp(-(excess?SURF_MOTION.boostBleed:SURF_MOTION.rideRelax)*dt));
    // Cross-slope gravity (curved crests, peaks) and the gas boost along the board.
    const normal2=1+at.gradientX*at.gradientX+at.gradientZ*at.gradientZ;
    across+=-SURF_MOTION.gravity*(at.gradientX*ax+at.gradientZ*az)/normal2*dt;
    along+=boost*facing*dt;across+=boost*line*dt;
    if(input.brake)across*=Math.exp(-3*dt);
    v.x=dx*along+ax*across;v.z=dz*along+az*across;
    // Leaving the wave is a choice (S / back): no silent drop-off.
    if(input.forward<-.6)stage='paddle';
  }
  const speed=Math.hypot(v.x,v.z);
  if(speed>SURF_MOTION.maxSpeed){const k=SURF_MOTION.maxSpeed/speed;v.x*=k;v.z*=k;}
  actor.surfHeading=heading;actor.surfStage=stage;actor.surfWaveId=at.waveId;
  if(input.jumpPressed){
    // Space jumps anywhere on the wave: a pop while paddling, a big air from the lip when riding.
    const riding=stage==='ride';
    const lift=riding?SURF_MOTION.jumpVertical+Math.min(3,speed*SURF_MOTION.jumpSpeedLift)+
      (at.crest>.8?SURF_MOTION.lipJumpBonus:0):SURF_MOTION.paddleJumpVertical;
    actor.surfStage='air';actor.surfAirborne=true;actor.mode='air';
    v.y=Math.max(0,at.velocityY)+lift;
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
