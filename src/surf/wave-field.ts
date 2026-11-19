/** Deterministic, height-field surf swells. No Three.js, clock, DOM or GPU dependency.
 * The global water datum stays unchanged for boats, swimming, fishing and immersion.
 * Coordinates are metres (Y up), simulation clock is the fixed 30 Hz movement tick. */
export interface SurfZone {
  id:string;
  minX:number;maxX:number;minZ:number;maxZ:number;
  /** Unit travel direction: the swell propagates FROM the open sea TO the coast. */
  dirX:number;dirZ:number;
  seaLevel:number;
  amplitude:number;wavelength:number;speed:number;
  seed:number;
  shoreFadeDepth?:number;
  edgeFade?:number;
  /** Optional 0..1 breaking lip. Absent keeps historical surf zones unchanged. */
  barrelStrength?:number;
}
export interface SurfWaveSample {
  height:number;gradientX:number;gradientZ:number;
  normalX:number;normalY:number;normalZ:number;
  velocityY:number;
  directionX:number;directionZ:number;phaseSpeed:number;
  crest:number;breaking:number;waveId:number;zoneId:string;
}
export interface SurfWaveField {
  readonly zone:SurfZone;
  /** Physics model generation (see SURF_WAVE_MODEL); absent on V1 or test doubles. */
  readonly model?:number;
  sample(x:number,z:number,tick:number):SurfWaveSample|null;
  height(x:number,z:number,tick:number):number|null;
  /** Forget memoised seabed samples after an authoring edit of the terrain. */
  invalidateGround?():void;
}
export const SURF_TICK_HZ=30;
const TAU=2*Math.PI;
const finite=(n:number)=>Number.isFinite(n);
const smooth=(n:number)=>{const x=Math.max(0,Math.min(1,n));return x*x*(3-2*x);};
export function validateSurfZone(zone:SurfZone):SurfZone {
  if(!zone||!/^surf:[a-z0-9_-]{1,80}$/.test(zone.id)||
     ![zone.minX,zone.maxX,zone.minZ,zone.maxZ,zone.dirX,zone.dirZ,zone.seaLevel,
       zone.amplitude,zone.wavelength,zone.speed,zone.seed].every(finite)||
     zone.minX>=zone.maxX||zone.minZ>=zone.maxZ||
     Math.max(Math.abs(zone.minX),Math.abs(zone.maxX),Math.abs(zone.minZ),Math.abs(zone.maxZ))>100000||
     Math.abs(Math.hypot(zone.dirX,zone.dirZ)-1)>1e-4||
     zone.amplitude<.05||zone.amplitude>5||zone.wavelength<4||zone.wavelength>120||
     zone.speed<.5||zone.speed>22||!Number.isSafeInteger(zone.seed)||zone.seed<0||
     (zone.shoreFadeDepth!==undefined&&(!finite(zone.shoreFadeDepth)||zone.shoreFadeDepth<.3||zone.shoreFadeDepth>20))||
     (zone.edgeFade!==undefined&&(!finite(zone.edgeFade)||zone.edgeFade<1||zone.edgeFade>100))||
     (zone.barrelStrength!==undefined&&(!finite(zone.barrelStrength)||zone.barrelStrength<0||zone.barrelStrength>1)))
    throw Error('Zone de surf invalide');
  return zone;
}
/** Physics model generation. 1: finite-difference gradient (main@1e87184, frozen in
 * tests/fixtures/surf/wave-field-v1.ts). 2: same height and vertical velocity bit for bit,
 * analytic gradient (exact swell derivative + exact envelope derivative). */
