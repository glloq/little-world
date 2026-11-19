/** F09 B/C/D/E: bounded NPC harvesting of only native farm plots,
 * deterministic dressing trees, and actual shore fish populations.
 */
import type {NPCState} from '../npc.ts';
import type {PlayableActivities} from '../gameplay/activities.ts';
import type {ActivityRuntime} from '../gameplay/activity-runtime.ts';
import type {Gathering} from '../gameplay/gathering.ts';
import type {WaterKind,FishId} from '../gameplay/fishing-data.ts';
import {createNpcHarvestAccount,parseNpcHarvestAccount,type NpcHarvestAccountV1,type HarvestRole} from './harvest-ledger.ts';
import {createFishPopulation,type FishPopulationV1} from './fish-population.ts';
export interface NpcHarvestDeps{
 limits:Readonly<Record<string,number>>;
 activities:ActivityRuntime;zones:PlayableActivities;
 gathering:Gathering|null;
 /** Actual wet point within fishing range of real NPC pier, not synthetic water. */
 shore:(x:number,z:number)=>{x:number;z:number;kind:WaterKind}|null;
 height:(x:number,z:number)=>number;
 /** Profession station source, if it exists in compiled world. */
 anchor:(id:string)=>{x:number;z:number}|null;
 fishPopulation:ReturnType<typeof createFishPopulation>;
}
type Account=ReturnType<typeof createNpcHarvestAccount>;
const allowed=new Set<HarvestRole>(['farmer','fisher','woodcutter']);
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0)/4294967296;};
export function createNpcHarvestDriver(deps:NpcHarvestDeps){
 const accounts=new Map<string,Account>();
 let residents:readonly NPCState[]=[],lastMinute=-1;
 let pending:Record<string,NpcHarvestAccountV1>={};
 function install(states:readonly NPCState[]){
  residents=states;
  const next=new Map<string,Account>();
  const occupied=new Set<string>();
  for(const npc of [...states].sort((a,b)=>a.definition.id.localeCompare(b.definition.id))){
   if(next.size>=32)break;
   const r=npc.definition.routine;
   if(!r?.workAnchorId||!allowed.has(r.role as HarvestRole))continue;
   const role=r.role as HarvestRole,actual=deps.anchor(r.workAnchorId);
   if(!actual||Math.hypot(actual.x-r.work.x,actual.z-r.work.z)>2)continue;
   if(role==='farmer'&&!deps.zones.farms.some(f=>f.id===r.workAnchorId&&f.farm.assignment==='npc'))continue;
   if(role==='fisher'&&!deps.shore(actual.x,actual.z))continue;
   if(role==='woodcutter'&&!deps.gathering)continue;
   if(occupied.has(r.workAnchorId)&&role==='farmer')continue;
   try{
    const restored=pending[npc.definition.id]??accounts.get(npc.definition.id)?.save();
    const acc=createNpcHarvestAccount(npc.definition.id,r.workAnchorId,role,deps.limits,restored);
    next.set(npc.definition.id,acc);occupied.add(r.workAnchorId);
   }catch{/* Edited or invalid source: no fictitious producer. */}
  }
  accounts.clear();
  for(const [id,a]of next)accounts.set(id,a);
  if(states.length)pending={};
  lastMinute=-1;
 }
 function restore(raw:Readonly<Record<string,NpcHarvestAccountV1>>={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>32)
   throw Error('Récolteurs sauvegardés invalides');
  const candidate:Record<string,NpcHarvestAccountV1>={};
  for(const [id,entry]of Object.entries(raw)){
   const a=parseNpcHarvestAccount(entry);
   if(id!==a.residentId)throw Error('Provenance du récolteur incohérente');
   candidate[id]=a;
  }
  pending=candidate;install(residents);
 }
 const serialize=():Record<string,NpcHarvestAccountV1>=>{
  // Saves may be composed before the NPC renderer finishes attaching. Never
  // discard a validated restored account during that short initialization.
  if(!residents.length&&Object.keys(pending).length)return structuredClone(pending);
  return Object.fromEntries([...accounts.entries()].sort(([a],[b])=>a.localeCompare(b))
    .map(([id,a])=>[id,a.save()]));
 };
 function tick(minute:number){
  if(!Number.isSafeInteger(minute)||minute<0||minute>1000000000||minute===lastMinute)return 0;
  lastMinute=minute;
  let commits=0;
  for(const npc of residents){
   const account=accounts.get(npc.definition.id),r=npc.definition.routine;
   if(!account||!r||npc.phase!=='work'||Math.hypot(npc.x-r.work.x,npc.z-r.work.z)>3)continue;
   // One attempted source action per 5/15 game minutes. Skipped minutes
   // never replay en masse after a long absence or save restoration.
   const interval=account.role==='fisher'?15:5;
   if(minute%interval!==0||minute<=account.save().lastActionGameMinute)continue;
   const receipt='npc:harvest:'+npc.definition.id+':'+minute;
   if(account.hasRequest(receipt))continue;
   if(account.role==='farmer'){
    const result=deps.activities.npcFarmAct(account.sourceId,receipt,
      item=>account.commitHarvest(receipt,item.itemId,item.quantity,minute));
    if(result.ok&&result.reward)commits++;
   }else if(account.role==='woodcutter'&&deps.gathering){
    const base={x:npc.x,y:deps.height(npc.x,npc.z),z:npc.z};
    // Stable daily orientation and eight bounded local rays; strike the same
    // real tree until it falls. Do not rotate randomly each hit or target
    // anything that does not yield native logs.
    const angle=hash(npc.definition.id+':'+Math.floor(minute/1440))*Math.PI*2;
    for(let i=0;i<8;i++){
      const direction={x:Math.cos(angle+i*Math.PI/4),z:Math.sin(angle+i*Math.PI/4)};
      const target=deps.gathering.target(base,direction);
      if(!target||target.rule.yields.itemId!=='wood:log')continue;
      const result=deps.gathering.npcAct(base,direction,
        changes=>changes.length===1&&account.commitHarvest(receipt,
          changes[0].itemId,changes[0].quantity,minute),
        item=>item==='tool:axe');
      if(result.done)commits++;
      break;
    }
   }else if(account.role==='fisher'){
    const spot=deps.shore(npc.x,npc.z);
    if(!spot)continue;
    const rand=hash(npc.definition.id+':fish:'+Math.floor(minute/interval));
    const caught=deps.fishPopulation.npcCatch(spot.kind,spot.x,spot.z,minute,rand,
      (fish:FishId)=>account.commitHarvest(receipt,fish,1,minute));
    if(caught)commits++;
   }
  }
  return commits;
 }
 return {install,restore,serialize,tick,account:(id:string)=>accounts.get(id)??null,
  get size(){return accounts.size;}};
}
