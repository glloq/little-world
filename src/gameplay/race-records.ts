/** Personal practice records for *identical* geometries only; no global ranking.
 * One local mechanism shared by races and mini-games (doc 107 §6): a stable key that
 * changes when the authored layout changes, a validity range and a "better" direction. */
import type {RaceDefinition} from './races.ts';
export interface RaceStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}
export interface PracticeRecord {key:string;better:'lower'|'higher';valid(value:number):boolean}
export function readPracticeBest(storage:RaceStorage,record:PracticeRecord):number|null{
  try{
    const raw=storage.getItem(record.key);
    if(raw===null)return null;
    const value=Number(raw);
    return Number.isFinite(value)&&record.valid(value)?value:null;
  }catch{return null;}
}
/** Stores `value` when it beats the stored one; true = new personal best. */
export function writePracticeBest(storage:RaceStorage,record:PracticeRecord,value:number):boolean{
  if(!Number.isFinite(value)||!record.valid(value))return false;
  const previous=readPracticeBest(storage,record);
  if(previous!==null&&(record.better==='lower'?previous<=value:previous>=value))return false;
  try{storage.setItem(record.key,String(value));return true;}catch{return false;}
}
const raceRecord=(def:RaceDefinition,worldBuild=''):PracticeRecord=>({better:'lower',
  key:'little-world:race-best:v1:'+encodeURIComponent(def.worldId+'/'+def.id+'/'+def.version+'/'+def.layoutKey+(worldBuild?'@'+worldBuild:'')),
  valid:v=>v>0&&v<=def.maxTicks/30});
export function readRaceBest(storage:RaceStorage,def:RaceDefinition,worldBuild=''):number|null{return readPracticeBest(storage,raceRecord(def,worldBuild));}
export function writeRaceBest(storage:RaceStorage,def:RaceDefinition,seconds:number,worldBuild=''):boolean{return writePracticeBest(storage,raceRecord(def,worldBuild),seconds);}
