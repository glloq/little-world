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
/** Candidate sectors from lightweight reference indexes; no whole-world hydration required. */
export function instanceTreeChunkIds(p:ProjectDocument,rootId:string):string[]{
  const seen=new Set([rootId]),ids=new Set<string>(),entries=Object.values(p.entityIndex);
  let changed=true;
  while(changed){
    changed=false;
    for(const entry of entries){
      if(!entry.references.some(id=>seen.has(id))&&!seen.has(entry.id))continue;
      ids.add(entry.ownerChunkId);
      if(!seen.has(entry.id)){seen.add(entry.id);changed=true;}
    }
  }
  return [...ids];
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
/** Change only this instance's hierarchy. World-space transforms remain unchanged.
 * Parent and child must belong to the same placed assembly, and cycles are rejected. */
export function setInstanceParent(p:ProjectDocument,childId:string,parentId:string):void{
  if(childId===parentId)throw Error('Un élément ne peut pas être son propre parent');
  const childEntry=p.entityIndex[childId],parentEntry=p.entityIndex[parentId];
  const child=childEntry&&p.chunks[childEntry.ownerChunkId]?.entities[childId];
  const parent=parentEntry&&p.chunks[parentEntry.ownerChunkId]?.entities[parentId];
  if(!child?.prefabId||!parent?.prefabId||!child.prefabId.startsWith('assembly-part:')||!parent.prefabId.startsWith('assembly-part:'))
    throw Error('Les deux objets doivent appartenir à un assemblage chargé');
  const root=assemblyInstanceRoot(p,childId);
  if(assemblyInstanceRoot(p,parentId)!==root)throw Error('Le parent choisi appartient à une autre instance');
  let cursor=parentId;
  for(let i=0;i<100;i++){
    if(cursor===childId)throw Error('Cette modification créerait une boucle de parenté');
    const index=p.entityIndex[cursor],source=index&&p.chunks[index.ownerChunkId]?.entities[cursor];
    if(!source)throw Error('Charger les secteurs parents');
    if(!source.parentId)break;
    cursor=source.parentId;
  }
  putEntity(p,{...structuredClone(child),parentId});
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
  else if(copy.prefabId&&p.libraries.prefabs[copy.prefabId]?.components.Collider){
    // A null collider cannot override an inherited prefab Collider in V3.
    // Detach this one instance to avoid retaining an invisible solid obstacle.
    copy.components=resolveEntity(p,source).components;copy.components.Visual={type:'Visual',assetId};
    delete copy.components.Collider;delete copy.prefabId;delete copy.variantId;delete copy.overrides;
  }else delete copy.components.Collider;
  // Local Visual overrides take precedence over shared prefab component defaults.
  if(copy.overrides)copy.overrides=copy.overrides.filter(v=>v.component!=='Visual');
  putEntity(p,copy);
}
export function updateAssemblyTemplateVisual(p:ProjectDocument,entityId:string,assetId:string):void {
  const entry=p.entityIndex[entityId],source=entry&&p.chunks[entry.ownerChunkId]?.entities[entityId];
  if(!source?.prefabId)throw Error('Sélectionner un objet provenant d’un assemblage V2');
  const id=source.prefabId,model=p.libraries.prefabs[id],asset=p.assets[assetId]??assetDefinitionFor(assetId);
  const affected=Object.values(p.entityIndex).filter(e=>e.references.includes(id));
  for(const e of affected)if(!p.chunks[e.ownerChunkId]?.entities[e.id])throw Error('Charger tous les secteurs contenant une instance avant modification du modèle');
  if(!model||!asset)throw Error('Modèle partagé ou asset introuvable');
  if(!p.assets[assetId])p.assets={...p.assets,[assetId]:asset};
  const visual={type:'Visual' as const,assetId},collider=colliderFor(assetId);
  // editDocument() copies the libraries container, not every nested prefab.
  // Never mutate the shared original: changes must be expressed as CommandBus patches.
  const components={...model.components,Visual:visual};
  if(collider)components.Collider=collider;
  else delete components.Collider;
  p.libraries.prefabs={...p.libraries.prefabs,[id]:{...model,components,version:model.version+1}};
  // Reindex each hydrated instance against the new shared template; local overrides win.
  for(const e of affected)putEntity(p,p.chunks[e.ownerChunkId].entities[e.id]);
  // Likewise, copy only affected assembly definitions and their part arrays.
  // Mutating an existing assembly.items in place would leak into the source and break Undo.
  let assemblies=p.libraries.assemblies;
  for(const [assemblyId,assembly] of Object.entries(p.libraries.assemblies??{})){
    if(assembly.version!==2)continue;
    const items=assembly.items.map((part,index)=>{
      if(assemblyPartPrefabId(assembly.id,part.key??'part-'+index)!==id)return part;
      const partComponents={...part.components,Visual:structuredClone(visual)};
      if(collider)partComponents.Collider=structuredClone(collider);
      else delete partComponents.Collider;
      return {...part,components:partComponents};
    });
    if(items.every((part,index)=>part===assembly.items[index]))continue;
    assemblies={...assemblies,[assemblyId]:{...assembly,items}};
  }
  if(assemblies!==p.libraries.assemblies)p.libraries.assemblies=assemblies;
}
export function assemblyVisualOf(p:ProjectDocument,id:string):string {
  const e=p.entityIndex[id],source=e&&p.chunks[e.ownerChunkId]?.entities[id];
  if(!source)throw Error('Secteur manquant');
  return resolveEntity(p,source).components.Visual?.assetId??'';
}
