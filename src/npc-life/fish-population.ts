/** F09-D: bounded, deterministic regional fish stocks shared by player catches
 * and NPC fisher harvests. No real-time timers or nondeterministic spawning.
 */
import {FISH_BY_WATER,type FishId,type WaterKind,selectFish} from '../gameplay/fishing-data.ts';
export interface FishPopulationV1{
 version:1;regions:Record<string,{remaining:number;lastGameMinute:number}>;
}
const LIMIT=12,REGEN_MINUTES=30,MAX_REGIONS=128;
const key=(water:WaterKind,x:number,z:number)=>{
 if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>100000||Math.abs(z)>100000)throw Error('Zone de pêche invalide');
 return water+':'+Math.floor(x/128)+':'+Math.floor(z/128);
};
const validMinute=(minute:number)=>Number.isSafeInteger(minute)&&minute>=0&&minute<=1000000000;
export function parseFishPopulation(value:unknown):FishPopulationV1{
 const v=value as FishPopulationV1;
 if(!v||typeof v!=='object'||Array.isArray(v)||v.version!==1||
  !v.regions||typeof v.regions!=='object'||Array.isArray(v.regions)||
  Object.keys(v.regions).length>MAX_REGIONS)throw Error('Population aquatique invalide');
 for(const [k,s]of Object.entries(v.regions))
  if(!/^(sea|river|lake):-?\d+:-?\d+$/.test(k)||
   !s||!Number.isSafeInteger(s.remaining)||s.remaining<0||s.remaining>LIMIT||
   !validMinute(s.lastGameMinute))throw Error('Population aquatique corrompue');
 return structuredClone(v);
}
export function createFishPopulation(initial?:FishPopulationV1){
 let regions:FishPopulationV1['regions']=initial?parseFishPopulation(initial).regions:{};
 const state=(water:WaterKind,x:number,z:number,gameMinute:number)=>{
  if(!validMinute(gameMinute))throw Error('Horloge de pêche invalide');
  const k=key(water,x,z);
  if(!regions[k]){
   if(Object.keys(regions).length>=MAX_REGIONS)return null;
   regions[k]={remaining:LIMIT,lastGameMinute:gameMinute};
  }
  const s=regions[k];
  if(gameMinute>s.lastGameMinute){
   const periods=Math.floor((gameMinute-s.lastGameMinute)/REGEN_MINUTES);
   if(periods>0){s.remaining=Math.min(LIMIT,s.remaining+periods);
    s.lastGameMinute+=periods*REGEN_MINUTES;}
  }
  return s;
 };
 return {
  available(water:WaterKind,x:number,z:number,minute:number){
   return (state(water,x,z,minute)?.remaining??0)>0;
  },
  /** Called only when actual fish reward can be credited. Caller first
   * validates native fishing success and bag/warehouse capacity. */
  catch(water:WaterKind,fish:FishId,x:number,z:number,minute:number,
   credit:()=>boolean):boolean{
   if(!FISH_BY_WATER[water]?.some(([id])=>id===fish))return false;
   const s=state(water,x,z,minute);
   if(!s||s.remaining<1||!credit())return false;
   s.remaining--;return true;
  },
  /** Deterministic NPC catch: no fake player minigame, natural species
   * probabilities and a bounded 25% chance of landing fish per work session.
   */
  npcCatch(water:WaterKind,x:number,z:number,minute:number,random:number,
   credit:(fish:FishId)=>boolean):FishId|null{
   if(!Number.isFinite(random)||random<0||random>=1||random>=.25)return null;
   const fish=selectFish(water,random/.25);
   return this.catch(water,fish,x,z,minute,()=>credit(fish))?fish:null;
  },
  remaining(water:WaterKind,x:number,z:number,minute:number){
   return state(water,x,z,minute)?.remaining??0;
  },
  serialize():FishPopulationV1{return parseFishPopulation({version:1,regions});},
 };
}
