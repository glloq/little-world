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
  sample(x:number,z:number,tick:number):SurfWaveSample|null;
  height(x:number,z:number,tick:number):number|null;
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
     (zone.edgeFade!==undefined&&(!finite(zone.edgeFade)||zone.edgeFade<1||zone.edgeFade>100)))
    throw Error('Zone de surf invalide');
  return zone;
}
export function createSurfWaveField(zone:SurfZone,ground:(x:number,z:number)=>number):SurfWaveField {
  validateSurfZone(zone);
  const k=TAU/zone.wavelength,phaseSeed=(zone.seed%4093)/4093*TAU,edge=zone.edgeFade??12;
  const fadeDepth=zone.shoreFadeDepth??4;
  const bounds=(x:number,z:number)=>x>=zone.minX&&x<=zone.maxX&&z>=zone.minZ&&z<=zone.maxZ;
  const info=(x:number,z:number)=>{
    if(!bounds(x,z))return null;
    const depth=zone.seaLevel-ground(x,z);
    if(!Number.isFinite(depth)||depth<=.05)return null;
    const margin=Math.min(x-zone.minX,zone.maxX-x,z-zone.minZ,zone.maxZ-z);
    const envelope=smooth(depth/fadeDepth)*smooth(margin/edge);
    const breaking=1-smooth(depth/(fadeDepth*1.4));
    return {envelope,breaking};
  };
  const phaseAt=(x:number,z:number,tick:number)=>{
    // Avoid huge trigonometric arguments in long-running local or multiplayer sessions.
    const displacement=zone.dirX*x+zone.dirZ*z-zone.speed*(tick/SURF_TICK_HZ);
    const phase=(displacement/zone.wavelength)%1;
    return TAU*phase+phaseSeed;
  };
  const shape=(p:number)=>Math.sin(p)+.22*Math.sin(2*p);
  const derivative=(p:number)=>Math.cos(p)+.44*Math.cos(2*p);
  const height=(x:number,z:number,tick:number):number|null=>{
    if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick de vague invalide');
    const i=info(x,z);if(!i)return null;
    const phase=phaseAt(x,z,tick);
    return zone.seaLevel+zone.amplitude*i.envelope*shape(phase);
  };
  const sample=(x:number,z:number,tick:number):SurfWaveSample|null=>{
    const h=height(x,z,tick);if(h===null)return null;
    const i=info(x,z)!;
    const phase=phaseAt(x,z,tick),eps=.45;
    const xl=height(x-eps,z,tick)??h,xr=height(x+eps,z,tick)??h;
    const zl=height(x,z-eps,tick)??h,zr=height(x,z+eps,tick)??h;
    const gradientX=(xr-xl)/(2*eps),gradientZ=(zr-zl)/(2*eps);
    const norm=Math.hypot(gradientX,1,gradientZ);
    const displacement=zone.dirX*x+zone.dirZ*z-zone.speed*(tick/SURF_TICK_HZ);
    return {height:h,gradientX,gradientZ,normalX:-gradientX/norm,normalY:1/norm,
      normalZ:-gradientZ/norm,velocityY:-zone.speed*k*zone.amplitude*i.envelope*derivative(phase),
      directionX:zone.dirX,directionZ:zone.dirZ,phaseSpeed:zone.speed,
      crest:(shape(phase)+1.12)/2.24,breaking:i.breaking,
      waveId:Math.floor(displacement/zone.wavelength),zoneId:zone.id};
  };
  return {zone,sample,height};
}
