import {WorldClock} from '../environment/clock.ts';
import {createClimate,defaultEnvironment} from '../environment/climate.ts';
import {finite,gameplayLimits,parseGameplayData,type ActionStep,type ConditionExpr,type GameplayData,type ObjectiveStatus,type Point3,type StateValue,type TriggerDefinition} from './schema.ts';
import {parseGameSave,type GameSaveV1} from './save.ts';
export interface GameplayEvent {type:TriggerDefinition['type'];entityId?:string;zoneId?:string;dialogueId?:string;choiceId?:string;timerId?:string;key?:string;animation?:string;objectiveId?:string;eventId?:string;depth?:number;}
export type GameplayEffect=Extract<ActionStep,{type:'showText'|'startDialogue'|'playAnimation'|'playSound'|'playEffect'|'moveNPCTo'}>;
export interface GameplayState {time:number;entities:Record<string,Record<string,StateValue>>;variables:Record<string,StateValue>;inventory:Record<string,number>;objectives:Record<string,ObjectiveStatus>;executed:Record<string,boolean>;cooldowns:Record<string,number>;dialogueFlags:Record<string,boolean>;playerPosition:Point3;diagnostics:string[];metrics:{events:number;actions:number;started:number};}
interface Job {interactionId:string;sequence:ActionStep[];cursor:number;wakeAt:number;depth:number;}
const dictionary=<T>():Record<string,T>=>Object.create(null) as Record<string,T>;
export function createGameplay(raw:GameplayData){
  const clock=new WorldClock();
  const data=parseGameplayData(raw),entities=new Map(data.entities.map(e=>[e.id,e])),interactions=new Map(data.interactions.map(i=>[i.id,i])),items=new Map(data.items.map(i=>[i.id,i])),dialogues=new Map(data.dialogues.map(d=>[d.id,d]));
  const state:GameplayState={time:0,entities:dictionary(),variables:dictionary(),inventory:dictionary(),objectives:dictionary(),executed:dictionary(),cooldowns:dictionary(),dialogueFlags:dictionary(),playerPosition:{x:0,y:0,z:0},diagnostics:[],metrics:{events:0,actions:0,started:0}};
  for(const e of data.entities)state.entities[e.id]=Object.assign(dictionary<StateValue>(),e.initialState);
  for(const v of data.variables)state.variables[v.id]=v.initialValue;
  for(const o of data.objectives)state.objectives[o.id]=o.initialStatus;
  const climate=createClimate(data.environment??defaultEnvironment());
  const events:GameplayEvent[]=[],jobs:Job[]=[],effects:GameplayEffect[]=[];
  const eventKey=(event:GameplayEvent|TriggerDefinition):string=>{
    const field=event.type==='onInteract'||event.type==='onStateChanged'||event.type==='onAnimationFinished'?'entityId':event.type==='onEnterZone'||event.type==='onExitZone'?'zoneId':event.type==='onDialogueChoice'?'dialogueId':event.type==='onTimer'?'timerId':event.type==='onObjectiveChanged'?'objectiveId':'eventId';
    return event.type+':'+(event as unknown as Record<string,unknown>)[field];
  };
  const listeners=new Map<string,typeof data.interactions>();
  for(const interaction of data.interactions){const key=eventKey(interaction.trigger),list=listeners.get(key)??[];list.push(interaction);listeners.set(key,list);}
  const uniqueTimers=new Map<string,Extract<TriggerDefinition,{type:'onTimer'}>>();
  for(const i of data.interactions)if(i.trigger.type==='onTimer'){const previous=uniqueTimers.get(i.trigger.timerId);if(previous&&previous.interval!==i.trigger.interval)throw Error('Intervalles incohérents pour la minuterie : '+i.trigger.timerId);uniqueTimers.set(i.trigger.timerId,i.trigger);}
  const timers=[...uniqueTimers.values()].map(trigger=>({trigger,next:trigger.interval}));
  let pumping=false;
  function diagnostic(text:string){if(state.diagnostics.length<100)state.diagnostics.push(text);}
  function enqueue(event:GameplayEvent){if((event.depth??0)>16){diagnostic('Chaîne d’événements interrompue (profondeur).');return;}if(events.length>=gameplayLimits.eventsPerUpdate){diagnostic('Budget de file d’événements dépassé.');return;}events.push({...event});}
  function evaluate(c:ConditionExpr):boolean {
    switch(c.type){
      case 'all':return c.conditions.every(evaluate);case 'any':return c.conditions.some(evaluate);case 'not':return !evaluate(c.condition);
      case 'stateEquals':return state.entities[c.entityId]?.[c.key]===c.value;
      case 'variableEquals':return state.variables[c.variableId]===c.value;
      case 'hasItem':return (state.inventory[c.itemId]??0)>=c.quantity;
      case 'objectiveState':return state.objectives[c.objectiveId]===c.status;
      case 'distanceWithin':{const p=entities.get(c.entityId)?.position;return !!p&&Math.hypot(p.x-state.playerPosition.x,p.y-state.playerPosition.y,p.z-state.playerPosition.z)<=c.distance;}
      case 'cooldownReady':{const i=interactions.get(c.interactionId);return !!i&&state.time-(state.cooldowns[c.interactionId]??-Infinity)>=(i.cooldown??0);}
    }
  }
  function matches(trigger:TriggerDefinition,event:GameplayEvent):boolean {
    if(trigger.type!==event.type)return false;
    return Object.entries(trigger).every(([key,value])=>key==='type'||key==='interval'||event[key as keyof GameplayEvent]===value);
  }
  function start(event:GameplayEvent){
    state.metrics.events++;
    for(const i of listeners.get(eventKey(event))??[]){
      if(!matches(i.trigger,event)||jobs.some(j=>j.interactionId===i.id))continue;
      if(i.repeat==='once'&&state.executed[i.id])continue;
      if(i.repeat==='cooldown'&&state.time-(state.cooldowns[i.id]??-Infinity)<(i.cooldown??0))continue;
      if(i.condition&&!evaluate(i.condition))continue;
      if(jobs.length>=gameplayLimits.activeSequences){diagnostic('Trop de séquences actives.');break;}
      state.executed[i.id]=true;state.cooldowns[i.id]=state.time;state.metrics.started++;
      jobs.push({interactionId:i.id,sequence:i.sequence,cursor:0,wakeAt:state.time,depth:event.depth??0});
    }
  }
  function present(action:GameplayEffect){if(effects.length<gameplayLimits.effects)effects.push(structuredClone(action));else diagnostic('Budget de présentation dépassé.');}
  function execute(job:Job,a:ActionStep):boolean {
    state.metrics.actions++;
    switch(a.type){
      case 'wait':job.wakeAt=state.time+a.seconds;job.depth=0;return false;
      case 'setState':case 'toggleState':{
        const value=a.type==='toggleState'?!state.entities[a.entityId][a.key]:a.value;
        if(state.entities[a.entityId][a.key]!==value){state.entities[a.entityId][a.key]=value;enqueue({type:'onStateChanged',entityId:a.entityId,key:a.key,depth:job.depth+1});}break;
      }
      case 'setVariable':state.variables[a.variableId]=a.value;break;
      case 'giveItem':{const count=(state.inventory[a.itemId]??0)+a.quantity;if(count>items.get(a.itemId)!.maxQuantity){diagnostic('Inventaire plein : '+a.itemId);return false;}state.inventory[a.itemId]=count;break;}
      case 'takeItem':{const count=state.inventory[a.itemId]??0;if(count<a.quantity){diagnostic('Objet manquant : '+a.itemId);return false;}state.inventory[a.itemId]=count-a.quantity;break;}
      case 'setObjective':if(state.objectives[a.objectiveId]!==a.status){state.objectives[a.objectiveId]=a.status;enqueue({type:'onObjectiveChanged',objectiveId:a.objectiveId,depth:job.depth+1});}break;
      case 'emitEvent':enqueue({type:'onEvent',eventId:a.eventId,entityId:a.entityId,depth:job.depth+1});break;
      default:present(a);break;
    }return true;
  }
  // Each uninterrupted segment is one logical transaction. Validate the inventory
  // ledger before any state change, reward, event or presentation effect is emitted.
  function segment(job:Job){
    let end=job.cursor;while(end<job.sequence.length){if(job.sequence[end++].type==='wait')break;}
    return end;
  }
  function canApplySegment(job:Job,end:number){
    const ledger={...state.inventory};
    for(let cursor=job.cursor;cursor<end;cursor++){
      const a=job.sequence[cursor];if(a.type!=='giveItem'&&a.type!=='takeItem')continue;
      const count=(ledger[a.itemId]??0)+(a.type==='giveItem'?a.quantity:-a.quantity);
      if(count<0||count>items.get(a.itemId)!.maxQuantity){diagnostic((count<0?'Objet manquant : ':'Inventaire plein : ')+a.itemId);return false;}
      ledger[a.itemId]=count;
    }return true;
  }
  function pump(){
    if(pumping)return;pumping=true;let actionBudget=gameplayLimits.actionsPerUpdate,eventBudget=gameplayLimits.eventsPerUpdate;
    try{
      while(actionBudget>0&&eventBudget>0){
        if(events.length){start(events.shift()!);eventBudget--;}
        const job=jobs.find(j=>j.wakeAt<=state.time+1e-9);if(!job){if(!events.length)break;continue;}
        const end=segment(job);
        if(end-job.cursor>actionBudget)break;
        if(!canApplySegment(job,end)){
          // Before the first wait nothing has committed: the action may be retried.
          // After a wait earlier segments stay committed and must never be replayed.
          if(job.cursor===0){delete state.executed[job.interactionId];delete state.cooldowns[job.interactionId];}
          jobs.splice(jobs.indexOf(job),1);continue;
        }
        while(job.cursor<end&&actionBudget>0){const action=job.sequence[job.cursor++];actionBudget--;if(!execute(job,action)){if(action.type!=='wait'){job.cursor=job.sequence.length;delete state.executed[job.interactionId];}break;}}
        if(job.cursor>=job.sequence.length)jobs.splice(jobs.indexOf(job),1);
      }
      if(events.length||jobs.some(j=>j.wakeAt<=state.time+1e-9)){diagnostic('Budget logique atteint ; opérations différées.');}
    }finally{pumping=false;}
  }
  function emit(event:GameplayEvent){if(!listeners.has(eventKey(event)))return;enqueue(event);pump();}
  function update(dt:number){if(!Number.isFinite(dt)||dt<0||dt>60)throw Error('Pas de temps gameplay invalide');state.time=clock.advance(dt);let emitted=0;for(const timer of timers){while(state.time+1e-9>=timer.next&&emitted<16){enqueue({type:'onTimer',timerId:timer.trigger.timerId});timer.next+=timer.trigger.interval;emitted++;}if(state.time>=timer.next)timer.next=state.time+timer.trigger.interval;}pump();}
  function interact(entityId:string,position?:Point3):boolean {
    const entity=entities.get(entityId);if(!entity?.interactable)return false;
    if(position)state.playerPosition={...position};const p=entity.position;
    if(p&&Math.hypot(p.x-state.playerPosition.x,p.y-state.playerPosition.y,p.z-state.playerPosition.z)>entity.interactable.range)return false;
    const before=state.metrics.started;emit({type:'onInteract',entityId});return state.metrics.started>before;
  }
  function runActions(sequence:ActionStep[],id:string):boolean{if(sequence.length){if(jobs.length>=gameplayLimits.activeSequences){diagnostic('Trop de séquences actives.');return false;}const job={interactionId:id,sequence,cursor:0,wakeAt:state.time,depth:0};if(!canApplySegment(job,segment(job)))return false;jobs.push(job);pump();}return true;}
  function availableChoices(dialogueId:string,lineId:string){const d=dialogues.get(dialogueId),line=d?.lines.find(l=>l.id===lineId);return line?.choices.filter(c=>(!c.gate||evaluate(c.gate))&&(!c.condition||(state.dialogueFlags[JSON.stringify([dialogueId,c.condition.flag])]===true)===c.condition.equals))??[];}
  function dialogueChoice(dialogueId:string,lineId:string,choiceId:string):string|null|undefined {
    const d=dialogues.get(dialogueId),line=d?.lines.find(l=>l.id===lineId);if(!d||!line)return undefined;
    const choice=availableChoices(dialogueId,lineId).find(c=>(c.id??lineId+':'+line.choices.indexOf(c))===choiceId);if(!choice)return undefined;
    if(!runActions(choice.actions??[],'dialogue:'+dialogueId+':'+choiceId))return undefined;
    if(choice.action)state.dialogueFlags[JSON.stringify([dialogueId,choice.action.flag])]=choice.action.value;
    emit({type:'onDialogueChoice',dialogueId,choiceId,entityId:d.actorId});return choice.next??null;
  }
  function enterDialogueLine(dialogueId:string,lineId:string){const line=dialogues.get(dialogueId)?.lines.find(l=>l.id===lineId);if(line)runActions(line.actions??[],'dialogue-line:'+dialogueId+':'+lineId);}
  function save(slotId:string,position:Point3=state.playerPosition):GameSaveV1 {
    const persistentEntities=dictionary<Record<string,StateValue>>();for(const e of data.entities){const values=dictionary<StateValue>();for(const field of e.persistentState)values[field]=state.entities[e.id][field];if(e.persistentState.length)persistentEntities[e.id]=values;}
    const variables=dictionary<StateValue>();for(const v of data.variables)if(v.persistent)variables[v.id]=state.variables[v.id];
    const objectives=dictionary<ObjectiveStatus>();for(const o of data.objectives)if(o.persistent)objectives[o.id]=state.objectives[o.id];
    const executed=dictionary<boolean>(),cooldowns=dictionary<number>();for(const i of data.interactions)if(i.persistent){if(state.executed[i.id])executed[i.id]=true;if(state.cooldowns[i.id]!==undefined)cooldowns[i.id]=state.cooldowns[i.id];}
    return parseGameSave({schemaVersion:1,worldId:data.worldId,worldBuildVersion:data.buildVersion,slotId,savedAt:Date.now(),time:state.time,position,inventory:{...state.inventory},variables,objectives,entities:persistentEntities,executed,cooldowns,dialogueFlags:{...state.dialogueFlags},pending:jobs.filter(j=>interactions.get(j.interactionId)?.persistent).map(j=>({interactionId:j.interactionId,cursor:j.cursor,wakeAt:j.wakeAt}))});
  }
  function restore(raw:GameSaveV1):string[]{
    const saved=parseGameSave(raw);if(saved.worldId!==data.worldId)throw Error('Sauvegarde d’un autre monde');
    const warnings:string[]=[];if(saved.worldBuildVersion!==data.buildVersion)warnings.push('Version de monde différente ; références contrôlées.');
    clock.restore(saved.time);state.time=clock.time;state.playerPosition={...saved.position};events.length=0;jobs.length=0;effects.length=0;
    for(const e of data.entities)state.entities[e.id]=Object.assign(dictionary<StateValue>(),e.initialState);
    for(const v of data.variables)state.variables[v.id]=v.initialValue;
    for(const o of data.objectives)state.objectives[o.id]=o.initialStatus;
    state.inventory=dictionary();state.executed=dictionary();state.cooldowns=dictionary();state.dialogueFlags=dictionary();
    for(const [id,values]of Object.entries(saved.entities)){const e=entities.get(id);if(!e){warnings.push('Entité supprimée : '+id);continue;}for(const [key,value]of Object.entries(values))if(e.persistentState.includes(key)&&typeof e.initialState[key]===typeof value)state.entities[id][key]=value;else warnings.push('État incompatible : '+id+'.'+key);}
    for(const [id,value]of Object.entries(saved.variables)){const v=data.variables.find(v=>v.id===id);if(v?.persistent&&v.valueType===typeof value)state.variables[id]=value;else warnings.push('Variable incompatible : '+id);}
    for(const [id,count]of Object.entries(saved.inventory)){const item=items.get(id);if(item)state.inventory[id]=Math.min(count,item.maxQuantity);else warnings.push('Objet supprimé : '+id);}
    for(const [id,value]of Object.entries(saved.objectives))if(data.objectives.some(o=>o.id===id&&o.persistent))state.objectives[id]=value;else warnings.push('Objectif supprimé : '+id);
    for(const [id,value]of Object.entries(saved.executed))if(interactions.get(id)?.persistent)state.executed[id]=value;else warnings.push('Interaction supprimée : '+id);
    for(const [id,value]of Object.entries(saved.cooldowns))if(interactions.get(id)?.persistent)state.cooldowns[id]=value;
    for(const pending of saved.pending){const i=interactions.get(pending.interactionId);if(i?.persistent&&pending.cursor<=i.sequence.length)jobs.push({interactionId:i.id,sequence:i.sequence,cursor:pending.cursor,wakeAt:pending.wakeAt,depth:0});else warnings.push('Séquence interrompue : '+pending.interactionId);}
    const flagKeys=new Set(data.dialogues.flatMap(d=>d.lines.flatMap(l=>l.choices.flatMap(c=>[c.condition?.flag,c.action?.flag].filter((f):f is string=>!!f).map(f=>JSON.stringify([d.id,f]))))));
    for(const [key,value] of Object.entries(saved.dialogueFlags))if(flagKeys.has(key))state.dialogueFlags[key]=value;else warnings.push('Choix de dialogue supprimé : '+key);
    for(const timer of timers)timer.next=state.time+timer.trigger.interval;
    return warnings;
  }
  return {data,state,clock,climate,getEntityPosition(id:string){return entities.get(id)?.position;},emit,update,interact,evaluate,setEntityPosition(id:string,position:Point3){const entity=entities.get(id);if(!entity||!finite(position.x,-100000,100000)||!finite(position.y,-10000,10000)||!finite(position.z,-100000,100000))throw Error('Position logique invalide');entity.position={...position};},dialogueChoice,enterDialogueLine,availableChoices,save,restore,drainEffects(){return effects.splice(0);},get pendingSequences(){return jobs.length;}};
}
export type GameplayRuntime=ReturnType<typeof createGameplay>;
