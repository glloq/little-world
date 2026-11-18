/** First useful rolling tracks: shared authoring presets, never hardcoded island objects. */
import type {RaceDefinition} from './races.ts';
import {trackLength,validateRaceTrack,type RaceTrack,type TrackFeature,type TrackFeatureKind} from './race-track.ts';
export function roadbedFromGates(race:RaceDefinition):RaceTrack{
 if(race.kind==='flight')throw Error('Aucune route pour une course de vol');
 const gates=race.kind==='mixed'?race.gates.slice(0,2):race.gates;
 if(gates.length<2)throw Error('Deux checkpoints au sol nécessaires');
 const start=gates[0],end=gates.at(-1)!;
 const first={x:start.center.x-start.normal.x*12,z:start.center.z-start.normal.z*12},
       last={x:end.center.x+end.normal.x*14,z:end.center.z+end.normal.z*14};
 const points=[first,...gates.map(g=>({x:g.center.x,z:g.center.z})),last];
 return validateRaceTrack({width:8,material:'dirt',smooth:true,points,features:[]});
}
export function makeTrackFeature(kind:TrackFeatureKind,at:number,length:number,id:string):TrackFeature{
 return {
  id,kind,at,length,
  height:kind==='ramp'?1.2:kind==='bumps'?.55:kind==='bridge'?.6:0,
  ...(kind==='bank'?{bankDeg:18}:{})
 };
}
export function showcaseTrack(race:RaceDefinition):RaceTrack|undefined{
 if(race.kind==='flight')return undefined;
 const base=roadbedFromGates(race),length=trackLength(base);
 const defs:readonly [TrackFeatureKind,number,number][]=
 race.kind==='roll'?[['bank',.13,.18],['bumps',.38,.09],['bridge',.56,.16],['ramp',.81,.08]]:
 [['bumps',.16,.14],['ramp',.70,.22]];
 let features:TrackFeature[]=[];
 for(let i=0;i<defs.length;i++){
  const [kind,start,span]=defs[i],at=length*start,len=Math.max(3,length*span);
  features.push(makeTrackFeature(kind,at,len,'feature:showcase-'+i));
 }
 return validateRaceTrack({...base,features});
}
/** Suitable defaults for a free place not already occupied by other modules. */
export function availableTrackFeature(track:RaceTrack,kind:TrackFeatureKind,id:string):TrackFeature{
 const len=kind==='bridge'?18:kind==='bank'?18:kind==='ramp'?10:9;
 const total=trackLength(track),length=Math.min(len,Math.max(3,total/4));
 for(let at=5;at+length<=total-2;at+=2){
  if(track.features.every(f=>at+length<=f.at+.01||at>=f.at+f.length-.01))
   return makeTrackFeature(kind,Math.round(at*100)/100,Math.round(length*100)/100,id);
 }
 throw Error('Piste trop courte ou déjà occupée : étendez le tracé');
}
