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
  /** Optional swell shape family (wave-shape.ts). Absent = 'classic' = historical profile. */
  style?:SurfWaveStyle;
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
import {isSurfWaveStyle,shapeRange,surfWaveShape,type SurfWaveStyle} from './wave-shape.ts';
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
     (zone.barrelStrength!==undefined&&(!finite(zone.barrelStrength)||zone.barrelStrength<0||zone.barrelStrength>1))||
     (zone.style!==undefined&&!isSurfWaveStyle(zone.style)))
    throw Error('Zone de surf invalide');
  return zone;
}
/** Physics model generation. 1: finite-difference gradient (main@1e87184, frozen in
 * tests/fixtures/surf/wave-field-v1.ts). 2: same height and vertical velocity bit for bit,
 * analytic gradient (exact swell derivative + exact envelope derivative). */
export const SURF_WAVE_MODEL=2;
/** Half-step of the terrain central difference used for the depth-envelope derivative. */
export const SURF_GROUND_GRADIENT_STEP=.45;
/** Static per-zone coefficients shared by the physics field, the tube and the GPU shader. */
export interface SurfSwellCoefficients {
 classic:boolean;skew:number;sharpness:number;shoal:number;
 setVariation:number;setWavelength:number;setSeed:number;
 peakVariation:number;peakWavelength:number;peakSeed:number;
 crestOffset:number;crestRange:number;
}
export function surfSwellCoefficients(zone:SurfZone):SurfSwellCoefficients{
 const shape=surfWaveShape(zone.style),classic=zone.style===undefined||zone.style==='classic';
 const range=classic?{offset:1.12,range:2.24}:shapeRange(shape.skew+shape.shoal*.5,shape.sharpness);
 return {classic,skew:shape.skew,sharpness:shape.sharpness,shoal:shape.shoal,
  setVariation:shape.setVariation,setWavelength:zone.wavelength*shape.setLength,
  setSeed:((zone.seed*7+13)%4099)/4099*TAU,
  peakVariation:shape.peakVariation,peakWavelength:zone.wavelength*shape.peakSpacing,
  peakSeed:((zone.seed*13+5)%4111)/4111*TAU,crestOffset:range.offset,crestRange:range.range};
}
/** Slow deterministic swell modulation m (sets travelling with the swell × static crest peaks).
 * Exactly 1 for classic zones. Shared by the tube volume and its 3D lip. */
