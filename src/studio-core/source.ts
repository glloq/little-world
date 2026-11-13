/** Source mutations are intended to run inside a CommandBus transaction. They
 * preserve canonical overrides, touched-sector ownership and lightweight indexes. */
import type { BiomeEdit, ChunkId, ChunkSourceV3, EntityDefinitionV3, ProjectDocument, TerrainEdit } from './types.ts';
import { affectedChunkIds, chunkAt, chunkCoordinates, emptyChunk, parseEntity, validateTerrainEdit } from './schema.ts';
import { entityIndexEntry, resolveEntity } from './references.ts';
import type { BiomeStroke, TerrainStroke } from '../world-data.ts';
export function ensureChunk(project:ProjectDocument,id:ChunkId):ChunkSourceV3{
  const index=chunkCoordinates(project.world,id);
  if(project.chunkIndex[id]&&!project.chunks[id])throw Error(`Charger le secteur avant modification : ${id}`);
  if(!project.chunkIndex[id])project.chunkIndex[id]={chunkId:id,...index,revision:0,sourceRef:`world/chunks/${index.cx}_${index.cz}.json`,dependencies:[],terrainOwners:{},biomeOwners:{}};
  return project.chunks[id]??(project.chunks[id]=emptyChunk(project.world,id));
}
export function putEntity(project:ProjectDocument,entity:EntityDefinitionV3):void{
  const parsed=parseEntity(entity,project.world),resolved=resolveEntity(project,parsed),previous=project.entityIndex[entity.id];
  if(previous&&previous.ownerChunkId!==entity.ownerChunkId&&!project.chunks[previous.ownerChunkId])throw Error('Charger le secteur propriétaire avant déplacement');
  const destination=ensureChunk(project,entity.ownerChunkId);
  if(previous&&previous.ownerChunkId!==entity.ownerChunkId){const source=project.chunks[previous.ownerChunkId];if(!source)throw Error('Charger le secteur propriétaire avant déplacement');delete source.entities[entity.id];source.entityIds=source.entityIds.filter(id=>id!==entity.id);}
  if(!destination.entities[entity.id])destination.entityIds.push(entity.id);destination.entities[entity.id]=structuredClone(parsed);project.entityIndex[entity.id]=entityIndexEntry(resolved);
}
export function removeEntity(project:ProjectDocument,id:string):void{
  const entry=project.entityIndex[id];if(!entry)return;const chunk=project.chunks[entry.ownerChunkId];if(!chunk)throw Error('Charger le propriétaire avant suppression');delete chunk.entities[id];chunk.entityIds=chunk.entityIds.filter(value=>value!==id);delete project.entityIndex[id];
}
function rebuildDependencies(project:ProjectDocument,id:string):void{
  const meta=project.chunkIndex[id];meta.dependencies=[...new Set([...Object.values(meta.terrainOwners??{}),...Object.values(meta.biomeOwners??{})])].filter(owner=>owner!==id).sort();
}
function findCanonical(project:ProjectDocument,id:string,kind:'terrain'|'biome'){
  for(const meta of Object.values(project.chunkIndex)){
    const owner=(kind==='terrain'?meta.terrainOwners:meta.biomeOwners)?.[id];if(owner)return owner;
  }
  for(const chunk of Object.values(project.chunks))if((kind==='terrain'?chunk.terrainEdits:chunk.biomeEdits).some(edit=>edit.id===id))return chunk.chunkId;
  return undefined;
}
function removeEdit(project:ProjectDocument,id:string,kind:'terrain'|'biome'):void{
  const owner=findCanonical(project,id,kind);if(owner&&!project.chunks[owner])throw Error('Charger la source canonique avant suppression');
  for(const [key,meta]of Object.entries(project.chunkIndex))if((kind==='terrain'?meta.terrainOwners:meta.biomeOwners)?.[id]&&!project.chunks[key])throw Error('Charger les secteurs affectés avant modification');
  for(const [key,meta]of Object.entries(project.chunkIndex)){
    const owners=kind==='terrain'?meta.terrainOwners:meta.biomeOwners;if(!owners?.[id])continue;
    const chunk=project.chunks[key];if(!chunk)throw Error('Charger les secteurs affectés avant modification');
    if(kind==='terrain'){chunk.terrainRefs=chunk.terrainRefs.filter(value=>value!==id);chunk.terrainEdits=chunk.terrainEdits.filter(value=>value.id!==id);}else{chunk.biomeRefs=chunk.biomeRefs.filter(value=>value!==id);chunk.biomeEdits=chunk.biomeEdits.filter(value=>value.id!==id);}delete owners[id];rebuildDependencies(project,key);
  }
}
export function removeTerrainEdit(project:ProjectDocument,id:string):void{removeEdit(project,id,'terrain');}
export function removeBiomeEdit(project:ProjectDocument,id:string):void{removeEdit(project,id,'biome');}
function putEdit(project:ProjectDocument,stroke:(TerrainStroke|BiomeStroke)&{order?:number},kind:'terrain'|'biome'):void{
  const oldOwner=findCanonical(project,stroke.id,kind),old=oldOwner?project.chunks[oldOwner]:undefined;if(oldOwner&&!old)throw Error('Charger la source canonique avant modification');
  const previous=old?(kind==='terrain'?old.terrainEdits:old.biomeEdits).find(edit=>edit.id===stroke.id):undefined;
  const order=stroke.order??previous?.order??project.world.editSequence;
  validateTerrainEdit({...stroke,order},project.world,kind==='biome');
  const owner=chunkAt(project.world,stroke.x,stroke.z),affected=affectedChunkIds(project.world,stroke.x,stroke.z,stroke.radius);
  // All prerequisites are checked before changing canonical data.
  for(const id of affected)if(project.chunkIndex[id]&&!project.chunks[id])throw Error(`Charger le secteur affecté : ${id}`);
  removeEdit(project,stroke.id,kind);
  const source=ensureChunk(project,owner),edit={...structuredClone(stroke),order};
  if(kind==='terrain')source.terrainEdits.push(edit as TerrainEdit);else source.biomeEdits.push(edit as BiomeEdit);
  project.world.editSequence=Math.max(project.world.editSequence,order+1);
  for(const id of affected){const chunk=ensureChunk(project,id),meta=project.chunkIndex[id];if(kind==='terrain'){chunk.terrainRefs.push(stroke.id);(meta.terrainOwners??={})[stroke.id]=owner;}else{chunk.biomeRefs.push(stroke.id);(meta.biomeOwners??={})[stroke.id]=owner;}rebuildDependencies(project,id);}
}
export function putTerrainEdit(project:ProjectDocument,stroke:TerrainStroke&{order?:number}):void{putEdit(project,stroke,'terrain');}
export function putBiomeEdit(project:ProjectDocument,stroke:BiomeStroke&{order?:number}):void{putEdit(project,stroke,'biome');}
