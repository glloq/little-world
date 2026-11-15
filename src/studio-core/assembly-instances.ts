/** Editable V3 assembly instances: local visual overrides versus shared prefab defaults. */
import type {ProjectDocument,EntityDefinitionV3} from './types.ts';
import {resolveEntity} from './references.ts';
import {putEntity} from './source.ts';
import {assetDefinitionFor,colliderFor} from '../world-production/registry.ts';
import {assemblyPartPrefabId} from './assemblies.ts';
export function assemblyInstanceRoot(p:ProjectDocument,id:string):string {
  let cursor=id;const visited=new Set<string>();
  while(true){
    if(visited.has(cursor))throw Error('Hiérarchie cyclique');
    visited.add(cursor);
    const entry=p.entityIndex[cursor],source=entry&&p.chunks[entry.ownerChunkId]?.entities[cursor];
    if(!source)throw Error('Charger les secteurs de cette instance');
    if(!source.parentId)return cursor;
    cursor=source.parentId;
  }
}
export function instanceCandidateChunkIds(p:ProjectDocument,id:string):string[]{
  const entry=p.entityIndex[id];if(!entry)return [];
  return [...new Set([entry.ownerChunkId,...Object.values(p.entityIndex).filter(e=>e.references.includes(id)).map(e=>e.ownerChunkId)])];
}
export function instanceMemberIds(p:ProjectDocument,rootId:string):string[]{
  const seen=new Set<string>([rootId]);let grown=true;
  while(grown){grown=false;
    for(const item of Object.values(p.entityIndex)){
      if(seen.has(item.id)||!item.references.some(x=>seen.has(x)))continue;
      const source=p.chunks[item.ownerChunkId]?.entities[item.id];
      if(source?.parentId&&seen.has(source.parentId)){seen.add(item.id);grown=true;}
    }
  }
  return [...seen];
}
export function overrideAssemblyVisual(p:ProjectDocument,entityId:string,assetId:string):void{
  const item=p.entityIndex[entityId],source=item&&p.chunks[item.ownerChunkId]?.entities[entityId];
  if(!source||!source.prefabId?.startsWith('assembly-part:'))throw Error('Sélectionner un membre d’assemblage chargé');
  const asset=p.assets[assetId]??assetDefinitionFor(assetId);
  if(!asset)throw Error('Modèle inconnu : '+assetId);
  if(!p.assets[assetId])p.assets={...p.assets,[assetId]:asset};
  const copy:EntityDefinitionV3=structuredClone(source);
  copy.components.Visual={type:'Visual',assetId};
  const collider=colliderFor(assetId);
  if(collider)copy.components.Collider=collider;
  else delete copy.components.Collider;
  // Local Visual overrides take precedence over shared prefab component defaults.
  if(copy.overrides)copy.overrides=copy.overrides.filter(v=>v.component!=='Visual');
  putEntity(p,copy);
}
export function updateAssemblyTemplateVisual(p:ProjectDocument,entityId:string,assetId:string):void {
  const entry=p.entityIndex[entityId],source=entry&&p.chunks[entry.ownerChunkId]?.entities[entityId];
  if(!source?.prefabId)throw Error('Sélectionner un objet provenant d’un assemblage V2');
  const id=source.prefabId,model=p.libraries.prefabs[id],asset=p.assets[assetId]??assetDefinitionFor(assetId);
  if(!model||!asset)throw Error('Modèle partagé ou asset introuvable');
  if(!p.assets[assetId])p.assets={...p.assets,[assetId]:asset};
  const visual={type:'Visual' as const,assetId},collider=colliderFor(assetId);
  model.components={...model.components,Visual:visual};
  if(collider)model.components.Collider=collider;else delete model.components.Collider;
  model.version++;
  // Keep source palette aligned for future copies while preserving overrides on existing copies.
  for(const assembly of Object.values(p.libraries.assemblies??{})){
    if(assembly.version!==2)continue;
    assembly.items.forEach((part,index)=>{
      if(assemblyPartPrefabId(assembly.id,part.key??'part-'+index)!==id)return;
      part.components.Visual=structuredClone(visual);
      if(collider)part.components.Collider=structuredClone(collider);
      else delete part.components.Collider;
    });
  }
}
export function assemblyVisualOf(p:ProjectDocument,id:string):string {
  const e=p.entityIndex[id],source=e&&p.chunks[e.ownerChunkId]?.entities[id];
  if(!source)throw Error('Secteur manquant');
  return resolveEntity(p,source).components.Visual?.assetId??'';
}