export function surfSwellModulation(zone:SurfZone,q:SurfSwellCoefficients,x:number,z:number,tick:number):number{
 if(q.setVariation===0&&q.peakVariation===0)return 1;
 const displacement=zone.dirX*x+zone.dirZ*z-zone.speed*(tick/SURF_TICK_HZ);
 const across=-zone.dirZ*x+zone.dirX*z;
 return 1+q.setVariation*Math.sin(TAU*((displacement/q.setWavelength)%1)+q.setSeed)+
  q.peakVariation*Math.sin(TAU*((across/q.peakWavelength)%1)+q.peakSeed);
}
export function createSurfWaveField(zone:SurfZone,ground:(x:number,z:number)=>number):SurfWaveField {
  validateSurfZone(zone);
  // Constant coefficients, computed once per zone.
  const k=TAU/zone.wavelength,phaseSeed=(zone.seed%4093)/4093*TAU,edge=zone.edgeFade??12;
  const fadeDepth=zone.shoreFadeDepth??4,breakDepth=fadeDepth*1.4;
  const {minX,maxX,minZ,maxZ,dirX,dirZ,seaLevel,amplitude,wavelength,speed}=zone;
  const kx=k*dirX,kz=k*dirZ,velocityScale=-speed*k*amplitude,eps=SURF_GROUND_GRADIENT_STEP;
  const q=surfSwellCoefficients(zone),{skew,sharpness,shoal,setVariation,peakVariation}=q;
  const modulated=setVariation!==0||peakVariation!==0;
  const setK=TAU/q.setWavelength,peakK=TAU/q.peakWavelength;
  const modulation=(x:number,z:number,tick:number)=>modulated?surfSwellModulation(zone,q,x,z,tick):1;
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
    const a=shoal===0?skew:skew+shoal*(1-smooth(depth/breakDepth));
    const f=sharpness===0?Math.sin(p)+a*Math.sin(2*p):Math.sin(p)+a*Math.sin(2*p)-sharpness*Math.cos(2*p);
    return seaLevel+amplitude*envelope*modulation(x,z,tick)*f;
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
    const ud=depth/fadeDepth,um=margin/edge,ub=depth/breakDepth;
    const sd=smooth(ud),sm=smooth(um),envelope=sd*sm,breaking=1-smooth(ub);
    // d smooth(u)/du = 6u(1-u) on ]0,1[, 0 where clamped: deep water needs no extra terrain sample.
    const dsd=ud>0&&ud<1?6*ud*(1-ud)/fadeDepth:0,dsm=um>0&&um<1?6*um*(1-um)/edge:0;
    // Shoaling skew a(depth) also varies inside the breaking band.
    const dsb=shoal!==0&&ub>0&&ub<1?6*ub*(1-ub)/breakDepth:0;
    let envX=sd*dsm*mx,envZ=sd*dsm*mz,groundX=0,groundZ=0;
    if(dsd!==0||dsb!==0){
      // dDepth = -dGround: central terrain difference, the only extra samples (shallow band only).
      const gx=(ground(x+eps,z)-ground(x-eps,z))/(2*eps),gz=(ground(x,z+eps)-ground(x,z-eps))/(2*eps);
      if(Number.isFinite(gx))groundX=gx;
      if(Number.isFinite(gz))groundZ=gz;
      envX-=dsd*groundX*sm;envZ-=dsd*groundZ*sm;
    }
    const displacement=dirX*x+dirZ*z-speed*(tick/SURF_TICK_HZ);
    const p=TAU*((displacement/wavelength)%1)+phaseSeed;
    const a=shoal===0?skew:skew+shoal*breaking;
    const s1=Math.sin(p),s2=Math.sin(2*p),c1=Math.cos(p),c2=Math.cos(2*p);
    const shape=sharpness===0?s1+a*s2:s1+a*s2-sharpness*c2;
    const derivative=sharpness===0?c1+2*a*c2:c1+2*a*c2+2*sharpness*s2;
    // Slow modulation m and its gradient / time derivative (all exactly neutral when classic).
    let m=1,mX=0,mZ=0,mT=0;
    if(modulated){
      const across=-dirZ*x+dirX*z;
      const ps=TAU*((displacement/q.setWavelength)%1)+q.setSeed,pc=TAU*((across/q.peakWavelength)%1)+q.peakSeed;
      const cs=setVariation*Math.cos(ps)*setK,cc=peakVariation*Math.cos(pc)*peakK;
      m=1+setVariation*Math.sin(ps)+peakVariation*Math.sin(pc);
      mX=cs*dirX-cc*dirZ;mZ=cs*dirZ+cc*dirX;mT=-speed*cs;
    }
    const h=seaLevel+amplitude*envelope*m*shape;
    // df/da · ∇a with ∇a = shoal·∇breaking = shoal·smooth'(ub)/breakDepth·∇ground.
    const shoalX=dsb*shoal*groundX*s2,shoalZ=dsb*shoal*groundZ*s2;
    const gradientX=amplitude*(envX*m*shape+envelope*(mX*shape+m*(derivative*kx+shoalX)));
    const gradientZ=amplitude*(envZ*m*shape+envelope*(mZ*shape+m*(derivative*kz+shoalZ)));
    const norm=Math.hypot(gradientX,1,gradientZ);
    let velocityY=velocityScale*envelope*(m*derivative);
    if(modulated)velocityY+=amplitude*envelope*mT*shape;
    const crest=q.classic?(shape+1.12)/2.24:Math.max(0,Math.min(1,(shape+q.crestOffset)/q.crestRange));
    return {height:h,gradientX,gradientZ,normalX:-gradientX/norm,normalY:1/norm,
      normalZ:-gradientZ/norm,velocityY,
      directionX:dirX,directionZ:dirZ,phaseSpeed:speed,
      crest,breaking,
      waveId:Math.floor(displacement/wavelength),zoneId:zone.id};
  };
  return {zone,model:SURF_WAVE_MODEL,sample,height,
    invalidateGround(){mx0=mz0=mx1=mz1=NaN;}};
}
