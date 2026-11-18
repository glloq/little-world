/** Shared, rendering-independent race rules. Suitable for solo simulation and future server authority. */
export type RaceKind='flight'|'roll'|'mixed';
export type RaceMotionMode='ground'|'roll'|'air'|'glide';
export interface RacePoint {x:number;y:number;z:number}
export interface RaceBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface RaceGate {
  id:string;
  center:RacePoint;
  /** Horizontal unit normal in the intended direction of travel. */
  normal:RacePoint;
  shape:'circle'|'rectangle';
  /** Clear opening in metres, not the decorative mesh's dimensions. */
  width:number;height:number;
  allowedModes?:readonly RaceMotionMode[];
}
export interface RaceDefinition {
  id:string;name:string;version:1;worldId:string;layoutKey:string;
  kind:RaceKind;
  /** Practice courses do not participate in competitive leaderboards. */
  classification:'practice'|'standard'|'free';
  gates:readonly RaceGate[];
  maxTicks:number;
}
export interface RaceSession {
  definition:RaceDefinition;
  status:'running'|'finished'|'failed';
  startTick:number;lastTick:number;nextGate:number;
  finishSeconds:number|null;usedPulses:number;lastPulseSeq:number;
}
export interface RaceStep {
  tick:number;previous:RacePoint;position:RacePoint;mode:string;
  pulseSeq:number;transitioned?:boolean;
}
export type RaceEvent =
 | {kind:'checkpoint';gateIndex:number}
 | {kind:'finish';gateIndex:number;seconds:number}
 | {kind:'failed';reason:string};
