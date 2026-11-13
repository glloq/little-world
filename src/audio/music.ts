/** AUD-V2 — MusicDirector: picks a cue from the world context (never from FPS or the 30 Hz tick).
 * The engine still schedules notes on AudioContext time and switches on bar boundaries.
 * No matching cue → the current music is held (V1 behaviour). */
import {matchCondition,type SoundContext} from './context.ts';
import type {AudioDefinitionV2,MusicCue} from './catalog.ts';
import {VariantPicker,type Random} from './variants.ts';
export type MusicRequest={type:'play';cueId:string;scoreId:string;loop:boolean;immediate:boolean}|{type:'silence'}|{type:'hold'};
export interface MusicStatus {cueId:string|null;scoreId:string|null;silentUntil:number|null;stinger:string|null;}

export class MusicDirector {
 private cue:MusicCue|null=null;
 private score:string|null=null;
 private silentUntil:number|null=null;
 private stinger:{cue:MusicCue;started:number|null;seen:boolean}|null=null;
 private picker:VariantPicker;
 private readonly def:AudioDefinitionV2;
 private readonly available:(scoreId:string)=>boolean;
 private readonly random:Random;
 constructor(def:AudioDefinitionV2,available:(scoreId:string)=>boolean,random:Random=Math.random){this.def=def;this.available=available;this.random=random;this.picker=new VariantPicker(random);}
 /** Best loop cue for the context among cues with at least one playable score. */
 select(context:SoundContext):MusicCue|null {
  let best:MusicCue|null=null,bestKey:[number,number]=[-1,-1];
  for(const cue of Object.values(this.def.music.cues)){if(cue.kind!=='loop')continue;const s=matchCondition(cue.when,context);if(s<0||!cue.scoreIds.some(this.available))continue;const key:[number,number]=[cue.priority,s];if(key[0]>bestKey[0]||(key[0]===bestKey[0]&&key[1]>bestKey[1])||(key[0]===bestKey[0]&&key[1]===bestKey[1]&&best&&cue.id<best.id)){best=cue;bestKey=key;}}
  return best;
 }
 /** One-shot stingers (discovery, mission success…): play once at the next boundary, then resume. */
 trigger(cueId:string,context:SoundContext={}):boolean {const cue=this.def.music.cues[cueId];if(!cue||cue.kind!=='stinger'||matchCondition(cue.when,context)<0||!cue.scoreIds.some(this.available))return false;this.stinger={cue,started:null,seen:false};return true;}
 /** `playing` = score id currently held by the engine transport (null when it ended or nothing plays). */
 update(nowSeconds:number,context:SoundContext,playing:string|null):MusicRequest {
  if(this.stinger){const s=this.stinger;if(s.started===null){s.started=nowSeconds;const scoreId=this.pickScore(s.cue);this.score=scoreId;return {type:'play',cueId:s.cue.id,scoreId,loop:false,immediate:s.cue.transition==='immediate'};}
   if(playing===this.score){s.seen=true;return {type:'hold'};}
   // Waiting for the bar boundary (or the score download); give up after a few seconds.
   if(!s.seen&&nowSeconds-s.started<6)return {type:'hold'};
   this.stinger=null;this.cue=null;this.score=null;}
  const cue=this.select(context);if(!cue)return {type:'hold'};
  if(cue!==this.cue){this.cue=cue;this.silentUntil=null;return this.start(cue,playing!==null&&cue.transition==='immediate');}
  if(playing===null&&this.score!==null){ // A non-looping playthrough ended: optional silence, then the next take.
   if(cue.silence&&this.silentUntil===null){this.silentUntil=nowSeconds+cue.silence[0]+this.random()*(cue.silence[1]-cue.silence[0]);this.score=null;return {type:'silence'};}
  }
  if(playing===null&&(this.silentUntil===null||nowSeconds>=this.silentUntil)){this.silentUntil=null;return this.start(cue,false);}
  return {type:'hold'};
 }
 private start(cue:MusicCue,immediate:boolean):MusicRequest {const scoreId=this.pickScore(cue);this.score=scoreId;return {type:'play',cueId:cue.id,scoreId,loop:cue.scoreIds.filter(this.available).length===1&&!cue.silence,immediate};}
 private pickScore(cue:MusicCue):string {const list=cue.scoreIds.filter(this.available).map(id=>({key:id,weight:1}));return this.picker.pick('cue:'+cue.id,list,'avoid-repeat')?.key??cue.scoreIds[0];}
 get status():MusicStatus {return {cueId:this.stinger?.cue.id??this.cue?.id??null,scoreId:this.score,silentUntil:this.silentUntil,stinger:this.stinger?.cue.id??null};}
}
