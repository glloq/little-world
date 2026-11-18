/** Tiny, deterministic water course features. Ramps/boosts have no physics derived from meshes. */
import type {SurfActor} from './surf-controller.ts';
export type SurfFeatureKind='boost'|'ramp'|'buoy';
export interface SurfFeature {
 id:string;kind:SurfFeatureKind;x:number;z:number;
 dirX:number;dirZ:number;radius:number;
 power:number;cooldownTicks:number;
}
export interface SurfFeatureEvent {kind:SurfFeatureKind;id:string;}
export interface SurfFeatureState {lastActivation:Record<string,number>;}
export function validateSurfFeature(f:SurfFeature):SurfFeature {
 if(!f||!/^surf-feature:[a-z0-9_-]{1,80}$/.test(f.id)||
    !['boost','ramp','buoy'].includes(f.kind)||
    ![f.x,f.z,f.dirX,f.dirZ,f.radius,f.power,f.cooldownTicks].every(Number.isFinite)||
    Math.abs(Math.hypot(f.dirX,f.dirZ)-1)>1e-4||
    f.radius<.6||f.radius>15||f.power<0||f.power>25||
    !Number.isSafeInteger(f.cooldownTicks)||f.cooldownTicks<1||f.cooldownTicks>3000)
   throw Error('Obstacle surf invalide');
 return f;
}
export function createSurfFeatureState():SurfFeatureState{return {lastActivation:{}};}
export function stepSurfFeatures(actor:SurfActor,features:readonly SurfFeature[],
 state:SurfFeatureState,tick:number):SurfFeatureEvent[]{
 if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick obstacles invalide');
 if(actor.mode!=='surf'||actor.surfAirborne)return [];
 const events:SurfFeatureEvent[]=[];
 for(const f of features){
  const dx=actor.position.x-f.x,dz=actor.position.z-f.z;
  if(dx*dx+dz*dz>f.radius*f.radius)continue;
  const last=state.lastActivation[f.id]??-Infinity;
  if(tick-last<f.cooldownTicks)continue;
  const along=actor.velocity.x*f.dirX+actor.velocity.z*f.dirZ;
  if(along<1.5)continue; // no boost/ramp from behind or while stationary
  if(f.kind==='boost'){
   actor.velocity.x+=f.dirX*f.power;actor.velocity.z+=f.dirZ*f.power;
   const speed=Math.hypot(actor.velocity.x,actor.velocity.z);
   if(speed>30){const k=30/speed;actor.velocity.x*=k;actor.velocity.z*=k;}
  }else if(f.kind==='ramp'){
   actor.velocity.y=Math.max(0,actor.velocity.y)+Math.min(12,3.5+along*.26+f.power);
   actor.mode='air';actor.surfAirborne=true;actor.surfStage='air';
   actor.surfJumpSeq=(actor.surfJumpSeq??0)+1;
  }else{
   actor.velocity.x*=.7;actor.velocity.z*=.7;
  }
  state.lastActivation[f.id]=tick;
  events.push({kind:f.kind,id:f.id});
  if(f.kind==='ramp')break;
 }
 return events;
}