export const SURF_WAVE_MODEL=2;
/** Half-step of the terrain central difference used for the depth-envelope derivative. */
export const SURF_GROUND_GRADIENT_STEP=.45;
export function createSurfWaveField(zone:SurfZone,ground:(x:number,z:number)=>number):SurfWaveField {
  validateSurfZone(zone);
  // Constant coefficients, computed once per zone.
  const k=TAU/zone.wavelength,phaseSeed=(zone.seed%4093)/4093*TAU,edge=zone.edgeFade??12;
  const fadeDepth=zone.shoreFadeDepth??4,breakDepth=fadeDepth*1.4;
  const {minX,maxX,minZ,maxZ,dirX,dirZ,seaLevel,amplitude,wavelength,speed}=zone;
  const kx=k*dirX,kz=k*dirZ,velocityScale=-speed*k*amplitude,eps=SURF_GROUND_GRADIENT_STEP;
  // Expressions kept in the V1 evaluation order: identical float results for height.
  const phaseAt=(x:number,z:number,tick:number)=>{
    // Avoid huge trigonometric arguments in long-running local or multiplayer sessions.
    const displacement=dirX*x+dirZ*z-speed*(tick/SURF_TICK_HZ);
    const phase=(displacement/wavelength)%1;
    return TAU*phase+phaseSeed;
  };
  // Exact two-entry memo of the static seabed: the rider re-samples the same (x,z) at the end
  // of a tick and at the start of the next. Bit-identical: a key is reused only on equality.
  let mx0=NaN,mz0=NaN,mg0=0,mx1=NaN,mz1=NaN,mg1=0,memoSlot=0;
  const seabed=(x:number,z:number)=>{
    if(x===mx0&&z===mz0)return mg0;
    if(x===mx1&&z===mz1)return mg1;
    const g=ground(x,z);
    if(memoSlot===0){mx0=x;mz0=z;mg0=g;}else{mx1=x;mz1=z;mg1=g;}
    memoSlot^=1;return g;
  };
  const checkTick=(tick:number)=>{if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick de vague invalide');};
  const height=(x:number,z:number,tick:number):number|null=>{
    checkTick(tick);
    if(!(x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ))return null;
    const depth=seaLevel-seabed(x,z);
    if(!Number.isFinite(depth)||depth<=.05)return null;
    const margin=Math.min(x-minX,maxX-x,z-minZ,maxZ-z);
    const envelope=smooth(depth/fadeDepth)*smooth(margin/edge);
    const p=phaseAt(x,z,tick);
    return seaLevel+amplitude*envelope*(Math.sin(p)+.22*Math.sin(2*p));
  };
  const sample=(x:number,z:number,tick:number):SurfWaveSample|null=>{
    checkTick(tick);
    if(!(x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ))return null;
    const depth=seaLevel-seabed(x,z);
    if(!Number.isFinite(depth)||depth<=.05)return null;
    // Margin to the nearest zone side and its constant gradient (±1 along one axis).
    const left=x-minX,right=maxX-x,back=z-minZ,front=maxZ-z;
    const margin=Math.min(left,right,back,front);
    const mx=margin===left?1:margin===right?-1:0,mz=mx!==0?0:margin===back?1:-1;
    const ud=depth/fadeDepth,um=margin/edge;
    const sd=smooth(ud),sm=smooth(um),envelope=sd*sm;
    // d smooth(u)/du = 6u(1-u) on ]0,1[, 0 where clamped: deep water needs no extra terrain sample.
    const dsd=ud>0&&ud<1?6*ud*(1-ud)/fadeDepth:0,dsm=um>0&&um<1?6*um*(1-um)/edge:0;
    let envX=sd*dsm*mx,envZ=sd*dsm*mz;
    if(dsd!==0){
      // dDepth = -dGround: central terrain difference, the only extra samples (shallow band only).
      const gx=(ground(x+eps,z)-ground(x-eps,z))/(2*eps),gz=(ground(x,z+eps)-ground(x,z-eps))/(2*eps);
      if(Number.isFinite(gx))envX-=dsd*gx*sm;
      if(Number.isFinite(gz))envZ-=dsd*gz*sm;
    }
    const displacement=dirX*x+dirZ*z-speed*(tick/SURF_TICK_HZ);
    const p=TAU*((displacement/wavelength)%1)+phaseSeed;
    const s1=Math.sin(p),s2=Math.sin(2*p),c1=Math.cos(p),c2=Math.cos(2*p);
    const shape=s1+.22*s2,derivative=c1+.44*c2;
    const h=seaLevel+amplitude*envelope*shape;
    const gradientX=amplitude*(envX*shape+envelope*derivative*kx);
    const gradientZ=amplitude*(envZ*shape+envelope*derivative*kz);
    const norm=Math.hypot(gradientX,1,gradientZ);
    return {height:h,gradientX,gradientZ,normalX:-gradientX/norm,normalY:1/norm,
      normalZ:-gradientZ/norm,velocityY:velocityScale*envelope*derivative,
      directionX:dirX,directionZ:dirZ,phaseSpeed:speed,
      crest:(shape+1.12)/2.24,breaking:1-smooth(depth/breakDepth),
      waveId:Math.floor(displacement/wavelength),zoneId:zone.id};
  };
  return {zone,model:SURF_WAVE_MODEL,sample,height,
    invalidateGround(){mx0=mz0=mx1=mz1=NaN;}};
}
