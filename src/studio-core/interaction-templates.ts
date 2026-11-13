/** Declarative interaction templates applied to an authoring entity (collect, deliver, door,
 * lever). One shared implementation for the Interactions panel and the inspector; runs inside
 * one StudioSession.change (one undoable transaction). No arbitrary code is produced. */
import {audioSoundIds} from '../audio/migrate.ts';
import {resolveEntity} from './references.ts';
import {putEntity} from './source.ts';
import {makeCollect,makeDeliver,makeDoor,makeLever} from '../gameplay/templates.ts';
import {gameplayDataFromProject} from '../gameplay/project-adapter.ts';
import type {EntityDefinitionV3,ProjectDocument} from './types.ts';

export type InteractionKind='collect'|'deliver'|'door'|'lever';
export interface InteractionRequest {entityId:string;kind:InteractionKind;prompt:string;quantity:number;resourceName?:string;itemId?:string;targetId?:string;soundId?:string}
export function validateInteractionRequest(p:ProjectDocument,r:InteractionRequest){
  if(!p.entityIndex[r.entityId])throw Error('Élément introuvable.');
  if(!r.prompt.trim())throw Error('Indiquez un message d’interaction.');
  if(!Number.isInteger(r.quantity)||r.quantity<1||r.quantity>99)throw Error('Quantité entre 1 et 99.');
  if(r.kind==='lever'&&(!r.targetId||r.targetId===r.entityId||!p.entityIndex[r.targetId]))throw Error('Sélectionnez un autre objet.');
  if(r.kind==='deliver'&&!(r.itemId&&p.libraries.items[r.itemId]))throw Error('Créez d’abord une ressource à collecter.');
  if(r.kind==='collect'&&!(r.resourceName??'').trim())throw Error('Nommez la ressource collectée.');
}
/** Sectors to hydrate/clone: the entity's owner and, for a lever, its target's owner. */
export function interactionChunkIds(p:ProjectDocument,r:InteractionRequest):string[]{
  return [...new Set([p.entityIndex[r.entityId].ownerChunkId,...(r.kind==='lever'&&r.targetId?[p.entityIndex[r.targetId].ownerChunkId]:[])])];
}
export function existingInteraction(p:ProjectDocument,entityId:string){
  const index=p.entityIndex[entityId],source=index?p.chunks[index.ownerChunkId]?.entities[entityId]:undefined;if(!source)return undefined;
  const id=resolveEntity(p,source).components.Interactable?.interactionIds[0];return id?p.libraries.interactions[id]:undefined;
}
export function applyInteraction(d:ProjectDocument,r:InteractionRequest):string{
  validateInteractionRequest(d,r);
  const owner=d.entityIndex[r.entityId].ownerChunkId,entity=structuredClone(d.chunks[owner].entities[r.entityId]),resolved=resolveEntity(d,entity);
  const id=resolved.components.Interactable?.interactionIds[0]??'interaction:'+r.entityId,existing=d.libraries.interactions[id];
  const state=(target:EntityDefinitionV3,values:Record<string,boolean>)=>{const res=resolveEntity(d,target);target.components.State={type:'State',initial:{...res.components.State?.initial,...values}};target.components.Persistence={type:'Persistence',fields:[...new Set([...(res.components.Persistence?.fields??[]),...Object.keys(values)])]};};
  entity.components.Interactable={type:'Interactable',prompt:r.prompt.trim(),range:4,interactionIds:[...new Set([...(resolved.components.Interactable?.interactionIds??[]),id])]};
  let interaction;
  if(r.kind==='collect'){
    const previous=existing?.sequence.flatMap(a=>a.type==='giveItem'?[a.itemId]:[])[0],resource=previous??'item:'+r.entityId;
    d.libraries.items={...d.libraries.items,[resource]:{id:resource,name:r.resourceName!.trim(),category:'nature',maxQuantity:99}};state(entity,{collected:false});interaction=makeCollect(id,r.entityId,resource,r.quantity);
  }else if(r.kind==='deliver'){
    const objectiveId='objective:delivery:'+r.entityId;d.libraries.objectives={...d.libraries.objectives,[objectiveId]:{id:objectiveId,name:'Livrer '+r.quantity+' '+d.libraries.items[r.itemId!].name,initialStatus:'active',persistent:true}};interaction=makeDeliver(id,r.entityId,r.itemId!,objectiveId,r.quantity);
  }else if(r.kind==='door'){entity.components.Collider??={type:'Collider',shape:'box',size:{x:2,y:2,z:2},layer:'solid'};state(entity,{open:false});interaction=makeDoor(id,r.entityId);}
  else{const target=d.entityIndex[r.targetId!],destination=structuredClone(d.chunks[target.ownerChunkId].entities[r.targetId!]);destination.components.Collider??={type:'Collider',shape:'box',size:{x:2,y:2,z:2},layer:'solid'};state(destination,{open:false});putEntity(d,destination);state(entity,{active:false});interaction=makeLever(id,r.entityId,r.targetId!);}
  if(r.soundId&&audioSoundIds(d.world.audio).includes(r.soundId))interaction.sequence.push({type:'playSound',soundId:r.soundId});
  d.libraries.interactions={...d.libraries.interactions,[id]:interaction};putEntity(d,entity);
  // Validate complete logical references using the lightweight index, including unloaded sources.
  gameplayDataFromProject(d);
  return id;
}
