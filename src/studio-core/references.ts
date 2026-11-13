import type { ComponentMap, Diagnostic, EntityDefinitionV3, EntityIndexEntry, ProjectDocument, StableId } from './types.ts';
import { parseComponents, validateOverrides } from './schema.ts';
import { gameplayReferences } from '../gameplay/schema.ts';
export interface ReferenceEntry {id:string;kind:string;ownerChunkId:string|'global';locator:string;}
export interface ReferenceResolution {state:'missing'|'unloaded'|'loaded';entry?:ReferenceEntry;}
export function collectEntityReferences(entity:EntityDefinitionV3):string[]{
  const c=entity.components;return [...new Set([
    ...(entity.parentId?[entity.parentId]:[]),...(entity.prefabId?[entity.prefabId]:[]),
    ...(c.Visual?[c.Visual.assetId]:[]),...(c.Navigation?[c.Navigation.behaviorId]:[]),...(c.BehaviorRef?[c.BehaviorRef.behaviorId]:[]),
    ...(c.DialogueActor?.dialogueIds??[]),...(c.Interactable?.interactionIds??[]),...(c.TriggerVolume?.interactionIds??[]),
  ])];
}
function applyOverrides(components:ComponentMap,overrides:EntityDefinitionV3['overrides']):void{
  if(!overrides)return;validateOverrides(overrides);
  for(const override of overrides){
    let target=components[override.component] as unknown as Record<string,unknown>|undefined;
    if(!target)throw Error(`Override : composant absent ${override.component}`);
    const parts=override.field.split('.');
    for(const part of parts.slice(0,-1)){
      const next=target[part];if(typeof next!=='object'||next===null||Array.isArray(next))throw Error(`Override : champ absent ${override.field}`);target=next as Record<string,unknown>;
    }
    target[parts.at(-1)!]=structuredClone(override.value);
  }
}
/** Base prefab → named variant → complete instance components → whitelisted field overrides. */
export function resolveEntity(project:ProjectDocument,entity:EntityDefinitionV3):EntityDefinitionV3{
  let components:ComponentMap={};
  if(entity.prefabId){
    const prefab=project.libraries.prefabs[entity.prefabId];if(!prefab)throw Error(`Prefab absent : ${entity.prefabId}`);components=structuredClone(prefab.components);
    if(entity.variantId){const variant=prefab.variants?.[entity.variantId];if(!variant)throw Error(`Variante absente : ${entity.variantId}`);applyOverrides(components,variant);}
  }else if(entity.variantId)throw Error('Variante sans prefab');
  components={...components,...structuredClone(entity.components)};applyOverrides(components,entity.overrides);
  components=parseComponents(components,project.world);if(!components.Transform)throw Error('Transform résolu absent');
  return {...structuredClone(entity),components};
}
export function entityIndexEntry(entity:EntityDefinitionV3):EntityIndexEntry{
  const c=entity.components,position=c.Transform?.position;if(!position)throw Error('Position entité absente');
  return {id:entity.id,kind:entity.kind,name:entity.name,ownerChunkId:entity.ownerChunkId,position:{...position},references:collectEntityReferences(entity),
    logical:{position:{...position},initialState:structuredClone(c.State?.initial??{}),persistentState:[...(c.Persistence?.fields??[])],...(c.Interactable?{interactable:{prompt:c.Interactable.prompt,range:c.Interactable.range,interactionIds:[...c.Interactable.interactionIds]}}:{})}};
}
/** Lightweight global registry. Loaded state is independent of logical existence. */
export class ReferenceIndex {
  private entries=new Map<string,ReferenceEntry>();
  private edges=new Map<string,Set<string>>();
  private reverse=new Map<string,Set<string>>();
  private conflicts:string[]=[];
  private loaded=new Set<string>();
  private project:ProjectDocument;
  constructor(project:ProjectDocument){this.project=project;this.rebuild();}
  private add(entry:ReferenceEntry,loaded:boolean):void{
    const previous=this.entries.get(entry.id);
    if(previous&&(previous.kind!==entry.kind||previous.ownerChunkId!==entry.ownerChunkId||previous.locator!==entry.locator)){this.conflicts.push(entry.id);return;}
    this.entries.set(entry.id,entry);if(loaded)this.loaded.add(entry.id);
  }
  private link(source:string,target:string):void{let set=this.edges.get(source);if(!set){set=new Set();this.edges.set(source,set);}set.add(target);let reverse=this.reverse.get(target);if(!reverse){reverse=new Set();this.reverse.set(target,reverse);}reverse.add(source);}
  rebuild():void{
    this.entries.clear();this.edges.clear();this.reverse.clear();this.loaded.clear();this.conflicts=[];const p=this.project;
    for(const entry of Object.values(p.entityIndex)){
      this.add({id:entry.id,kind:'entity',ownerChunkId:entry.ownerChunkId,locator:`entities/${entry.id}`},!!p.chunks[entry.ownerChunkId]?.entities[entry.id]);
      for(const target of entry.references)this.link(entry.id,target);
    }
    for(const [name,library]of Object.entries(p.libraries))for(const [id,value]of Object.entries(library)){
      this.add({id,kind:name,ownerChunkId:'global',locator:`library/${name}/${id}`},true);
      if(name==='dialogues'&&(value as {actorId?:string}).actorId)this.link(id,(value as {actorId:string}).actorId);
      if(name==='prefabs'){const components=(value as {components:ComponentMap}).components;if(components.Visual)this.link(id,components.Visual.assetId);}
    }
    for(const asset of Object.values(p.assets))this.add({id:asset.id,kind:'asset',ownerChunkId:'global',locator:`assets/${asset.id}`},true);
    for(const meta of Object.values(p.chunkIndex))for(const [field,kind]of [['terrainOwners','terrainEdit'],['biomeOwners','biomeEdit']] as const)for(const [id,owner]of Object.entries(meta[field]??{}))this.add({id,kind,ownerChunkId:owner,locator:`${kind}/${id}`},!!p.chunks[owner]);
    for(const chunk of Object.values(p.chunks)){
      for(const [field,kind]of [['terrainEdits','terrainEdit'],['biomeEdits','biomeEdit']] as const)for(const edit of chunk[field])this.add({id:edit.id,kind,ownerChunkId:chunk.chunkId,locator:`${kind}/${edit.id}`},true);
      for(const entity of Object.values(chunk.entities))for(const target of collectEntityReferences(entity))this.link(entity.id,target);
    }
    for(const edge of gameplayReferences(p.libraries))this.link(edge.sourceId,edge.targetId);
  }
  get(id:StableId):ReferenceResolution{const entry=this.entries.get(id);return entry?{state:this.loaded.has(id)?'loaded':'unloaded',entry}:{state:'missing'};}
  outgoing(id:StableId):string[]{return [...(this.edges.get(id)??[])];}
  dependents(id:StableId):string[]{return [...(this.reverse.get(id)??[])];}
  diagnostics():Diagnostic[]{
    const errors:Diagnostic[]=this.conflicts.map(id=>({severity:'ERROR',code:'duplicate-id',message:`Identifiant global dupliqué : ${id}`,id}));
    for(const [source,targets]of this.edges)for(const target of targets)if(!this.entries.has(target))errors.push({severity:'ERROR',code:'missing-reference',message:`${source} référence un identifiant absent : ${target}`,id:source,chunkId:this.entries.get(source)?.ownerChunkId,module:'validation'});
    return errors;
  }
}
