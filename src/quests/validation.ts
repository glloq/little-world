import {isGameplayEventType} from '../gameplay/events.ts';
/** Closed, bounded parsers. Validation never executes author data.
 * This is Q1 only: receipt of an event does NOT prove a gameplay commit.
 */
import type {QuestTemplateV1,QuestStepV1,QuestGameEventV1,QuestCommandV1,QuestRewardV1,QuestCatalogEntryV1,QuestInstanceV1,QuestOfferConfigV1} from './schema.ts';
type R=Record<string,unknown>;
const record=(v:unknown):v is R=>typeof v==='object'&&v!==null&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
const phrase=(v:unknown,max=200):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&
 !/[\u0000-\u001f]/.test(v);
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&
 (v as number)>=min&&(v as number)<=max;
function need(ok:unknown,reason:string):asserts ok{if(!ok)throw Error(reason);}
function object(v:unknown,keys:readonly string[],label:string):R{
 need(record(v),label+': object required');
 need(Object.keys(v).every(k=>keys.includes(k)),label+': unknown field');
 return v;
}
function strings(v:unknown,max:number):v is string[]{
 return Array.isArray(v)&&v.length<=max&&v.every(ident)&&new Set(v).size===v.length;
}
const common=['kind'];
function step(raw:unknown):QuestStepV1{
 const v=object(raw,[...common,'npcRole','npcId','targetId','withinM','itemId','quantity','source',
  'fromIslandId','toIslandId','islandId','giverId','recipeId','stationId','raceId','maxSeconds','eventType','subjectId','count'],'Quest step');
 // Fields are closed for EACH variant; no hidden payloads or scripts.
 let allowed:string[];
 switch(v.kind){
  case 'talk':
   allowed=['kind','npcRole','npcId','islandId'];
   need((v.npcRole===undefined||ident(v.npcRole))&&(v.npcId===undefined||ident(v.npcId))&&
    (v.npcRole!==undefined||v.npcId!==undefined),'Quest talk: unbound actor');
   break;
  case 'visit':
   allowed=['kind','targetId','withinM','islandId'];
   need(ident(v.targetId)&&typeof v.withinM==='number'&&Number.isFinite(v.withinM)&&
    v.withinM>=.5&&v.withinM<=100,'Quest visit: invalid target');
   break;
  case 'acquire':
   allowed=['kind','itemId','quantity','source','fromIslandId'];
   need(ident(v.itemId)&&integer(v.quantity,1,9999)&&
    (v.source===undefined||['any','gather','fishing','mine','farm','trade','craft'].includes(String(v.source)))&&
    (v.fromIslandId===undefined||ident(v.fromIslandId)),'Quest acquire: invalid source');
   break;
  case 'deliver':
   allowed=['kind','itemId','quantity','giverId','islandId'];
   need(ident(v.itemId)&&integer(v.quantity,1,9999)&&ident(v.giverId),'Quest delivery: invalid source');
   break;
  case 'craft':
   allowed=['kind','recipeId','quantity','stationId','islandId'];
   need(ident(v.recipeId)&&integer(v.quantity,1,9999)&&
    (v.stationId===undefined||ident(v.stationId)),'Quest craft: invalid station');
   break;
  case 'race':
   allowed=['kind','raceId','maxSeconds','islandId'];
   need(ident(v.raceId)&&(v.maxSeconds===undefined||
    (typeof v.maxSeconds==='number'&&Number.isFinite(v.maxSeconds)&&v.maxSeconds>0&&v.maxSeconds<=86400)),'Quest race: invalid target');
   break;
  case 'event':
   allowed=['kind','eventType','subjectId','source','count','islandId'];
   // Only declared gameplay events (gameplay/events.ts): a step can never wait for an event nobody emits.
   need(isGameplayEventType(v.eventType)&&integer(v.count,1,9999)&&
    (v.subjectId===undefined||ident(v.subjectId))&&(v.source===undefined||ident(v.source)),'Quest event: invalid requirement');
   break;
  case 'travel':
   allowed=['kind','fromIslandId','toIslandId'];
   need(ident(v.fromIslandId)&&ident(v.toIslandId)&&v.fromIslandId!==v.toIslandId,
    'Quest travel: islands invalid');
   break;
  default:throw Error('Quest step: unknown kind');
 }
 need(v.islandId===undefined||ident(v.islandId),'Quest step: invalid island');
 need(Object.keys(v).every(k=>allowed.includes(k)),'Quest step: extra variant fields');
 return structuredClone(v) as QuestStepV1;
}
export function parseQuestTemplate(raw:unknown):QuestTemplateV1{
 const v=object(raw,['id','version','family','difficulty','titleKey','descriptionKey',
  'giverRoles','requiredCapabilities','steps','rewardProfileId','repeatable',
  'cooldownGameMinutes','uniquePerArchipelago'],'Quest template');
 need(v.version===1&&ident(v.id)&&ident(v.family)&&integer(v.difficulty,0,5)&&
  phrase(v.titleKey,120)&&phrase(v.descriptionKey,200)&&
  strings(v.giverRoles,19)&&strings(v.requiredCapabilities,32)&&
  Array.isArray(v.steps)&&v.steps.length>=1&&v.steps.length<=8&&
  ident(v.rewardProfileId)&&typeof v.repeatable==='boolean'&&
  (v.cooldownGameMinutes===undefined||integer(v.cooldownGameMinutes,1,1000000))&&
  (v.uniquePerArchipelago===undefined||typeof v.uniquePerArchipelago==='boolean'),
  'Quest template: invalid fields');
 const steps=(v.steps as unknown[]).map(step);
 need(steps.length>0,'Quest template: empty steps');
 return {...structuredClone(v),steps} as unknown as QuestTemplateV1;
}
export function parseQuestGameEvent(raw:unknown):QuestGameEventV1{
 const v=object(raw,['schemaVersion','eventId','type','worldId','islandId','gameMinute','sequence',
  'actorId','targetId','itemId','quantity','source','recipeId','raceId','measuredSeconds','distanceM'],'Quest event');
 need(v.schemaVersion===1&&ident(v.eventId)&&ident(v.type)&&ident(v.worldId)&&ident(v.islandId)&&
  integer(v.gameMinute,0,10000000000)&&integer(v.sequence,0,1000000000)&&
  ['actorId','targetId','itemId','source','recipeId','raceId'].every(k=>v[k]===undefined||ident(v[k]))&&
  (v.quantity===undefined||integer(v.quantity,1,9999))&&
  (v.measuredSeconds===undefined||(typeof v.measuredSeconds==='number'&&Number.isFinite(v.measuredSeconds)&&v.measuredSeconds>=0&&v.measuredSeconds<=86400))&&
  (v.distanceM===undefined||(typeof v.distanceM==='number'&&Number.isFinite(v.distanceM)&&v.distanceM>=0&&v.distanceM<=100000)),
  'Quest event: invalid provenance');
 return structuredClone(v) as unknown as QuestGameEventV1;
}
export function parseQuestCommand(raw:unknown):QuestCommandV1{
 const v=object(raw,['commandId','type','instanceId','actorId'],'Quest command');
 need(ident(v.commandId)&&['accept','cancel','claim'].includes(String(v.type))&&
  ident(v.instanceId)&&(v.actorId===undefined||ident(v.actorId)),'Quest command: invalid');
 return structuredClone(v) as unknown as QuestCommandV1;
}

