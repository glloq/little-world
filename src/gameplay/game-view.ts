import {accessibleShop} from './shop-access.ts';
import {createResidentDoorOpenings} from './resident-door-openings.ts';
import {createResidentNavigationRevisionTracker} from '../npc-life/navigation-revision.ts';
import {InteractionNeighborhood} from './interaction-neighborhood.ts';
import type * as THREE from 'three';
import type {NPCState} from '../npc.ts';
import {WorldCollisionQuery} from '../physics/collision-world.ts';
import {naturalColliderOwner} from '../structures/natural-collision.ts';
import type {CollisionDefinition} from '../physics/definitions.ts';
import {terrainHeight,waterSurface} from '../terrain.ts';
import {createGameplay} from './runtime.ts';
import {GAS} from '../physics/gas-propulsion.ts';
import {newFlightProgress,type FlightProgress} from './flight-progress.ts';
import {gameplayDialogueSession} from './dialogue-session.ts';
import {createGameSaveStore,scopedSaveStorage,parseGameSave,type GameSaveV2} from './save.ts';
import {createActivityRuntime} from './activity-runtime.ts';
import {COIN,STARTING_COINS,STARTING_KIT,type ShopKind} from './economy.ts';
import {PRODUCTION_ITEMS} from '../economy/starter-catalog.ts';
import {MINE_ITEMS} from '../mine/mine-data.ts';
import {INSTRUMENT_ITEMS} from '../instruments/definitions.ts';
import {SURF_ITEMS,SURFBOARD_ID} from '../surf/surf-items.ts';
import {emptyPlayerLoadout,parsePlayerLoadout,EQUIPMENT_FAVOURITE_COUNT} from './player-loadout.ts';
import {FARM_ITEMS} from '../farm/farm-data.ts';
import {createShopWorkshops} from '../economy/workshop-services.ts';
import {createIslandMarkets} from '../economy/island-markets.ts';
import {createTreeColliders} from './tree-colliders.ts';
import {createGathering,createFishing,type GatherDeps} from './gathering.ts';
import type {PlayableActivities} from './activities.ts';
import type {MovementSpace} from '../physics/collision-world.ts';
import type {GameplayData,GameplayEntity,Point3} from './schema.ts';
import type {SurfBoardPlacement} from '../surf/board-placement.ts';

interface Options {surfStarter?:boolean;islandId?:string;gathering?:Omit<GatherDeps,'time'|'grant'|'has'>;onSound?:(id:string,position?:{x:number;y:number;z:number})=>void;collisions?:CollisionDefinition[];temporary:boolean;saveScope?:string;getPosition:()=>Point3;setPosition:(p:Point3,space?:MovementSpace|null)=>void;activities?:PlayableActivities;getSpace?:()=>MovementSpace|undefined;getGas?:()=>number;setGas?:(value:number,satiety?:number,recharge?:number)=>void;getSatiety?:()=>number;getRechargeProgress?:()=>number;getSurfBoard?:()=>SurfBoardPlacement|null;setSurfBoard?:(board:SurfBoardPlacement|null)=>void;getGasProgress?:()=>FlightProgress;setGasProgress?:(value:FlightProgress)=>void;showInfo:(text:string)=>void;objects:THREE.Group;onNpcMoveTo?:(id:string,position:Point3)=>boolean;onNpcStartDialogue?:(id:string)=>boolean}
/** Interactive object near the player, usable or not (the reason comes from the runtime state). */
export interface ObjectTarget {entity:GameplayEntity;name:string;prompt:string;range:number;usable:boolean;reason?:string;distance:number}
/** Gameplay controller of a playable world: logical runtime, collisions, activities, save
 * composition. Presentation (panels, prompts, notifications) lives in `src/ui`; every change of
 * state goes through the runtime methods, which validate it. */
