/** Pure, deterministic quest progression. Does NOT grant rewards, remove items,
 * receive untrusted gameplay events directly, or modify legacy objectives.
 * A native gameplay service must authenticate a successful producer commit
 * before dispatching its validated QuestGameEventV1 here.
 */
import type {QuestCatalogEntryV1,QuestGameEventV1,QuestInstanceV1,QuestStepV1} from './schema.ts';
import {parseQuestCatalogEntry,parseQuestGameEvent,parseQuestInstance} from './validation.ts';

export function acceptQuest(
 catalog:QuestCatalogEntryV1,instanceId:string,gameMinute:number,
):QuestInstanceV1{
 const offer=parseQuestCatalogEntry(catalog);
 if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(instanceId)||
    !Number.isSafeInteger(gameMinute)||gameMinute<0||gameMinute>10000000000)
   throw Error('Quest acceptance: invalid identity or time');
 return parseQuestInstance({...offer,instanceId,acceptedAtGameMinute:gameMinute,
   status:'active',stepIndex:0,stepProgress:offer.steps.map(()=>0),appliedEventIds:[]});
}
function matches(step:QuestStepV1,event:QuestGameEventV1):boolean{
 switch(step.kind){
  case 'travel':
   return event.type==='ferry.arrived'&&event.source===step.fromIslandId&&
    event.islandId===step.toIslandId;
  case 'talk':
   return event.type==='npc.talked'&&
    (step.npcId===undefined||event.targetId===step.npcId)&&
    // Role-only matching requires an authenticated role binding in event.source;
    // never guess a role based on actor name or an NPC animation.
    (step.npcRole===undefined||event.source===step.npcRole);
  case 'visit':
   return event.type==='location.visited'&&event.targetId===step.targetId&&
    event.distanceM!==undefined&&event.distanceM<=step.withinM;
  case 'acquire':{
   const types:Record<Exclude<NonNullable<Extract<QuestStepV1,{kind:'acquire'}>['source']>,'any'>,string>={
    gather:'resource.gathered',fishing:'fishing.caught',mine:'mine.extracted',
    farm:'farm.harvested',trade:'market.traded',craft:'workshop.item-collected',
   };
   if(step.source==='any'||step.source===undefined)
    return event.type==='inventory.acquired'&&event.itemId===step.itemId;
   return event.type===types[step.source]&&event.itemId===step.itemId&&
    (step.source!=='trade'||event.source==='buy')&&
    (step.fromIslandId===undefined||event.islandId===step.fromIslandId);
  }
  case 'deliver':
   // Inventory must have been debited transactionally by the delivery command.
   return event.type==='quest.delivered'&&event.itemId===step.itemId&&
    event.targetId===step.giverId;
  case 'craft':
   return event.type==='workshop.collected'&&event.recipeId===step.recipeId&&
    (step.stationId===undefined||event.targetId===step.stationId);
  case 'race':
   return event.type==='race.finished'&&event.raceId===step.raceId&&
    (step.maxSeconds===undefined||(
     event.measuredSeconds!==undefined&&event.measuredSeconds<=step.maxSeconds));
  case 'event':
   return event.type===step.eventType&&
    (step.subjectId===undefined||event.targetId===step.subjectId||event.raceId===step.subjectId)&&
    (step.source===undefined||event.source===step.source);
 }
}
function needed(step:QuestStepV1):number{
 switch(step.kind){
  case 'acquire':case 'deliver':case 'craft':return step.quantity;
  case 'event':return step.count;
  default:return 1;
 }
}
export interface QuestProgressResult{
 instance:QuestInstanceV1;applied:boolean;reason:'applied'|'duplicate'|'out-of-order'|'not-active'|'not-matched'|'wrong-island'|'past';
}
export function advanceQuest(
 state:QuestInstanceV1,untrusted:QuestGameEventV1,
):QuestProgressResult{
 const instance=parseQuestInstance(state),event=parseQuestGameEvent(untrusted);
 const reject=(reason:QuestProgressResult['reason']):QuestProgressResult=>({instance,applied:false,reason});
 if(instance.appliedEventIds.includes(event.eventId))return reject('duplicate');
 if(instance.status!=='active'||instance.stepIndex>=instance.steps.length)return reject('not-active');
 const step=instance.steps[instance.stepIndex];
 const requiredIsland=step.kind==='travel'?step.toIslandId:
   step.kind==='acquire'?step.fromIslandId??instance.islandId:
   ('islandId' in step?step.islandId:undefined)??instance.islandId;
 if(event.islandId!==requiredIsland)return reject('wrong-island');
 if(event.gameMinute<instance.acceptedAtGameMinute)return reject('past');
 if(!matches(step,event))return reject('not-matched');
 if(instance.appliedEventIds.length>=256)return reject('out-of-order');
 // Occurrence events (race finished, wave ridden, depth reached…) carry no quantity: each counts once.
 const count=step.kind==='talk'||step.kind==='visit'||step.kind==='race'||step.kind==='travel'?1:step.kind==='event'?(event.quantity??1):(event.quantity??0);
 if(!Number.isSafeInteger(count)||count<1)return reject('not-matched');
 const target=needed(step),before=instance.stepProgress[instance.stepIndex];
 instance.stepProgress[instance.stepIndex]=Math.min(target,before+count);
 instance.appliedEventIds.push(event.eventId);
 if(instance.stepProgress[instance.stepIndex]===target){
  instance.stepIndex++;
  if(instance.stepIndex===instance.steps.length)instance.status='ready';
 }
 return {instance,applied:true,reason:'applied'};
}
