import type * as THREE from 'three';
import type {NPCState} from '../npc.ts';
import {WorldCollisionQuery} from '../physics/collision-world.ts';
import type {CollisionDefinition} from '../physics/definitions.ts';
import {terrainHeight,waterSurface} from '../terrain.ts';
import {createGameplay} from './runtime.ts';
import {gameplayDialogueSession} from './dialogue-session.ts';
import {createGameSaveStore,scopedSaveStorage,parseGameSave,type GameSaveV2} from './save.ts';
import {createActivityRuntime} from './activity-runtime.ts';
import {COIN,STARTING_COINS,STARTING_KIT,SHOPS,buy,sell,type ShopKind} from './economy.ts';
import {createGathering,createFishing,type GatherDeps} from './gathering.ts';
import type {PlayableActivities} from './activities.ts';
import type {MovementSpace} from '../physics/collision-world.ts';
import type {GameplayData,GameplayEntity,Point3} from './schema.ts';

interface Options {gathering?:Omit<GatherDeps,'time'|'grant'|'has'>;onSound?:(id:string,position?:{x:number;y:number;z:number})=>void;collisions?:CollisionDefinition[];temporary:boolean;saveScope?:string;getPosition:()=>Point3;setPosition:(p:Point3,space?:MovementSpace|null)=>void;activities?:PlayableActivities;getSpace?:()=>MovementSpace|undefined;showInfo:(text:string)=>void;objects:THREE.Group}
/** Interactive object near the player, usable or not (the reason comes from the runtime state). */
export interface ObjectTarget {entity:GameplayEntity;name:string;prompt:string;range:number;usable:boolean;reason?:string;distance:number}
/** Gameplay controller of a playable world: logical runtime, collisions, activities, save
 * composition. Presentation (panels, prompts, notifications) lives in `src/ui`; every change of
 * state goes through the runtime methods, which validate it. */