export function createGameplayView(data:GameplayData,options:Options){
 // Register stable crafted product definitions in the gameplay runtime of old and new maps.
 // The compiled world/Studio source stays immutable: crafting uses the same inventory authority.
 const existing=new Set(data.items.map(i=>i.id));
 const sharedItems=[...MINE_ITEMS,...FARM_ITEMS,...PRODUCTION_ITEMS,...INSTRUMENT_ITEMS,...SURF_ITEMS];
 const runtime=createGameplay({...data,items:[...data.items,...sharedItems.filter(i=>!existing.has(i.id))]}),
   slots=createGameSaveStore(options.temporary?scopedSaveStorage(sessionStorage,options.saveScope??'test'):undefined);
 const collisionDefinitions=new Map((options.collisions??[]).map(d=>[d.id,d]));
 // Transient resident door openings are never serialized into the player's save.
 const npcDoors=createResidentDoorOpenings(()=>runtime.state.time);
 const npcDoorOpen=(id:string)=>npcDoors.isOpen(id);
 const collision=new WorldCollisionQuery(terrainHeight,waterSurface);for(const definition of options.collisions??[]){const height=terrainHeight(definition.groundAnchor.x,definition.groundAnchor.z);collision.add({...definition,position:{...definition.position,y:definition.position.y+height},enabled:()=>{const state=runtime.state.entities[definition.ownerId??naturalColliderOwner(definition.id)];return state?.open!==true&&!npcDoorOpen(definition.ownerId??naturalColliderOwner(definition.id))&&state?.collected!==true;}});}
 const has=(itemId:string)=>(runtime.state.inventory[itemId]??0)>0;
 const activities=createActivityRuntime(options.activities??{mines:[],farms:[]},{grant:changes=>runtime.grantItems(changes),has,seedItem:cropId=>runtime.data.items.some(i=>i.id==='seed:'+cropId)?'seed:'+cropId:null,time:()=>runtime.state.time,climate:runtime.climate,collision,ground:terrainHeight,water:waterSurface});
 /** Core gameplay state + active space + activity differences, in one versioned save. */
 // Economy: a new game starts with a small purse (restored saves replace the whole inventory).
 if(runtime.data.items.some(i=>i.id===COIN))runtime.grantItems([{itemId:COIN,quantity:STARTING_COINS},...STARTING_KIT.filter(k=>runtime.data.items.some(i=>i.id===k.itemId))]);
 // Accessible free starter on surf-capable islands. Restore overwrites this grant for saved games.
 if(options.surfStarter&&runtime.data.items.some(i=>i.id===SURFBOARD_ID))runtime.grantItems([{itemId:SURFBOARD_ID,quantity:1}]);
 // Gathering (trees, fruits, mushrooms, flowers) on the procedural dressing of generated worlds.
 const gathering=options.gathering?createGathering({...options.gathering,time:()=>runtime.state.time,grant:changes=>runtime.grantItems(changes),has}):null;
 const trees=gathering?createTreeColliders({collision,cell:gathering.cell,hidden:gathering.hiddenAt}):null;
 const fishing=createFishing();
 const purse={count:(id:string)=>runtime.state.inventory[id]??0,max:(id:string)=>runtime.data.items.find(i=>i.id===id)?.maxQuantity??0,apply:(changes:{itemId:string;quantity:number}[])=>runtime.grantItems(changes)};
 const itemName=(id:string)=>runtime.data.items.find(i=>i.id===id)?.name??id;
 const listeners=new Set<()=>void>();
 const canEquip=(id:string)=>id!=='tool:miners-helmet'&&has(id)&&runtime.data.items.some(item=>item.id===id&&['tool','outil','instrument'].includes(item.category));
 const canFavourite=(id:string)=>runtime.data.items.some(item=>item.id===id&&(item.id==='tool:miners-helmet'||['tool','outil','instrument','accessory','equipment','cosmetic'].includes(item.category)));
 let playerLoadout=emptyPlayerLoadout();
 const equipment={
  get hands(){return equippedHands&&canEquip(equippedHands)?equippedHands:null;},
  setHands(id:string|null):boolean{
   if(id!==null&&!canEquip(id))return false;
   if(equippedHands===id)return true;
   equippedHands=id;for(const listener of listeners)listener();return true;
  },
  get head(){return playerLoadout.head==='tool:miners-helmet'&&has(playerLoadout.head)?playerLoadout.head:null;},
  setHead(id:string|null):boolean{
   if(id!==null&&(id!=='tool:miners-helmet'||!has(id)))return false;
   if(playerLoadout.head===id)return true;
   playerLoadout.head=id;for(const listener of listeners)listener();return true;
  },
  /** null means legacy/new save: the bag seeds defaults only once on first opening. */
  get favorites():readonly (string|null)[]|null{return playerLoadout.favorites?.slice()??null;},
  setFavorites(next:readonly (string|null)[]):boolean{
   if(next.length!==EQUIPMENT_FAVOURITE_COUNT||!next.every(id=>id===null||canFavourite(id)))return false;
   const ids=next.filter((id):id is string=>id!==null);
   if(new Set(ids).size!==ids.length)return false;
   if(JSON.stringify(playerLoadout.favorites)===JSON.stringify(next))return true;
   playerLoadout.favorites=[...next];for(const listener of listeners)listener();return true;
  },
 };
 let cargoPurchaseRevision=0;
 const workshops=createShopWorkshops({items:runtime.data.items,purse,
   elapsedSeconds:()=>runtime.state.time,dayLengthSeconds:runtime.climate.definition.dayLengthSeconds,
   onChange:()=>{for(const listener of listeners)listener();}});
 const markets=createIslandMarkets({islandId:options.islandId??data.worldId,purse,itemName,
   gameMinute:()=>Math.floor(runtime.state.time/runtime.climate.definition.dayLengthSeconds*1440),
   onChange:()=>{for(const listener of listeners)listener();}});
 /** Legacy type-only trade calls still route to a single deterministic counter identifier. */
 function trade(kind:ShopKind,itemId:string,quantity:number,mode:'buy'|'sell',
   counterId?:string,expectedRevision?:number){
   const authored=counterId?runtime.data.entities.find(e=>e.id===counterId&&e.shopAccess):undefined;
   const access=authored?accessibleShop(authored,options.getPosition(),collision):null;
   if(authored?access?.kind!==kind:!counterId&&!nearbyShop(options.getPosition(),undefined,kind))return {ok:false as const,reason:'Rejoignez le côté d’usage du comptoir.'};
   return markets.trade(kind,counterId??'legacy:'+kind,itemId,quantity,mode,undefined,expectedRevision);
 }
 function sellBatch(kind:ShopKind,lines:readonly {itemId:string;quantity:number}[],
   counterId?:string,expectedRevision?:number){
   const authored=counterId?runtime.data.entities.find(e=>e.id===counterId&&e.shopAccess):undefined;
   const access=authored?accessibleShop(authored,options.getPosition(),collision):null;
   if(authored?access?.kind!==kind:!counterId&&!nearbyShop(options.getPosition(),undefined,kind))
     return {ok:false as const,reason:'Rejoignez le côté d’usage du comptoir.'};
   return markets.sellBatch(kind,counterId??'legacy:'+kind,lines,undefined,expectedRevision);
 }
 let equippedHands:string|null=null;
 const compose=(slotId:string):GameSaveV2=>({...runtime.save(slotId,options.getPosition()),equippedItemId:equipment.hands,loadout:{...playerLoadout,head:equipment.head,favorites:equipment.favorites?[...equipment.favorites]:null},space:options.getSpace?.()??null,gasReserve:options.getGas?.()??GAS.initial,satiety:options.getSatiety?.()??100,boostRechargeProgress:options.getRechargeProgress?.()??0,flightProgress:options.getGasProgress?.()??newFlightProgress(),...activities.serialize(),
    workshops:workshops.serialize(),markets:markets.serialize(),cargoPurchaseRevision,surfBoard:options.getSurfBoard?.()??null,
    ...(gathering?{gathering:gathering.serialize()}:{})});
 let npcs:readonly NPCState[]=[],version=-1,disposed=false;
 // Increment only on actual exterior-door collision transitions, not on every
 // UI/inventory refresh. Scripted NPC routes use it to invalidate lookahead.
 const navigationRevisions=createResidentNavigationRevisionTracker();
 const entityIds=new Set(runtime.data.entities.map(e=>e.id)),targets=runtime.data.entities.filter(e=>e.interactable),interactions=new Map<string,typeof runtime.data.interactions>();
 for(const i of runtime.data.interactions)if(i.trigger.type==='onInteract'){const list=interactions.get(i.trigger.entityId)??[];list.push(i);interactions.set(i.trigger.entityId,list);}
 const targetIndex=new InteractionNeighborhood(),targetById=new Map(targets.map(e=>[e.id,e]));
 const models=new Map(options.objects.children.filter(m=>m.userData.placementId).map(m=>[m.userData.placementId as string,{object:m,rotation:m.rotation.y}]));
 // Data positions are terrain-relative author coordinates. Runtime queries use actual Y.
 for(const entity of runtime.data.entities)if(entity.position)runtime.setEntityPosition(entity.id,{...entity.position,y:terrainHeight(entity.position.x,entity.position.z)+entity.position.y});
 const shopIndex=new InteractionNeighborhood(),shopTargets=new Map(runtime.data.entities.filter(e=>typeof e.initialState.shop==='string').map(e=>[e.id,e]));
 for(const entity of targets)if(entity.position)targetIndex.set(entity.id,entity.position);for(const e of shopTargets.values())if(e.position)shopIndex.set(e.id,{x:e.position.x+(e.shopAccess?.offset.x??0),z:e.position.z+(e.shopAccess?.offset.z??0)});
 function nearbyShop(position:Point3,facing?:{x:number;z:number},kind?:ShopKind){let best:ReturnType<typeof accessibleShop>=null;for(const id of shopIndex.nearby(position,8)){const e=shopTargets.get(id);if(!e||runtime.state.entities[id]?.collected===true)continue;const target=accessibleShop(e,position,collision,facing);if(target&&(!kind||target.kind===kind)&&(!best||target.distance<best.distance))best=target;}return best;}
 function sync(){
  for(const [id,model] of models){const state=runtime.state.entities[id];if(!state)continue;
   model.object.visible=state.collected!==true;
   const open=state.open===true||npcDoorOpen(id),hinge=model.object.getObjectByName('DoorHinge');
   if(hinge||id.endsWith('-door')){
     navigationRevisions.observe(id,open);
   }
   if(hinge){model.object.rotation.y=model.rotation;hinge.rotation.y=open?Math.PI/2:0;}
   else model.object.rotation.y=model.rotation+(open?Math.PI/2:0);
  }
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
  for(const id of targetIndex.nearby(position)){const entity=targetById.get(id);if(!entity?.interactable||!entity.position||runtime.state.entities[entity.id]?.collected===true)continue;
   const d=Math.hypot(position.x-entity.position.x,position.y-entity.position.y,position.z-entity.position.z);if(d>entity.interactable.range||(best&&d>=best.distance))continue;
   if(collision.occluded({...position,y:position.y+1.2},{...entity.position,y:entity.position.y+1.2},[entity.id]))continue;
   const reason=reasonFor(entity.id);best={entity,name:entity.name??entity.interactable.prompt,prompt:entity.interactable.prompt,range:entity.interactable.range,usable:!reason,reason,distance:d};
  }
  return best;
 }
 sync();
 return {
  runtime,collision,activities,slots,compose,gathering,trees,fishing,trade,sellBatch,nearbyShop,workshops,markets,purse,itemName,has,equipment,
  get navigationRevision(){return navigationRevisions.revision;},
  openDoorForNPC(doorId:string,duration=2):boolean{
   if(!runtime.state.entities[doorId]||!models.has(doorId)||!Number.isFinite(duration)||duration<=0||duration>5)return false;
   if(npcDoors.request(doorId,duration))sync();
   return true;
  },
  get cargoPurchaseRevision(){return cargoPurchaseRevision;},
  acknowledgeCargoPurchase(revision:number){
    if(!Number.isSafeInteger(revision)||revision<0||revision>1_000_000_000)
      throw Error('Révision import invalide');
    cargoPurchaseRevision=Math.max(cargoPurchaseRevision,revision);
  },
  /** Restores a validated save into the runtime and the activities; returns the warnings. */
  restore(save:GameSaveV2){npcDoors.clear();const warnings=[...runtime.restore(save),...activities.restore(save)];
    // Upgrade old island saves with one temporary starter board, without removing other goods.
    if(options.surfStarter&&!has(SURFBOARD_ID))runtime.grantItems([{itemId:SURFBOARD_ID,quantity:1}]);
    equippedHands=save.equippedItemId&&canEquip(save.equippedItemId)?save.equippedItemId:null;playerLoadout=save.loadout?parsePlayerLoadout(save.loadout):emptyPlayerLoadout();if(playerLoadout.head!=='tool:miners-helmet'||!has('tool:miners-helmet'))playerLoadout.head=null;playerLoadout.back=null;playerLoadout.feet=null;workshops.restore(save.workshops??{});markets.restore(save.markets??{});cargoPurchaseRevision=save.cargoPurchaseRevision??0;gathering?.restore(save.gathering??null);options.setPosition(save.position,save.space??null);options.setGasProgress?.(save.flightProgress??newFlightProgress());options.setGas?.(save.gasReserve??GAS.legacyInitial,save.satiety,save.boostRechargeProgress);options.setSurfBoard?.(save.surfBoard??null);sync();version=-1;for(const l of listeners)l();return warnings;},
  /** Imports an exported slot file (validated) into a free slot of this world. */
  async importSave(raw:unknown){const parsed=parseGameSave(raw);if(parsed.worldId!==data.worldId)throw Error('Sauvegarde d’un autre monde');const value={...parsed};if(!['slot-1','slot-2','slot-3'].includes(value.slotId)){const used=new Set((await slots.list(data.worldId)).map(v=>v.slotId)),free=['slot-1','slot-2','slot-3'].find(id=>!used.has(id));if(!free)throw Error('Libérez un emplacement pour importer cette partie');value.slotId=free;}await slots.save(value);return value.slotId;},
  temporary:options.temporary,describe,
  /** Called after any validated state change (inventory, objectives, entity states). */
  subscribe(listener:()=>void){listeners.add(listener);return ()=>listeners.delete(listener);},
  dialogueSession:(state:NPCState)=>gameplayDialogueSession(runtime,state.definition.id),attachNPCs(states:readonly NPCState[]){npcs=states;},
  prompt(position:Point3){runtime.state.playerPosition={...position};const target=describe(position);return target?.usable?'[E] '+target.prompt:null;},
  interact(position:Point3){runtime.state.playerPosition={...position};const target=describe(position);return target?.usable?runtime.interact(target.entity.id,position):false;},
  update(dt:number){
   if(disposed)return;runtime.state.playerPosition={...options.getPosition()};for(const npc of npcs)if(entityIds.has(npc.definition.id)){runtime.setEntityPosition(npc.definition.id,{x:npc.x,y:npc.y,z:npc.z});if(targetById.has(npc.definition.id))targetIndex.set(npc.definition.id,{x:npc.x,z:npc.z});const body=collisionDefinitions.get(npc.definition.id);if(body)collision.moveBody(body.id,{x:npc.x+body.position.x-body.groundAnchor.x,y:npc.y+body.position.y,z:npc.z+body.position.z-body.groundAnchor.z});}
   runtime.update(dt);
   if(npcDoors.expire())sync();
   workshops.advanceDue();for(const effect of runtime.drainEffects()){
    if(effect.type==='showText')options.showInfo(effect.text);
    else if(effect.type==='playSound')options.onSound?.(effect.soundId,effect.entityId?runtime.data.entities.find(e=>e.id===effect.entityId)?.position:undefined);
    else if(effect.type==='startDialogue'){
      const actor=effect.entityId??runtime.data.dialogues.find(d=>d.id===effect.dialogueId)?.actorId;
      if(!actor||!options.onNpcStartDialogue?.(actor))
        options.showInfo('Le personnage doit être à portée pour démarrer la conversation.');
    }
    else if(effect.type==='moveNPCTo'){
      if(!options.onNpcMoveTo?.(effect.entityId,effect.position))
        options.showInfo('Le trajet du personnage est inaccessible ou indisponible.');
    }
    else options.showInfo('Effet de présentation non pris en charge : '+effect.type);
   }
   if(runtime.state.metrics.actions!==version){version=runtime.state.metrics.actions;sync();for(const l of listeners)l();}
   const diagnostic=runtime.state.diagnostics.splice(0);if(diagnostic.length)options.showInfo(diagnostic.at(-1)!);
  },dispose(){disposed=true;listeners.clear();}
 };
}
export type GameplayView=ReturnType<typeof createGameplayView>;
