/** AUD-V2 — AmbienceMixer: data-driven multi-layer profiles (bed, weather, localized source,
 * punctual natural events). Only the best place/biome profile plus global profiles are considered;
 * looping layers are capped by the budget (never "all layers at once"); one-shots use random
 * intervals so entering a zone does not trigger a burst. */
import {matchCondition,type SoundContext} from './context.ts';
import type {AmbienceLayer,AmbienceProfile,AudioDefinitionV2} from './catalog.ts';
import type {Random} from './variants.ts';
export interface AmbienceLoop {key:string;eventId:string;gain:number;priority:number;fadeSeconds:number;role:AmbienceLayer['role'];}
export interface AmbienceOneShot {key:string;eventId:string;gain:number;}

export class AmbienceMixer {
 private next=new Map<string,number>();
 private readonly def:AudioDefinitionV2;
 private readonly playable:(eventId:string)=>boolean;
 private readonly random:Random;
 constructor(def:AudioDefinitionV2,playable:(eventId:string)=>boolean,random:Random=Math.random){this.def=def;this.playable=playable;this.random=random;}
 /** Global profiles apply unless the winning place profile is exclusive; among the others, the best (priority, specificity) wins. */
 profiles(context:SoundContext):AmbienceProfile[] {
  const out:AmbienceProfile[]=[];let best:AmbienceProfile|null=null,key:[number,number]=[-1,-1];
  for(const p of Object.values(this.def.ambience)){const s=matchCondition(p.when,context);if(s<0)continue;if(p.global){out.push(p);continue;}if(p.priority>key[0]||(p.priority===key[0]&&s>key[1])){best=p;key=[p.priority,s];}}
  return best?best.exclusive?[best]:[best,...out]:out;
 }
 /** Looping layers to keep alive (sorted by priority, declaration order kept on ties). */
 loops(context:SoundContext,maxLayers:number):AmbienceLoop[] {
  const all:(AmbienceLoop&{order:number})[]=[];let order=0;
  for(const p of this.profiles(context))for(const l of p.layers){order++;if(l.role==='oneshot'||matchCondition(l.when,context)<0||!this.playable(l.eventId))continue;all.push({key:`amb:${p.id}:${l.id}`,eventId:l.eventId,gain:l.gain,priority:l.priority,fadeSeconds:p.fadeSeconds,role:l.role,order});}
  return all.sort((a,b)=>b.priority-a.priority||a.order-b.order).slice(0,Math.max(0,maxLayers)).map(({order:_,...l})=>l);
 }
 /** Punctual events due at `now` (seconds, any monotonic clock). Inactive layers forget their timer. */
 due(context:SoundContext,now:number):AmbienceOneShot[] {
  const out:AmbienceOneShot[]=[],active=new Set<string>();
  for(const p of this.profiles(context))for(const l of p.layers){if(l.role!=='oneshot'||!l.interval||matchCondition(l.when,context)<0||!this.playable(l.eventId))continue;const key=`amb:${p.id}:${l.id}`;active.add(key);
   const at=this.next.get(key);if(at===undefined){this.next.set(key,now+this.interval(l.interval));continue;}if(now>=at){out.push({key,eventId:l.eventId,gain:l.gain});this.next.set(key,now+this.interval(l.interval));}}
  for(const key of [...this.next.keys()])if(!active.has(key))this.next.delete(key);return out;
 }
 private interval([min,max]:[number,number]){return min+this.random()*(max-min);}
 reset(){this.next.clear();}
}
