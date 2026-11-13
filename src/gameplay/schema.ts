import {validDialogue,type DialogueDefinition as LegacyDialogue} from '../dialogue.ts';
export type StateValue=boolean|number|string;
export interface Point3 {x:number;y:number;z:number;}
export interface VariableDefinition {id:string;scope:'entity'|'zone'|'world'|'savegame';ownerId?:string;valueType:'boolean'|'number'|'string';initialValue:StateValue;persistent:boolean;}
export type ObjectiveStatus='locked'|'active'|'complete';
export interface ItemDefinition {id:string;name:string;category:string;maxQuantity:number;}
export interface ObjectiveDefinition {id:string;name:string;initialStatus:ObjectiveStatus;persistent:boolean;}
export type ConditionExpr=
  |{type:'all'|'any';conditions:ConditionExpr[]}|{type:'not';condition:ConditionExpr}
  |{type:'stateEquals';entityId:string;key:string;value:StateValue}
  |{type:'variableEquals';variableId:string;value:StateValue}
  |{type:'hasItem';itemId:string;quantity:number}
  |{type:'objectiveState';objectiveId:string;status:ObjectiveStatus}
  |{type:'distanceWithin';entityId:string;distance:number}
  |{type:'cooldownReady';interactionId:string};
export type TriggerDefinition=
  |{type:'onInteract';entityId:string}
  |{type:'onEnterZone'|'onExitZone';zoneId:string}
  |{type:'onDialogueChoice';dialogueId:string;choiceId?:string}
  |{type:'onTimer';timerId:string;interval:number}
  |{type:'onStateChanged';entityId:string;key?:string}
  |{type:'onAnimationFinished';entityId:string;animation?:string}
  |{type:'onObjectiveChanged';objectiveId:string}
  |{type:'onEvent';eventId:string};
export type ActionStep=
  |{type:'setState';entityId:string;key:string;value:StateValue}
  |{type:'toggleState';entityId:string;key:string}
  |{type:'setVariable';variableId:string;value:StateValue}
  |{type:'giveItem'|'takeItem';itemId:string;quantity:number}
  |{type:'setObjective';objectiveId:string;status:ObjectiveStatus}
  |{type:'wait';seconds:number}
  |{type:'emitEvent';eventId:string;entityId?:string}
  |{type:'showText';text:string;entityId?:string}
  |{type:'startDialogue';dialogueId:string;entityId?:string}
  |{type:'playAnimation';entityId:string;animation:string}
  |{type:'playSound';soundId:string;entityId?:string}
  |{type:'playEffect';effectId:string;entityId?:string}
  |{type:'moveNPCTo';entityId:string;position:Point3};
