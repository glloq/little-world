/** AUD-V2 — event → take resolution with hierarchical fallback:
 * most specific matching variants → less specific ones → `fallback` event chain → silence + diagnostic.
 * Behaviour (cooldown, priority, radius, polyphony, bus) comes from the *requested* event; the
 * sound design of a take (gain, pitch, jitter) comes from the event that owns the take. */
import {assetPlayable,eligibleVariants,type AudioAssetV2,type AudioDefinitionV2,type SoundEventV2,type SoundVariantV2} from './catalog.ts';
import type {SoundContext} from './context.ts';
import type {VariantPicker} from './variants.ts';
export interface ResolvedSound {requested:SoundEventV2;owner:SoundEventV2;variant:SoundVariantV2;asset:AudioAssetV2;path:string[];gain:number;pitch:number;}
export type Resolution={ok:true;sound:ResolvedSound}|{ok:false;reason:'unknown-event'|'no-resource';path:string[]};

export function resolveSound(def:AudioDefinitionV2,eventId:string,context:SoundContext,picker:VariantPicker,usable:(a:AudioAssetV2)=>boolean=assetPlayable):Resolution {
 const requested=def.events[eventId];if(!requested)return {ok:false,reason:'unknown-event',path:[eventId]};
 const path:string[]=[];let at:SoundEventV2|undefined=requested;
 while(at&&path.length<8&&!path.includes(at.id)){
  path.push(at.id);const {variants,specificity}=eligibleVariants(at,def.assets,context,usable);
  if(variants.length){
   const candidates=variants.map(v=>({key:v.assetId,weight:v.weight,variant:v})),chosen=picker.pick(`${at.id}#${specificity}#${candidates.map(c=>c.key).join(',')}`,candidates,at.repeat)!;
   const variant=chosen.variant,gain=Math.min(1,at.gain*(variant.gain??1)*picker.gain(at.gainJitter)),pitch=Math.max(.5,Math.min(2,at.pitch*(variant.pitch??1)*picker.pitch(at.pitchJitter)));
   return {ok:true,sound:{requested,owner:at,variant,asset:def.assets[variant.assetId],path,gain,pitch}};
  }
  at=at.fallback?def.events[at.fallback]:undefined;
 }
 return {ok:false,reason:'no-resource',path};
}
