/** Personal bests of mini-games, through the SAME local record mechanism as races
 * (gameplay/race-records.ts): keyed by the authored layout, so editing a course in Studio
 * starts a fresh record. Individual variants only (a team score is not a personal best). */
import type {PracticeRecord} from '../gameplay/race-records.ts';
import {MINIGAME_VARIANTS} from './catalog.ts';
import type {MiniGameInstanceV1} from './schema.ts';

function layoutHash(def:MiniGameInstanceV1){
  const text=JSON.stringify([def.variant,def.area,def.elements,def.rules]);let a=2166136261,b=2246822519;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,3266489917);}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function minigameRecord(def:MiniGameInstanceV1,worldBuild=''):PracticeRecord|null{
  if(def.teams?.length)return null;
  return {key:'little-world:minigame-best:v1:'+encodeURIComponent(def.id+'/'+layoutHash(def)+(worldBuild?'@'+worldBuild:'')),
    better:MINIGAME_VARIANTS[def.variant].ranking==='lowest'?'lower':'higher',valid:v=>Number.isSafeInteger(v)&&v>=0&&v<=10000};
}