export function createGameplayView(data:GameplayData,options:Options){
 const runtime=createGameplay(data),slots=createGameSaveStore(options.temporary?scopedSaveStorage(sessionStorage,options.saveScope??'test'):undefined);
 const collisionDefinitions=new Map((options.collisions??[]).map(d=>[d.id,d]));
 const collision=new WorldCollisionQuery(terrainHeight,waterSurface);for(const definition of options.collisions??[]){const height=terrainHeight(definition.groundAnchor.x,definition.groundAnchor.z);collision.add({...definition,position:{...definition.position,y:definition.position.y+height},enabled:()=>{const state=runtime.state.entities[definition.id];return state?.open!==true&&state?.collected!==true;}});}
 const has=(itemId:string)=>(runtime.state.inventory[itemId]??0)>0;
 const activities=createActivityRuntime(options.activities??{mines:[],farms:[]},{grant:changes=>runtime.grantItems(changes),has,seedItem:cropId=>runtime.data.items.some(i=>i.id==='seed:'+cropId)?'seed:'+cropId:null,time:()=>runtime.state.time,climate:runtime.climate,collision,ground:terrainHeight,water:waterSurface});
 /** Core gameplay state + active space + activity differences, in one versioned save. */
 // Economy: a new game starts with a small purse (restored saves replace the whole inventory).
 if(runtime.data.items.some(i=>i.id===COIN))runtime.grantItems([{itemId:COIN,quantity:STARTING_COINS},...STARTING_KIT.filter(k=>runtime.data.items.some(i=>i.id===k.itemId))]);
 // Gathering (trees, fruits, mushrooms, flowers) on the procedural dressing of generated worlds.
 const gathering=options.gathering?createGathering({...options.gathering,time:()=>runtime.state.time,grant:changes=>runtime.grantItems(changes),has}):null;
 const fishing=createFishing();
 const purse={count:(id:string)=>runtime.state.inventory[id]??0,max:(id:string)=>runtime.data.items.find(i=>i.id===id)?.maxQuantity??0,apply:(changes:{itemId:string;quantity:number}[])=>runtime.grantItems(changes)};
 const itemName=(id:string)=>runtime.data.items.find(i=>i.id===id)?.name??id;
 function trade(kind:ShopKind,itemId:string,quantity:number,mode:'buy'|'sell'){const shop=SHOPS[kind];return mode==='buy'?buy(shop,itemId,quantity,purse,itemName):sell(shop,itemId,quantity,purse,itemName);}
 const compose=(slotId:string):GameSaveV2=>({...runtime.save(slotId,options.getPosition()),space:options.getSpace?.()??null,...activities.serialize(),...(gathering?{gathering:gathering.serialize()}:{})});
 let npcs:readonly NPCState[]=[],version=-1,disposed=false;const listeners=new Set<()=>void>();
 const entityIds=new Set(runtime.data.entities.map(e=>e.id)),targets=runtime.data.entities.filter(e=>e.interactable),interactions=new Map<string,typeof runtime.data.interactions>();
 for(const i of runtime.data.interactions)if(i.trigger.type==='onInteract'){const list=interactions.get(i.trigger.entityId)??[];list.push(i);interactions.set(i.trigger.entityId,list);}
 const models=new Map(options.objects.children.filter(m=>m.userData.placementId).map(m=>[m.userData.placementId as string,{object:m,rotation:m.rotation.y}]));
 // Data positions are terrain-relative author coordinates. Runtime queries use actual Y.
 for(const entity of runtime.data.entities)if(entity.position)runtime.setEntityPosition(entity.id,{...entity.position,y:terrainHeight(entity.position.x,entity.position.z)+entity.position.y});
 function sync(){
  for(const [id,model] of models){const state=runtime.state.entities[id];if(!state)continue;model.object.visible=state.collected!==true;model.object.rotation.y=model.rotation+(state.open===true?Math.PI/2:0);}
 }
 /** Why an interaction cannot run now, read from the runtime state (never guessed by the UI). */
 function reasonFor(entityId:string):string|undefined{
  const list=interactions.get(entityId)??[];if(!list.length)return 'Rien à faire ici pour le moment';
  const open=list.filter(i=>!(i.repeat==='once'&&runtime.state.executed[i.id]));if(!open.length)return 'Déjà utilisé';
  if(open.every(i=>i.repeat==='cooldown'&&runtime.state.time-(runtime.state.cooldowns[i.id]??-Infinity)<(i.cooldown??0)))return 'Patientez un instant';
  if(open.every(i=>i.condition&&!runtime.evaluate(i.condition)))return 'Les conditions ne sont pas encore réunies';
  return undefined;
 }
 function describe(position:Point3):ObjectTarget|null{
  let best:ObjectTarget|null=null;
  for(const entity of targets){if(!entity.interactable||!entity.position||runtime.state.entities[entity.id]?.collected===true)continue;
   const d=Math.hypot(position.x-entity.position.x,position.y-entity.position.y,position.z-entity.position.z);if(d>entity.interactable.range||(best&&d>=best.distance))continue;
   const reason=reasonFor(entity.id);best={entity,name:entity.name??entity.interactable.prompt,prompt:entity.interactable.prompt,range:entity.interactable.range,usable:!reason,reason,distance:d};
  }
  return best;
 }
 sync();
 return {
  runtime,collision,activities,slots,compose,gathering,fishing,trade,purse,itemName,has,
  /** Restores a validated save into the runtime and the activities; returns the warnings. */
  restore(save:GameSaveV2){const warnings=[...runtime.restore(save),...activities.restore(save)];gathering?.restore(save.gathering??null);options.setPosition(save.position,save.space??null);sync();version=-1;for(const l of listeners)l();return warnings;},
  /** Imports an exported slot file (validated) into a free slot of this world. */
  async importSave(raw:unknown){const parsed=parseGameSave(raw);if(parsed.worldId!==data.worldId)throw Error('Sauvegarde d’un autre monde');const value={...parsed};if(!['slot-1','slot-2','slot-3'].includes(value.slotId)){const used=new Set((await slots.list(data.worldId)).map(v=>v.slotId)),free=['slot-1','slot-2','slot-3'].find(id=>!used.has(id));if(!free)throw Error('Libérez un emplacement pour importer cette partie');value.slotId=free;}await slots.save(value);return value.slotId;},
  temporary:options.temporary,describe,
  /** Called after any validated state change (inventory, objectives, entity states). */
  subscribe(listener:()=>void){listeners.add(listener);return ()=>listeners.delete(listener);},
  dialogueSession:(state:NPCState)=>gameplayDialogueSession(runtime,state.definition.id),attachNPCs(states:readonly NPCState[]){npcs=states;},
  prompt(position:Point3){runtime.state.playerPosition={...position};const target=describe(position);return target?.usable?'[E] '+target.prompt:null;},
  interact(position:Point3){runtime.state.playerPosition={...position};const target=describe(position);return target?.usable?runtime.interact(target.entity.id,position):false;},
  update(dt:number){
   if(disposed)return;runtime.state.playerPosition={...options.getPosition()};for(const npc of npcs)if(entityIds.has(npc.definition.id)){runtime.setEntityPosition(npc.definition.id,{x:npc.x,y:npc.y,z:npc.z});const body=collisionDefinitions.get(npc.definition.id);if(body)collision.moveBody(body.id,{x:npc.x+body.position.x-body.groundAnchor.x,y:npc.y+body.position.y,z:npc.z+body.position.z-body.groundAnchor.z});}
   runtime.update(dt);for(const effect of runtime.drainEffects()){
    if(effect.type==='showText')options.showInfo(effect.text);
    else if(effect.type==='playSound')options.onSound?.(effect.soundId,effect.entityId?runtime.data.entities.find(e=>e.id===effect.entityId)?.position:undefined);
    else if(effect.type==='startDialogue')options.showInfo('Approchez du personnage pour ouvrir sa conversation.');
    else options.showInfo('Effet de présentation non pris en charge : '+effect.type);
   }
   if(runtime.state.metrics.actions!==version){version=runtime.state.metrics.actions;sync();for(const l of listeners)l();}
   const diagnostic=runtime.state.diagnostics.splice(0);if(diagnostic.length)options.showInfo(diagnostic.at(-1)!);
  },dispose(){disposed=true;listeners.clear();}
 };
}
export type GameplayView=ReturnType<typeof createGameplayView>;
