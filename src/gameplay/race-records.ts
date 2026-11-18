/** Personal practice records for *identical* geometries only; no global ranking. */
import type {RaceDefinition} from './races.ts';
export interface RaceStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}
const keyFor=(def:RaceDefinition,worldBuild='')=>'little-world:race-best:v1:'+
  encodeURIComponent(def.worldId+'/'+def.id+'/'+def.version+'/'+def.layoutKey+(worldBuild?'@'+worldBuild:''));
export function readRaceBest(storage:RaceStorage,def:RaceDefinition,worldBuild=''):number|null{
  try{
    const raw=storage.getItem(keyFor(def,worldBuild));
    if(raw===null)return null;
    const value=Number(raw);
    return Number.isFinite(value)&&value>0&&value<=def.maxTicks/30?value:null;
  }catch{return null;}
}
export function writeRaceBest(storage:RaceStorage,def:RaceDefinition,seconds:number,worldBuild=''):boolean{
  if(!Number.isFinite(seconds)||seconds<=0||seconds>def.maxTicks/30)return false;
  const previous=readRaceBest(storage,def,worldBuild);
  if(previous!==null&&previous<=seconds)return false;
  try{storage.setItem(keyFor(def,worldBuild),String(seconds));return true;}catch{return false;}
}