export interface InteractionDefinition {id:string;trigger:TriggerDefinition;condition?:ConditionExpr;sequence:ActionStep[];repeat:'once'|'always'|'cooldown';cooldown?:number;persistent?:boolean;}
export interface ActivityDefinition {id:string;kind:'collect'|'deliver'|'fish'|'puzzle';name:string;interactionIds:string[];objectiveId?:string;}
export interface GameplayDialogue extends Omit<LegacyDialogue,'lines'> {id:string;actorId?:string;lines:(Omit<LegacyDialogue['lines'][number],'choices'>&{actions?:ActionStep[];choices:(LegacyDialogue['lines'][number]['choices'][number]&{id?:string;gate?:ConditionExpr;actions?:ActionStep[]})[]})[];}
export interface GameplayEntity {id:string;ownerChunkId:string;position?:Point3;initialState:Record<string,StateValue>;persistentState:string[];interactable?:{prompt:string;range:number;interactionIds?:string[]};}
export interface GameplayData {worldId:string;buildVersion:string;entities:GameplayEntity[];variables:VariableDefinition[];interactions:InteractionDefinition[];items:ItemDefinition[];objectives:ObjectiveDefinition[];dialogues:GameplayDialogue[];activities?:ActivityDefinition[];}
export const gameplayLimits={conditionDepth:8,conditionNodes:128,sequenceSteps:64,eventsPerUpdate:128,actionsPerUpdate:256,activeSequences:64,effects:128} as const;
export const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export const finite=(v:unknown,min=-1e9,max=1e9):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export const identifier=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128&&!/[\u0000-\u001f]/.test(v);
export const stateValue=(v:unknown):v is StateValue=>typeof v==='boolean'||finite(v)||(typeof v==='string'&&v.length<=2000);
const text=(v:unknown,max=2000)=>typeof v==='string'&&v.length>0&&v.length<=max;
const status=(v:unknown):v is ObjectiveStatus=>v==='locked'||v==='active'||v==='complete';
const point=(v:unknown):v is Point3=>record(v)&&finite(v.x,-100000,100000)&&finite(v.y,-10000,10000)&&finite(v.z,-100000,100000);
const requireValue=(yes:unknown,message:string):void=>{if(!yes)throw Error(message);};
const clone=<T>(v:unknown):T=>structuredClone(v) as T;
function object(v:unknown,label:string):Record<string,unknown>{requireValue(record(v),label+' : objet attendu');return v as Record<string,unknown>;}
function ids(v:unknown,max=10000):v is string[]{return Array.isArray(v)&&v.length<=max&&v.every(identifier)&&new Set(v).size===v.length;}
export function parseVariable(value:unknown):VariableDefinition {
  const v=object(value,'Variable');requireValue(identifier(v.id)&&['entity','zone','world','savegame'].includes(String(v.scope))&&['boolean','number','string'].includes(String(v.valueType))&&stateValue(v.initialValue)&&typeof v.initialValue===v.valueType&&typeof v.persistent==='boolean','Variable : type ou valeur invalide');
  requireValue((v.scope==='entity'||v.scope==='zone')?identifier(v.ownerId):v.ownerId===undefined,'Variable : propriétaire de portée invalide');return clone(value);
}
export function parseItem(value:unknown):ItemDefinition {const v=object(value,'Objet inventaire');requireValue(identifier(v.id)&&text(v.name,100)&&text(v.category,100)&&Number.isInteger(v.maxQuantity)&&finite(v.maxQuantity,1,9999),'Objet inventaire invalide');return clone(value);}
export function parseObjective(value:unknown):ObjectiveDefinition {const v=object(value,'Objectif');requireValue(identifier(v.id)&&text(v.name,200)&&status(v.initialStatus)&&typeof v.persistent==='boolean','Objectif invalide');return clone(value);}
export function parseActivity(value:unknown):ActivityDefinition {const v=object(value,'Activité');requireValue(identifier(v.id)&&['collect','deliver','fish','puzzle'].includes(String(v.kind))&&text(v.name,200)&&ids(v.interactionIds,100)&&(v.objectiveId===undefined||identifier(v.objectiveId)),'Activité invalide');return clone(value);}
export function parseCondition(value:unknown):ConditionExpr {
  let nodes=0;
  function visit(value:unknown,depth:number):void {
    requireValue(depth<=gameplayLimits.conditionDepth&&++nodes<=gameplayLimits.conditionNodes,'Condition trop complexe');const v=object(value,'Condition');
    switch(v.type){
      case 'all':case 'any':requireValue(Array.isArray(v.conditions)&&v.conditions.length<=16,'Liste de conditions invalide');for(const child of v.conditions as unknown[])visit(child,depth+1);break;
      case 'not':visit(v.condition,depth+1);break;
      case 'stateEquals':requireValue(identifier(v.entityId)&&identifier(v.key)&&stateValue(v.value),'Condition état invalide');break;
      case 'variableEquals':requireValue(identifier(v.variableId)&&stateValue(v.value),'Condition variable invalide');break;
      case 'hasItem':requireValue(identifier(v.itemId)&&Number.isInteger(v.quantity)&&finite(v.quantity,1,9999),'Condition inventaire invalide');break;
      case 'objectiveState':requireValue(identifier(v.objectiveId)&&status(v.status),'Condition objectif invalide');break;
      case 'distanceWithin':requireValue(identifier(v.entityId)&&finite(v.distance,0,10000),'Condition distance invalide');break;
      case 'cooldownReady':requireValue(identifier(v.interactionId),'Condition délai invalide');break;
      default:throw Error('Type de condition non supporté');
    }
  }visit(value,0);return clone(value);
}
export function parseTrigger(value:unknown):TriggerDefinition {
  const v=object(value,'Déclencheur');
  switch(v.type){
    case 'onInteract':requireValue(identifier(v.entityId),'Cible interaction invalide');break;
    case 'onEnterZone':case 'onExitZone':requireValue(identifier(v.zoneId),'Zone invalide');break;
    case 'onDialogueChoice':requireValue(identifier(v.dialogueId)&&(v.choiceId===undefined||identifier(v.choiceId)),'Choix dialogue invalide');break;
    case 'onTimer':requireValue(identifier(v.timerId)&&finite(v.interval,.1,86400),'Minuterie invalide');break;
    case 'onStateChanged':requireValue(identifier(v.entityId)&&(v.key===undefined||identifier(v.key)),'Événement état invalide');break;
    case 'onAnimationFinished':requireValue(identifier(v.entityId)&&(v.animation===undefined||identifier(v.animation)),'Événement animation invalide');break;
    case 'onObjectiveChanged':requireValue(identifier(v.objectiveId),'Événement objectif invalide');break;
    case 'onEvent':requireValue(identifier(v.eventId),'Événement invalide');break;
    default:throw Error('Déclencheur non supporté');
  }return clone(value);
}
export function parseAction(value:unknown):ActionStep {
  const v=object(value,'Action');
  switch(v.type){
    case 'setState':requireValue(identifier(v.entityId)&&identifier(v.key)&&stateValue(v.value),'Action état invalide');break;
    case 'toggleState':requireValue(identifier(v.entityId)&&identifier(v.key),'Bascule état invalide');break;
    case 'setVariable':requireValue(identifier(v.variableId)&&stateValue(v.value),'Action variable invalide');break;
    case 'giveItem':case 'takeItem':requireValue(identifier(v.itemId)&&Number.isInteger(v.quantity)&&finite(v.quantity,1,9999),'Action inventaire invalide');break;
    case 'setObjective':requireValue(identifier(v.objectiveId)&&status(v.status),'Action objectif invalide');break;
    case 'wait':requireValue(finite(v.seconds,.001,86400),'Délai invalide');break;
    case 'emitEvent':requireValue(identifier(v.eventId)&&(v.entityId===undefined||identifier(v.entityId)),'Émission invalide');break;
    case 'showText':requireValue(text(v.text)&&(v.entityId===undefined||identifier(v.entityId)),'Texte invalide');break;
    case 'startDialogue':requireValue(identifier(v.dialogueId)&&(v.entityId===undefined||identifier(v.entityId)),'Dialogue invalide');break;
    case 'playAnimation':requireValue(identifier(v.entityId)&&identifier(v.animation),'Animation invalide');break;
    case 'playSound':requireValue(identifier(v.soundId)&&(v.entityId===undefined||identifier(v.entityId)),'Son invalide');break;
    case 'playEffect':requireValue(identifier(v.effectId)&&(v.entityId===undefined||identifier(v.entityId)),'Effet invalide');break;
    case 'moveNPCTo':requireValue(identifier(v.entityId)&&point(v.position),'Destination invalide');break;
    default:throw Error('Action non supportée (scripts interdits)');
  }return clone(value);
}
function sequence(value:unknown):ActionStep[]{requireValue(Array.isArray(value)&&value.length<=gameplayLimits.sequenceSteps,'Séquence trop longue');return (value as unknown[]).map(parseAction);}
export function parseInteraction(value:unknown):InteractionDefinition {
  const v=object(value,'Interaction');requireValue(identifier(v.id)&&['once','always','cooldown'].includes(String(v.repeat))&&(v.persistent===undefined||typeof v.persistent==='boolean'),'Interaction invalide');parseTrigger(v.trigger);if(v.condition!==undefined)parseCondition(v.condition);sequence(v.sequence);if(v.repeat==='cooldown')requireValue(finite(v.cooldown,.1,86400),'Cooldown invalide');return clone(value);
}
export function parseGameplayDialogue(value:unknown):GameplayDialogue {
  const v=object(value,'Dialogue');requireValue(identifier(v.id)&&(v.actorId===undefined||identifier(v.actorId))&&validDialogue(v),'Dialogue invalide');
  const seen=new Set<string>();for(const line of v.lines as GameplayDialogue['lines']){if(line.actions!==undefined)sequence(line.actions);for(const choice of line.choices){if(choice.id!==undefined){requireValue(identifier(choice.id)&&!seen.has(choice.id),'ID de choix dupliqué');seen.add(choice.id);}if(choice.gate)parseCondition(choice.gate);if(choice.actions)sequence(choice.actions);}}
  return clone(value);
}
export interface GameplayLibraries {variables:Record<string,VariableDefinition>;interactions:Record<string,InteractionDefinition>;activities:Record<string,ActivityDefinition>;items:Record<string,ItemDefinition>;objectives:Record<string,ObjectiveDefinition>;dialogues:Record<string,GameplayDialogue>;}
const libraryParsers={variables:parseVariable,interactions:parseInteraction,activities:parseActivity,items:parseItem,objectives:parseObjective,dialogues:parseGameplayDialogue};
export function validateGameplayLibraries(value:unknown,entityIds?:Iterable<string>,zoneIds?:Iterable<string>):void {
  const libraries=object(value,'Bibliothèques gameplay');
  for(const [name,parser] of Object.entries(libraryParsers)){const entries=libraries[name]??{};requireValue(record(entries)&&Object.keys(entries).length<=10000,'Registre gameplay invalide : '+name);for(const [id,value] of Object.entries(entries)){const parsed=parser(value);requireValue(parsed.id===id,'Clé de registre différente de son ID : '+id);}}
  const entities=entityIds?new Set(entityIds):undefined,zones=zoneIds?new Set(zoneIds):undefined;
  const exists=(kind:string,id:unknown)=>{requireValue(identifier(id),'Référence invalide');if(kind==='entity'){if(entities)requireValue(entities.has(id as string),'Entité absente : '+id);}else if(kind==='zone'){if(zones)requireValue(zones.has(id as string),'Zone absente : '+id);}else requireValue(record(libraries[kind])&&Object.hasOwn(libraries[kind],id as string),'Référence absente : '+id);};
  function condition(c:ConditionExpr){if(c.type==='all'||c.type==='any')c.conditions.forEach(condition);else if(c.type==='not')condition(c.condition);else if(c.type==='stateEquals'||c.type==='distanceWithin')exists('entity',c.entityId);else if(c.type==='variableEquals')exists('variables',c.variableId);else if(c.type==='hasItem')exists('items',c.itemId);else if(c.type==='objectiveState')exists('objectives',c.objectiveId);else if(c.type==='cooldownReady')exists('interactions',c.interactionId);}
  function action(a:ActionStep){if('entityId'in a&&a.entityId)exists('entity',a.entityId);if(a.type==='setVariable')exists('variables',a.variableId);if(a.type==='giveItem'||a.type==='takeItem')exists('items',a.itemId);if(a.type==='setObjective')exists('objectives',a.objectiveId);if(a.type==='startDialogue')exists('dialogues',a.dialogueId);}
  for(const v of Object.values(libraries.variables??{}) as VariableDefinition[]){if(v.scope==='entity')exists('entity',v.ownerId);if(v.scope==='zone')exists('zone',v.ownerId);}
  for(const i of Object.values(libraries.interactions??{}) as InteractionDefinition[]){if(i.condition)condition(i.condition);i.sequence.forEach(action);const t=i.trigger;if('entityId'in t)exists('entity',t.entityId);if('zoneId'in t)exists('zone',t.zoneId);if(t.type==='onDialogueChoice')exists('dialogues',t.dialogueId);if(t.type==='onObjectiveChanged')exists('objectives',t.objectiveId);}
  for(const d of Object.values(libraries.dialogues??{}) as GameplayDialogue[]){if(d.actorId)exists('entity',d.actorId);for(const line of d.lines){line.actions?.forEach(action);for(const c of line.choices){if(c.gate)condition(c.gate);c.actions?.forEach(action);}}}
  for(const a of Object.values(libraries.activities??{}) as ActivityDefinition[]){a.interactionIds.forEach(id=>exists('interactions',id));if(a.objectiveId)exists('objectives',a.objectiveId);}
}
export function parseGameplayData(value:unknown):GameplayData {
  const v=object(value,'Gameplay');requireValue(identifier(v.worldId)&&identifier(v.buildVersion)&&Array.isArray(v.entities)&&v.entities.length<=100000,'Monde gameplay invalide');const idsSeen=new Set<string>();
  for(const raw of v.entities as unknown[]){const e=object(raw,'Entité logique');requireValue(identifier(e.id)&&!idsSeen.has(e.id as string)&&identifier(e.ownerChunkId)&&record(e.initialState)&&ids(e.persistentState,100)&&(e.position===undefined||point(e.position)),'Entité logique invalide');idsSeen.add(e.id as string);requireValue(Object.keys(e.initialState as object).length<=100,'Trop de champs état');for(const [key,value] of Object.entries(e.initialState as object))requireValue(identifier(key)&&stateValue(value),'Champ état invalide');for(const key of e.persistentState as string[])requireValue(Object.hasOwn(e.initialState as object,key),'Champ persistant absent');if(e.interactable!==undefined){const i=object(e.interactable,'Interaction entité');requireValue(text(i.prompt,200)&&finite(i.range,.1,100)&&(i.interactionIds===undefined||ids(i.interactionIds,100)),'Invite interaction invalide');}}
  const libraries:Record<string,unknown>={};for(const name of Object.keys(libraryParsers)){const list=v[name]??[];requireValue(Array.isArray(list)&&list.length<=10000,'Liste gameplay invalide');const dict=Object.create(null) as Record<string,unknown>;for(const raw of list as unknown[]){const item=object(raw,name);requireValue(identifier(item.id)&&!Object.hasOwn(dict,item.id as string),'ID gameplay dupliqué');dict[item.id as string]=item;}libraries[name]=dict;}
  validateGameplayLibraries(libraries,idsSeen,new Set((v.entities as GameplayEntity[]).map(e=>e.ownerChunkId)));
  const entityMap=new Map((v.entities as GameplayEntity[]).map(e=>[e.id,e]));const vars=new Map((v.variables as VariableDefinition[]??[]).map(e=>[e.id,e]));
  function checkAction(a:ActionStep){if(a.type==='setState'||a.type==='toggleState'){const state=entityMap.get(a.entityId)!.initialState;requireValue(Object.hasOwn(state,a.key),'Champ état absent : '+a.key);requireValue(a.type==='toggleState'?typeof state[a.key]==='boolean':typeof state[a.key]===typeof a.value,'Type état incompatible');}if(a.type==='setVariable')requireValue(vars.get(a.variableId)?.valueType===typeof a.value,'Type variable incompatible');}
  const interactionIds=new Set(((v.interactions??[]) as InteractionDefinition[]).map(i=>i.id));
  for(const entity of entityMap.values())for(const id of entity.interactable?.interactionIds??[])requireValue(interactionIds.has(id),'Interaction d’entité absente : '+id);
  function checkCondition(c:ConditionExpr):void {
    if(c.type==='all'||c.type==='any')c.conditions.forEach(checkCondition);else if(c.type==='not')checkCondition(c.condition);
    else if(c.type==='stateEquals'){const initial=entityMap.get(c.entityId)!.initialState;requireValue(Object.hasOwn(initial,c.key)&&typeof initial[c.key]===typeof c.value,'Condition état incompatible : '+c.key);}
    else if(c.type==='variableEquals')requireValue(vars.get(c.variableId)?.valueType===typeof c.value,'Condition variable incompatible');
  }
  for(const i of (v.interactions??[]) as InteractionDefinition[]){i.sequence.forEach(checkAction);if(i.condition)checkCondition(i.condition);}
  for(const d of (v.dialogues??[]) as GameplayDialogue[])for(const l of d.lines){l.actions?.forEach(checkAction);l.choices.forEach(c=>{c.actions?.forEach(checkAction);if(c.gate)checkCondition(c.gate);});}
  return clone({...v,variables:v.variables??[],interactions:v.interactions??[],items:v.items??[],objectives:v.objectives??[],dialogues:v.dialogues??[],activities:v.activities??[]});
}
export interface GameplayReference {sourceId:string;targetId:string;kind:'entity'|'zone'|'dialogue'|'interaction'|'variable'|'item'|'objective';}
export function gameplayReferences(libraries:Partial<GameplayLibraries>):GameplayReference[]{
  const out:GameplayReference[]=[];
  const add=(sourceId:string,targetId:string,kind:GameplayReference['kind'])=>out.push({sourceId,targetId,kind});
  function condition(source:string,c:ConditionExpr){if(c.type==='all'||c.type==='any')c.conditions.forEach(x=>condition(source,x));else if(c.type==='not')condition(source,c.condition);else if(c.type==='stateEquals'||c.type==='distanceWithin')add(source,c.entityId,'entity');else if(c.type==='variableEquals')add(source,c.variableId,'variable');else if(c.type==='hasItem')add(source,c.itemId,'item');else if(c.type==='objectiveState')add(source,c.objectiveId,'objective');else if(c.type==='cooldownReady')add(source,c.interactionId,'interaction');}
  function action(source:string,a:ActionStep){if('entityId'in a&&a.entityId)add(source,a.entityId,'entity');if(a.type==='setVariable')add(source,a.variableId,'variable');if(a.type==='giveItem'||a.type==='takeItem')add(source,a.itemId,'item');if(a.type==='setObjective')add(source,a.objectiveId,'objective');if(a.type==='startDialogue')add(source,a.dialogueId,'dialogue');}
  for(const i of Object.values(libraries.interactions??{})){const t=i.trigger;if('entityId'in t)add(i.id,t.entityId,'entity');if('zoneId'in t)add(i.id,t.zoneId,'zone');if(t.type==='onDialogueChoice')add(i.id,t.dialogueId,'dialogue');if(t.type==='onObjectiveChanged')add(i.id,t.objectiveId,'objective');if(i.condition)condition(i.id,i.condition);i.sequence.forEach(a=>action(i.id,a));}
  for(const d of Object.values(libraries.dialogues??{})){if(d.actorId)add(d.id,d.actorId,'entity');for(const l of d.lines){l.actions?.forEach(a=>action(d.id,a));for(const c of l.choices){if(c.gate)condition(d.id,c.gate);c.actions?.forEach(a=>action(d.id,a));}}}
  for(const v of Object.values(libraries.variables??{}))if(v.ownerId)add(v.id,v.ownerId,v.scope==='entity'?'entity':'zone');
  for(const a of Object.values(libraries.activities??{})){a.interactionIds.forEach(id=>add(a.id,id,'interaction'));if(a.objectiveId)add(a.id,a.objectiveId,'objective');}
  return out;
}
/** Conservative instant-event cycle check; waits deliberately break synchronous chains. */
export function validateInstantEventCycles(libraries:Pick<GameplayLibraries,'interactions'>):void {
  const interactions=Object.values(libraries.interactions),edges=new Map<string,string[]>();
  for(const i of interactions){const emitted:string[]=[];for(const a of i.sequence){if(a.type==='wait')break;if(a.type==='emitEvent')for(const target of interactions)if(target.trigger.type==='onEvent'&&target.trigger.eventId===a.eventId)emitted.push(target.id);if(a.type==='setState'||a.type==='toggleState')for(const target of interactions)if(target.trigger.type==='onStateChanged'&&target.trigger.entityId===a.entityId&&(target.trigger.key===undefined||target.trigger.key===a.key))emitted.push(target.id);if(a.type==='setObjective')for(const target of interactions)if(target.trigger.type==='onObjectiveChanged'&&target.trigger.objectiveId===a.objectiveId)emitted.push(target.id);}edges.set(i.id,emitted);}
  const visiting=new Set<string>(),done=new Set<string>();
  function visit(id:string){if(visiting.has(id))throw Error('Cycle instantané d’événements : '+id);if(done.has(id))return;visiting.add(id);for(const next of edges.get(id)??[])visit(next);visiting.delete(id);done.add(id);}
  for(const id of edges.keys())visit(id);
}
