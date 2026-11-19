/** Bounded, offline NPC economy driver. Each worker owns one native workshop
 * account at an existing, positioned job anchor. No per-frame pathfinding,
 * invisible gathering, free ingredients, or player inventory access.
 */
import type {NPCState} from '../npc.ts';
import type {NpcWorkshopAccountV1} from './economy.ts';
import {createNpcWorkshopEconomy,parseNpcWorkshopAccount} from './economy.ts';
import {STARTER_RECIPES} from '../economy/starter-catalog.ts';

type Account=ReturnType<typeof createNpcWorkshopEconomy>;
const stationByRole:Record<string,string>={miller:'mill',artisan:'carpenter',blacksmith:'smithy'};
export function createNpcEconomyDriver(
 itemLimits:Readonly<Record<string,number>>,
 findAnchor:(id:string)=>{x:number;z:number}|null,
){
 const accounts=new Map<string,Account>();
 let restored:Record<string,NpcWorkshopAccountV1>={};
 let residents:readonly NPCState[]=[];
 let lastMinute=-1;
 function install(states:readonly NPCState[]){
  residents=states;
  const next=new Map<string,Account>();
  for(const state of [...states].sort((a,b)=>a.definition.id.localeCompare(b.definition.id))){
   const routine=state.definition.routine,stationType=routine&&stationByRole[routine.role];
   if(!routine?.workAnchorId||!stationType||next.size>=32)continue;
   const anchor=findAnchor(routine.workAnchorId);
   if(!anchor||Math.hypot(anchor.x-routine.work.x,anchor.z-routine.work.z)>2)continue;
   const job={id:routine.workAnchorId,sourceId:routine.workAnchorId,
    kind:'amenity' as const,role:routine.role,point:{...routine.work}};
   const previous=accounts.get(state.definition.id)?.save()??restored[state.definition.id];
   try{
    const account=createNpcWorkshopEconomy(state.definition.id,routine.role,job,
      stationType,STARTER_RECIPES,itemLimits,previous);
    next.set(state.definition.id,account);
   }catch{
    // Incompatible/missing job or recipe: exclude rather than silently
    // relocating stock to an unrelated workshop.
   }
  }
  accounts.clear();for(const [id,a]of next)accounts.set(id,a);
  lastMinute=-1;
 }
 function restore(value:Readonly<Record<string,NpcWorkshopAccountV1>>={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>32)
   throw Error('Comptes de production PNJ invalides');
  const candidate:Record<string,NpcWorkshopAccountV1>={};
  for(const [id,raw]of Object.entries(value)){
   const account=parseNpcWorkshopAccount(raw);
   if(id!==account.residentId)throw Error('Provenance du compte PNJ incorrecte');
   candidate[id]=account;
  }
  restored=candidate;install(residents);
 }
 function serialize():Record<string,NpcWorkshopAccountV1>{
  return Object.fromEntries([...accounts].sort(([a],[b])=>a.localeCompare(b))
   .map(([id,account])=>[id,account.save()]));
 }
 function tick(gameMinute:number){
  if(!Number.isSafeInteger(gameMinute)||gameMinute<0||gameMinute>1_000_000_000)return 0;
  if(gameMinute===lastMinute)return 0;
  lastMinute=gameMinute;
  let changed=0;
  for(const resident of residents){
   const account=accounts.get(resident.definition.id),routine=resident.definition.routine;
   if(!account||!routine)continue;
   const before=account.jobs().filter(j=>j.status!=='collected').length;
   try{
    account.advance(gameMinute);
    // Finished jobs were paid for at start. Only collect after native
    // transaction validation; a full NPC stock leaves them ready.
    for(const job of account.jobs())if(job.status==='ready'){
     if(account.collect(job.jobId,gameMinute,'npc:collect:'+job.jobId).ok)changed++;
    }
    const working=resident.phase==='work'&&
      Math.hypot(resident.x-routine.work.x,resident.z-routine.work.z)<=3;
    if(working){
     const station=stationByRole[routine.role];
     const candidate=STARTER_RECIPES.filter(r=>r.stationType===station)
      .sort((a,b)=>a.recipeId.localeCompare(b.recipeId))[0];
     if(candidate&&account.jobs().filter(j=>j.status==='running'||j.status==='queued').length<1){
      const requestId='npc:auto:'+resident.definition.id+':'+gameMinute;
      if(account.start(candidate.recipeId,1,gameMinute,requestId).ok)changed++;
     }
    }
    void before;
   }catch{/* Invalid clock/job never produces an economy reward. */}
  }
  return changed;
 }
 return {
  install,restore,serialize,tick,
  account:(id:string)=>accounts.get(id)??null,
  get size(){return accounts.size;},
 };
}