export const RACE_TICK_HZ=30;
const finite=(v:number)=>Number.isFinite(v)&&Math.abs(v)<=100000;
const finitePoint=(p:RacePoint)=>!!p&&finite(p.x)&&finite(p.y)&&finite(p.z);
const distance=(a:RacePoint,b:RacePoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const allowed:readonly RaceMotionMode[]=['ground','roll','air','glide'];
export function validateRace(def:RaceDefinition,bounds?:RaceBounds):RaceDefinition{
  if(!def||def.version!==1||!def.id||!def.name||!def.worldId||!def.layoutKey||
     !['flight','roll','mixed'].includes(def.kind)||
     !['practice','standard','free'].includes(def.classification)||
     !Number.isSafeInteger(def.maxTicks)||def.maxTicks<30||def.maxTicks>30*900||
     !Array.isArray(def.gates)||def.gates.length<2||def.gates.length>24)throw Error('Circuit invalide');
  const ids=new Set<string>();
  for(let i=0;i<def.gates.length;i++){
    const g=def.gates[i];
    if(!g||!g.id||ids.has(g.id)||!finitePoint(g.center)||!finitePoint(g.normal)||
       !['circle','rectangle'].includes(g.shape)||
       !finite(g.width)||!finite(g.height)||g.width<1.5||g.height<1.5||g.width>100||g.height>100||
       Math.abs(Math.hypot(g.normal.x,g.normal.y,g.normal.z)-1)>1e-3||
       Math.abs(g.normal.y)>1e-3||
       (g.allowedModes!==undefined&&(!Array.isArray(g.allowedModes)||g.allowedModes.length===0||
        g.allowedModes.some((m:RaceMotionMode)=>!allowed.includes(m)))))throw Error('Checkpoint invalide : '+i);
    if(bounds&&(g.center.x<bounds.minX||g.center.x>bounds.maxX||g.center.z<bounds.minZ||g.center.z>bounds.maxZ))
      throw Error('Checkpoint hors de la carte');
    if(i&&distance(g.center,def.gates[i-1].center)<3)throw Error('Checkpoints superposés');
    ids.add(g.id);
  }
  return def;
}
/** Exact crossing of the gate's oriented plane by the physical movement segment.
 * Doesn't depend on the rendered torus, raycasts, FPS, or arrival at a sampled point. */
export function gateCrossing(gate:RaceGate,a:RacePoint,b:RacePoint,bodyMargin=0.32):number|null{
  const n=gate.normal,c=gate.center;
  const da=(a.x-c.x)*n.x+(a.y-c.y)*n.y+(a.z-c.z)*n.z;
  const db=(b.x-c.x)*n.x+(b.y-c.y)*n.y+(b.z-c.z)*n.z;
  if(da>0||db<=0||db-da<1e-6)return null;
  const t=-da/(db-da);
  if(t<0||t>1)return null;
  const x=a.x+(b.x-a.x)*t-c.x,y=a.y+(b.y-a.y)*t-c.y,z=a.z+(b.z-a.z)*t-c.z;
  const horizontal=x*n.z-z*n.x; // Right vector perpendicular to the horizontal normal.
  const rw=gate.width/2-bodyMargin,rh=gate.height/2-bodyMargin;
  if(rw<=0||rh<=0)return null;
  if(gate.shape==='circle'){
    if((horizontal/rw)**2+(y/rh)**2>1)return null;
  }else if(Math.abs(horizontal)>rw||Math.abs(y)>rh)return null;
  return t;
}
export function beginRace(def:RaceDefinition,startTick:number,pulseSeq=0):RaceSession{
  validateRace(def);
  if(!Number.isSafeInteger(startTick)||startTick<0||!Number.isSafeInteger(pulseSeq)||pulseSeq<0)
    throw Error('Départ de course invalide');
  return {definition:def,status:'running',startTick,lastTick:startTick,nextGate:0,
    finishSeconds:null,usedPulses:0,lastPulseSeq:pulseSeq};
}
export function raceElapsedSeconds(s:RaceSession):number{
  return s.finishSeconds??Math.max(0,(s.lastTick-s.startTick)/RACE_TICK_HZ);
}
/** Advance exactly once per fixed 30 Hz tick. Returns authoritative gate/finish events. */
export function advanceRace(s:RaceSession,step:RaceStep):RaceEvent|null{
  if(s.status!=='running')return null;
  if(!Number.isSafeInteger(step.tick)||step.tick!==s.lastTick+1)throw Error('Tick de course non consécutif');
  s.lastTick=step.tick;
  const fail=(reason:string):RaceEvent=>{s.status='failed';return {kind:'failed',reason};};
  if(!finitePoint(step.previous)||!finitePoint(step.position)||distance(step.previous,step.position)>10||step.transitioned)
    return fail('Téléportation ou déplacement incohérent');
  if(!Number.isSafeInteger(step.pulseSeq)||step.pulseSeq<s.lastPulseSeq)
    return fail('Compteur de propulsion invalide');
  s.usedPulses+=step.pulseSeq-s.lastPulseSeq;s.lastPulseSeq=step.pulseSeq;
  if(step.tick-s.startTick>s.definition.maxTicks)return fail('Temps maximal dépassé');
  const accepted=s.definition.kind==='flight'?['glide']:
    s.definition.kind==='roll'?['roll','air']:['roll','air','glide'];
  if(!accepted.includes(step.mode))return fail('Mode de déplacement interdit');
  let lastFraction=-1,passed=-1,finishFraction=0;
  while(s.nextGate<s.definition.gates.length){
    const gate=s.definition.gates[s.nextGate];
    if(gate.allowedModes&&!gate.allowedModes.includes(step.mode as RaceMotionMode))break;
    const fraction=gateCrossing(gate,step.previous,step.position);
    if(fraction===null||fraction+1e-8<lastFraction)break;
    lastFraction=fraction;finishFraction=fraction;passed=s.nextGate++;
  }
  if(passed<0)return null;
  if(s.nextGate===s.definition.gates.length){
    s.status='finished';
    s.finishSeconds=(step.tick-s.startTick-1+finishFraction)/RACE_TICK_HZ;
    return {kind:'finish',gateIndex:passed,seconds:s.finishSeconds};
  }
  return {kind:'checkpoint',gateIndex:passed};
}
