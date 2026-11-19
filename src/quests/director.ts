/** In-memory quest journal. Legacy ObjectiveDefinition still owns historical missions.
 * This service never infers successes from animations or inventory differences.
 * It must receive authenticated post-commit events from gameplay adapters.
 */
import type {QuestCatalogEntryV1,QuestInstanceV1,QuestGameEventV1} from './schema.ts';
import {parseQuestCatalogEntry,parseQuestInstance,parseQuestGameEvent} from './validation.ts';
import {acceptQuest,advanceQuest} from './progress.ts';

export interface QuestDirectorSnapshot{
 instances:Record<string,QuestInstanceV1>;
}
export function createQuestDirector(
 entries:readonly QuestCatalogEntryV1[],
 config:{islandId:string;maxActive:number;maxInstances?:number},
){
 if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(config.islandId)||
  !Number.isSafeInteger(config.maxActive)||config.maxActive<1||config.maxActive>10)
  throw Error('Quest director: invalid island or budget');
 const limit=Math.min(64,Math.max(config.maxActive,config.maxInstances??64));
 const catalog=new Map<string,QuestCatalogEntryV1>();
 for(const raw of entries){
  const e=parseQuestCatalogEntry(raw);
  if(e.islandId!==config.islandId||catalog.has(e.questKey))
   throw Error('Quest director: duplicate or foreign offer '+e.questKey);
  catalog.set(e.questKey,e);
 }
 let instances=new Map<string,QuestInstanceV1>();
 const read=()=>[...instances.values()].map(parseQuestInstance)
   .sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
 const serialize=():Record<string,QuestInstanceV1>=>Object.fromEntries(read().map(i=>[i.instanceId,i]));
 return {
  /** Register offers after NPC route qualification, without destroying
   * already-accepted instances restored from a save. Deterministic replace.
   */
  registerOffers(source:readonly QuestCatalogEntryV1[]):void{
   if(source.length>128)throw Error('Quest director: offer limit');
   const next=new Map<string,QuestCatalogEntryV1>();
   for(const raw of source){
    const entry=parseQuestCatalogEntry(raw);
    if(entry.islandId!==config.islandId||next.has(entry.questKey))
     throw Error('Quest director: duplicate or foreign offer '+entry.questKey);
    next.set(entry.questKey,entry);
   }
   catalog.clear();
   for(const [id,item]of next)catalog.set(id,item);
  },
  /** Prevent accepted missions becoming softlocks after a regenerated map
   * removes their giver or a required conversational target. Never delete or
   * auto-complete a player's quest; resume if those original NPC IDs return.
   */
  reconcileNpcAvailability(realNpcIds:ReadonlySet<string>):string[]{
   const changed:string[]=[];
   for(const [id,entry] of instances){
    if(!['active','ready','suspended'].includes(entry.status))continue;
    const current=entry.steps[entry.stepIndex];
    // The quest may be legitimately away from its origin island. A foreign
    // giver is not "deleted" merely because its island is unloaded.
    const nextIsland=current?.kind==='travel'?current.toIslandId:
      current?.kind==='acquire'?current.fromIslandId??entry.islandId:
      current&&'islandId' in current?current.islandId??entry.islandId:entry.islandId;
    if(nextIsland!==config.islandId)continue;
    const people=current?.kind==='talk'&&current.npcId?[current.npcId]:
      entry.status==='ready'?[entry.giverId]:
      current?.kind==='deliver'?[current.giverId]:[];
    const missing=people.some(person=>!realNpcIds.has(person));
    const status=missing?'suspended':entry.stepIndex===entry.steps.length?'ready':'active';
    if(status===entry.status)continue;
    instances.set(id,parseQuestInstance({...entry,status}));
    changed.push(id);
   }
   return changed;
  },
  offers():QuestCatalogEntryV1[]{return [...catalog.values()].map(parseQuestCatalogEntry)
    .sort((a,b)=>a.questKey.localeCompare(b.questKey));},
  get(instanceId:string):QuestInstanceV1|null{
   const item=instances.get(instanceId);
   return item?parseQuestInstance(item):null;
  },
  accept(questKey:string,instanceId:string,gameMinute:number):QuestInstanceV1{
   const entry=catalog.get(questKey);
   if(!entry)throw Error('Quest director: unavailable offer');
   if(instances.has(instanceId)||instances.size>=limit)throw Error('Quest director: instance limit');
   const active=[...instances.values()].filter(i=>i.status==='active'||i.status==='ready').length;
   if(active>=config.maxActive)throw Error('Quest director: active quest limit');
   if([...instances.values()].some(i=>i.questKey===questKey&&
     ['active','ready','claimed'].includes(i.status)))
    throw Error('Quest director: already accepted');
   const instance=acceptQuest(entry,instanceId,gameMinute);
   instances.set(instanceId,instance);
   return parseQuestInstance(instance);
  },
  /** Consumer must only call after native transaction validation.
   * Invalid or out-of-order events never mutate authoritative quest progress.
   */
  consume(raw:QuestGameEventV1):string[]{
   const event=parseQuestGameEvent(raw);
   const updated:string[]=[];
   for(const [id,instance]of [...instances.entries()]){
    const result=advanceQuest(instance,event);
    if(!result.applied)continue;
    instances.set(id,result.instance);
    updated.push(id);
   }
   return updated;
  },
  restore(saved:Record<string,QuestInstanceV1>):void{
   if(!saved||typeof saved!=='object'||Array.isArray(saved)||Object.keys(saved).length>limit)
    throw Error('Quest director: invalid snapshot');
   const candidate=new Map<string,QuestInstanceV1>();
   for(const [id,raw]of Object.entries(saved)){
    const parsed=parseQuestInstance(raw);
    if(parsed.instanceId!==id)
     throw Error('Quest director: invalid persisted reference');
    candidate.set(id,parsed);
   }
   // Reject all-or-nothing; a bad save never destroys a running session.
   instances=candidate;
  },
  serialize,
  /** Claims are idempotent. A caller must first authenticate the quest giver
   * and supply one native all-or-nothing inventory transaction. The claim and
   * the resulting inventory are then saved in the SAME V2 snapshot.
   */
  claim(instanceId:string,claimId:string,
   applyRewards:(rewards:readonly QuestInstanceV1['rewards'][number][])=>boolean,
  ):{ok:boolean;reason:'claimed'|'not-ready'|'unsupported'|'failed'|'applied'}{
   if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(claimId))
    throw Error('Quest director: invalid claim identity');
   const current=instances.get(instanceId);
   if(!current||current.status!=='ready')
    return {ok:false,reason:current?.status==='claimed'?'claimed':'not-ready'};
   // Unlocks require their own authoritative ownership transaction, not an
   // invented inventory item. Do not partially credit mixed rewards.
   if(current.rewards.some(reward=>reward.kind==='unlock'))
    return {ok:false,reason:'unsupported'};
   if(!applyRewards(current.rewards))return {ok:false,reason:'failed'};
   const claimed=parseQuestInstance({...current,status:'claimed',rewardClaimId:claimId});
   instances.set(instanceId,claimed);
   return {ok:true,reason:'applied'};
  },

 };
}
