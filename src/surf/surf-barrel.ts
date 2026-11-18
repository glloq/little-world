/** Deterministic breaking-wave tube (barrel) contract.
 * Physics remains a single-valued water heightfield. A short 3D lip is visual;
 * this inexpensive analytic arch owns the playable overhead clearance.
 * Nothing changes the flat water datum used by boats, fishing or swimming. */
import type {SurfActor} from './surf-controller.ts';
import type {SurfWaveField,SurfZone} from './wave-field.ts';

export const BARREL_TICK_HZ=30;
const TAU=2*Math.PI;
const SURFER_CLEARANCE=1.52;
const MIN_SIDE_SPEED=2.5;
const ESCAPE_DISTANCE=5;
const ESCAPE_TICKS=10;
const COOLDOWN_TICKS=75;
// Maximum of sin(phase)+.22*sin(2*phase), derivative cos(p)+.44*cos(2p)=0.
export const BARREL_CREST_PHASE=Math.acos((Math.sqrt(1+4*.88*.44)-1)/1.76);
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const smooth=(a:number,b:number,n:number)=>{
 const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);
};
export const barrelEnabled=(zone:SurfZone)=> (zone.barrelStrength??0)>0;
export function barrelPhaseOffset(zone:SurfZone):number{
 return (BARREL_CREST_PHASE-(zone.seed%4093)/4093*TAU)/TAU;
}
/** Scalar position along the wave travel vector for a given fixed-tick crest. */
export function barrelCrestAlong(zone:SurfZone,tick:number,index:number):number{
 return zone.speed*(tick/BARREL_TICK_HZ)+zone.wavelength*(index+barrelPhaseOffset(zone));
}
export function nearestBarrelCrest(zone:SurfZone,x:number,z:number,tick:number){
 if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick tube invalide');
 const along=zone.dirX*x+zone.dirZ*z;
 const n=Math.round((along-zone.speed*tick/BARREL_TICK_HZ)/zone.wavelength-barrelPhaseOffset(zone));
 const crestAlong=barrelCrestAlong(zone,tick,n);
 return {index:n,crestAlong,distance:along-crestAlong};
}
export interface BarrelProfile {
 intensity:number;
 height:number;
 radius:number;
 depth:number;
 /** 0: collapsing at shallow water; 1: fully formed. */
 opening:number;
}
/** The curl exists only in a narrow bathymetric band and fades BEFORE the beach. */
export function barrelProfile(zone:SurfZone,x:number,z:number,ground:(x:number,z:number)=>number):BarrelProfile|null{
 if(!barrelEnabled(zone)||x<zone.minX||x>zone.maxX||z<zone.minZ||z>zone.maxZ)return null;
 const depth=zone.seaLevel-ground(x,z),fade=zone.shoreFadeDepth??3;
 if(!Number.isFinite(depth)||depth<=fade*.34||depth>=fade*2.2)return null;
 const margin=Math.min(x-zone.minX,zone.maxX-x,z-zone.minZ,zone.maxZ-z);
 const envelope=smooth(2,Math.max(3,zone.edgeFade??12),margin);
 const rise=smooth(fade*.34,fade*.9,depth);
 const offshore=1-smooth(fade*.9,fade*2.2,depth);
 const intensity=envelope*rise*offshore*(zone.barrelStrength??0);
 if(intensity<.001)return null;
 return {intensity,height:(2.0+1.65*zone.amplitude)*intensity,
   radius:(.85+.9*zone.amplitude)*Math.sqrt(intensity),
   depth,opening:rise};
}
export interface BarrelSample extends BarrelProfile {
 waveIndex:number;crestAlong:number;distance:number;
 /** Clear vertical space above the logical surf surface at this x,z. */
 clearance:number;
}
/** Sample the same moving crest and the same coastal breaking envelope as the 3D lip. */
export function sampleSurfBarrel(field:SurfWaveField,ground:(x:number,z:number)=>number,
 x:number,z:number,tick:number):BarrelSample|null{
 const profile=barrelProfile(field.zone,x,z,ground);
 if(!profile)return null;
 const crest=nearestBarrelCrest(field.zone,x,z,tick);
 if(Math.abs(crest.distance)>profile.radius)return null;
 const norm=crest.distance/profile.radius;
 const clearance=profile.height*Math.sqrt(Math.max(0,1-norm*norm));
 return {...profile,...{waveIndex:crest.index,crestAlong:crest.crestAlong,distance:crest.distance,clearance}};
}
export interface SurfBarrelActor extends SurfActor {
 barrelWaveIndex?:number;
 barrelEntryTick?:number;
 barrelEntryAcross?:number;
 barrelSuccessSeq?:number;
 barrelCrashSeq?:number;
 barrelCooldownUntilTick?:number;
 surfWipeoutSeq?:number;
}
export type BarrelEvent='none'|'entered'|'escaped'|'closed';
/** Arcade "ride through the tube": stay under the same open lip while travelling
 * laterally along the crest. Closing lip during a ride causes a wipeout. */
