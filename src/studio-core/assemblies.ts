/** Lightweight visual assemblies: project-owned, portable in the V3 ZIP and undoable.
 * No gameplay links are copied: interactions, scripts and state belong to their original IDs. */
import type {ProjectDocument, ComponentMap, EntityDefinitionV3} from './types.ts';
import {chunkAt} from './schema.ts';
import {putEntity} from './source.ts';
import {resolveEntity} from './references.ts';
export interface AssemblyItem {
  kind:'prop'|'building'; name:string; dx:number; dz:number;
  components:Pick<ComponentMap,'Visual'|'Transform'|'Collider'>;
}
export interface AssemblyDefinition {
  id:string; name:string; version:1; items:AssemblyItem[];
}
export function captureAssembly(project:ProjectDocument, ids:string[],name:string,id=crypto.randomUUID()):AssemblyDefinition {
  if(!name.trim()||name.length>100)throw Error('Nom d’assemblage invalide');
  const items:AssemblyItem[]=[];
  for(const entityId of [...new Set(ids)]){
    const index=project.entityIndex[entityId];
    if(!index||!['building','prop'].includes(index.kind))continue;
    const source=project.chunks[index.ownerChunkId]?.entities[entityId];
    if(!source)throw Error('Charger le secteur de '+entityId);
    const entity=resolveEntity(project,source),t=entity.components.Transform,v=entity.components.Visual;
    if(!t||!v)continue;
    items.push({kind:source.kind as AssemblyItem['kind'],name:source.name,dx:t.position.x,dz:t.position.z,
      components:{Transform:structuredClone(t),Visual:structuredClone(v),
        ...(entity.components.Collider?{Collider:structuredClone(entity.components.Collider)}:{})}});
  }
  if(!items.length||items.length>100)throw Error('Sélectionner entre 1 et 100 objets ou bâtiments visuels');
  const cx=items.reduce((n,x)=>n+x.dx,0)/items.length,cz=items.reduce((n,x)=>n+x.dz,0)/items.length;
  for(const item of items){item.dx-=cx;item.dz-=cz;item.components.Transform!.position.x=0;item.components.Transform!.position.z=0;}
  return {id,name:name.trim(),version:1,items};
}
export function assemblyChunkIds(project:ProjectDocument,assembly:AssemblyDefinition,x:number,z:number):string[]{
  return [...new Set(assembly.items.map(item=>chunkAt(project.world,x+item.dx,z+item.dz)))];
}
export function placeAssembly(project:ProjectDocument,assembly:AssemblyDefinition,x:number,z:number,idFactory=()=>crypto.randomUUID()):string[]{
  if(!assembly.items.length||assembly.items.length>100)throw Error('Assemblage vide ou trop grand');
  const b=project.world.bounds,created:string[]=[];
  for(const item of assembly.items){
    const px=x+item.dx,pz=z+item.dz;
    if(px<b.minX||px>b.maxX||pz<b.minZ||pz>b.maxZ)throw Error('Assemblage hors limites');
  }
  for(const item of assembly.items){
    const px=x+item.dx,pz=z+item.dz,ownerChunkId=chunkAt(project.world,px,pz),id=idFactory();
    const t=structuredClone(item.components.Transform!);t.position.x=px;t.position.z=pz;
    const entity:EntityDefinitionV3={id,kind:item.kind,name:item.name,ownerChunkId,
      components:{Transform:t,Visual:structuredClone(item.components.Visual!),
        ...(item.components.Collider?{Collider:structuredClone(item.components.Collider)}:{})}};
    putEntity(project,entity);created.push(id);
  }
  return created;
}