function reward(raw:unknown):QuestRewardV1{
 const v=object(raw,['kind','itemId','quantity','unlockId','unlockKind'],'Quest reward');
 switch(v.kind){
  case 'item':
   need(Object.keys(v).every(k=>['kind','itemId','quantity'].includes(k))&&
    ident(v.itemId)&&integer(v.quantity,1,9999),'Quest reward: invalid item');break;
  case 'coins':
   need(Object.keys(v).every(k=>['kind','quantity'].includes(k))&&
    integer(v.quantity,1,1000000),'Quest reward: invalid coins');break;
  case 'unlock':
   need(Object.keys(v).every(k=>['kind','unlockId','unlockKind'].includes(k))&&
    ident(v.unlockId)&&ident(v.unlockKind),'Quest reward: invalid unlock');break;
  default:throw Error('Quest reward: unsupported kind');
 }
 return structuredClone(v) as unknown as QuestRewardV1;
}
export function parseQuestCatalogEntry(raw:unknown):QuestCatalogEntryV1{
 const v=object(raw,['questKey','templateId','templateVersion','islandId','giverId','bindings',
  'steps','rewards','dependencies','catalogRevision','proof'],'Quest catalog entry');
 need(ident(v.questKey)&&ident(v.templateId)&&integer(v.templateVersion,1,999)&&
  ident(v.islandId)&&ident(v.giverId)&&record(v.bindings)&&
  Object.keys(v.bindings).length<=32&&Object.entries(v.bindings).every(([k,value])=>
   ident(k)&&(phrase(value,200)||(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e9)))&&
  Array.isArray(v.steps)&&v.steps.length>=1&&v.steps.length<=8&&
  Array.isArray(v.rewards)&&v.rewards.length<=5&&
  strings(v.dependencies,32)&&ident(v.catalogRevision),'Quest catalog: invalid fields');
 const proof=object(v.proof,['capabilityIds','validatorVersion'],'Quest proof');
 need(strings(proof.capabilityIds,32)&&ident(proof.validatorVersion),'Quest proof: invalid');
 const steps=(v.steps as unknown[]).map(step),rewards=(v.rewards as unknown[]).map(reward);
 return {...structuredClone(v),steps,rewards} as unknown as QuestCatalogEntryV1;
}
export function parseQuestInstance(raw:unknown):QuestInstanceV1{
 const v=object(raw,['questKey','templateId','templateVersion','islandId','giverId','bindings',
  'steps','rewards','dependencies','catalogRevision','proof','instanceId','acceptedAtGameMinute',
  'status','stepIndex','stepProgress','appliedEventIds','rewardClaimId'],'Quest instance');
 const catalog=parseQuestCatalogEntry(Object.fromEntries(Object.entries(v).filter(([k])=>
  !['instanceId','acceptedAtGameMinute','status','stepIndex','stepProgress','appliedEventIds','rewardClaimId'].includes(k))));
 need(ident(v.instanceId)&&integer(v.acceptedAtGameMinute,0,10000000000)&&
  ['available','active','ready','claimed','cancelled','expired','suspended'].includes(String(v.status))&&
  integer(v.stepIndex,0,catalog.steps.length)&&
  Array.isArray(v.stepProgress)&&v.stepProgress.length===catalog.steps.length&&
  v.stepProgress.every(x=>integer(x,0,9999))&&strings(v.appliedEventIds,256)&&
  (v.rewardClaimId===undefined||ident(v.rewardClaimId)),'Quest instance: invalid state');
 return {...catalog,instanceId:v.instanceId,acceptedAtGameMinute:v.acceptedAtGameMinute,
  status:v.status,stepIndex:v.stepIndex,stepProgress:structuredClone(v.stepProgress),
  appliedEventIds:structuredClone(v.appliedEventIds),...(v.rewardClaimId?{rewardClaimId:v.rewardClaimId}:{})} as unknown as QuestInstanceV1;
}
export function parseQuestOfferConfig(raw:unknown):QuestOfferConfigV1{
 const v=object(raw,['schemaVersion','enabled','density','maxDifficulty','enabledFamilies',
  'maxVisiblePerGiver','maxActivePerPlayer','disabledTemplates','pinnedTemplateIds'],'Quest offer config');
 need(v.schemaVersion===1&&typeof v.enabled==='boolean'&&
  ['low','normal','high'].includes(String(v.density))&&integer(v.maxDifficulty,0,5)&&
  strings(v.enabledFamilies,24)&&integer(v.maxVisiblePerGiver,1,5)&&
  integer(v.maxActivePerPlayer,1,10)&&
  (v.disabledTemplates===undefined||strings(v.disabledTemplates,128))&&
  (v.pinnedTemplateIds===undefined||strings(v.pinnedTemplateIds,128)),
  'Quest offer config: invalid');
 return structuredClone(v) as unknown as QuestOfferConfigV1;
}