export function stepSurfBarrel(actor:SurfBarrelActor,field:SurfWaveField,
 ground:(x:number,z:number)=>number,tick:number):BarrelEvent{
 if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick tube invalide');
 const zone=field.zone;
 const active=actor.barrelEntryTick!==undefined;
 if(!barrelEnabled(zone)||actor.mode!=='surf'||actor.surfStage!=='ride'||actor.surfAirborne){
  actor.barrelEntryTick=undefined;actor.barrelWaveIndex=undefined;actor.barrelEntryAcross=undefined;
  return 'none';
 }
 const x=actor.position.x,z=actor.position.z;
 const sample=sampleSurfBarrel(field,ground,x,z,tick);
 const across=-zone.dirZ*x+zone.dirX*z;
 const sideSpeed=Math.abs(-zone.dirZ*actor.velocity.x+zone.dirX*actor.velocity.z);
 if(!active){
  if(tick<(actor.barrelCooldownUntilTick??0)||!sample||
     sample.clearance<SURFER_CLEARANCE+.22||sideSpeed<MIN_SIDE_SPEED)return 'none';
  actor.barrelWaveIndex=sample.waveIndex;
  actor.barrelEntryTick=tick;actor.barrelEntryAcross=across;
  return 'entered';
 }
 // An active ride is bound to one moving crest. A different wave is never a completion.
 if(sample&&sample.waveIndex===actor.barrelWaveIndex){
  if(sample.clearance<SURFER_CLEARANCE){
   actor.mode='swim';actor.surfStage=undefined;actor.surfAirborne=false;
   actor.velocity.x*=.4;actor.velocity.z*=.4;actor.velocity.y=0;
   actor.position.y=Math.min((field.height(x,z,tick)??zone.seaLevel)-.45,zone.seaLevel-.32);
   actor.surfWipeoutSeq=(actor.surfWipeoutSeq??0)+1;
   actor.barrelCrashSeq=(actor.barrelCrashSeq??0)+1;
   actor.barrelCooldownUntilTick=tick+COOLDOWN_TICKS;
   actor.barrelEntryTick=undefined;actor.barrelWaveIndex=undefined;actor.barrelEntryAcross=undefined;
   return 'closed';
  }
  if(Math.abs(across-(actor.barrelEntryAcross??across))>=ESCAPE_DISTANCE&&
     tick-(actor.barrelEntryTick??tick)>=ESCAPE_TICKS){
   actor.barrelSuccessSeq=(actor.barrelSuccessSeq??0)+1;
   actor.barrelCooldownUntilTick=tick+COOLDOWN_TICKS;
   actor.barrelEntryTick=undefined;actor.barrelWaveIndex=undefined;actor.barrelEntryAcross=undefined;
   return 'escaped';
  }
  return 'none';
 }
 // A crest can close rapidly between frames. Distinguish a truly shallow closure
 // from riding away from an open tube or jumping off the lip.
 const crest=nearestBarrelCrest(zone,x,z,tick);
 const depth=zone.seaLevel-ground(x,z);
 const shallow=depth>0&&depth<(zone.shoreFadeDepth??3)*.95;
 const inClosingPath=crest.index===actor.barrelWaveIndex&&
   Math.abs(crest.distance)<(.85+zone.amplitude*.9)*1.4;
 actor.barrelEntryTick=undefined;actor.barrelWaveIndex=undefined;actor.barrelEntryAcross=undefined;
 if(!shallow||!inClosingPath)return 'none';
 actor.mode='swim';actor.surfStage=undefined;actor.surfAirborne=false;
 actor.velocity.x*=.4;actor.velocity.z*=.4;actor.velocity.y=0;
 actor.position.y=Math.min((field.height(x,z,tick)??zone.seaLevel)-.45,zone.seaLevel-.32);
 actor.surfWipeoutSeq=(actor.surfWipeoutSeq??0)+1;
 actor.barrelCrashSeq=(actor.barrelCrashSeq??0)+1;
 actor.barrelCooldownUntilTick=tick+COOLDOWN_TICKS;
 return 'closed';
}
