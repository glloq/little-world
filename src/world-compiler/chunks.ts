import {waterTerrainIds} from '../water/sectors.ts';
import type {ProjectDocument,ChunkSourceV3,TerrainEdit,BiomeEdit} from '../studio-core/types.ts';
import {resolveEntity,ReferenceIndex} from '../studio-core/references.ts';
import type {CompiledChunkData,CompiledBounds,CompiledAssetDescriptor} from './manifests.ts';
import {hashText,canonicalJSON} from './manifests.ts';

export function compiledChunkBounds(project:ProjectDocument,cx:number,cz:number):CompiledBounds {
  const {bounds,chunkSizeM}=project.world;
  return {minX:bounds.minX+cx*chunkSizeM,maxX:Math.min(bounds.maxX,bounds.minX+(cx+1)*chunkSizeM),
    minZ:bounds.minZ+cz*chunkSizeM,maxZ:Math.min(bounds.maxZ,bounds.minZ+(cz+1)*chunkSizeM)};
}
interface CompileContext {
  project:ProjectDocument;
  references:ReferenceIndex;
  definitions:Map<string,unknown>;
  definitionHashes:Map<string,string>;
  terrain:Map<string,TerrainEdit>;
  biomes:Map<string,BiomeEdit>;
  assets:Map<string,CompiledAssetDescriptor>;
  coordinates:Map<string,string>;
}
export async function createCompileContext(project:ProjectDocument,assets:CompiledAssetDescriptor[]):Promise<CompileContext>{
  const definitions=new Map<string,unknown>(),terrain=new Map<string,TerrainEdit>(),biomes=new Map<string,BiomeEdit>();
  for(const library of Object.values(project.libraries))for(const [id,value] of Object.entries(library))definitions.set(id,value);
  for(const chunk of Object.values(project.chunks)){
    definitions.set('chunk:'+chunk.chunkId,chunk);
    for(const entity of Object.values(chunk.entities))definitions.set(entity.id,resolveEntity(project,entity));
    for(const edit of chunk.terrainEdits){terrain.set(edit.id,edit);definitions.set(edit.id,edit);}
    for(const edit of chunk.biomeEdits){biomes.set(edit.id,edit);definitions.set(edit.id,edit);}
  }
  for(const asset of assets)definitions.set(asset.id,asset);
  const definitionHashes=new Map<string,string>();
  await Promise.all([...definitions].map(async([id,value])=>definitionHashes.set(id,await hashText(canonicalJSON(value)))));
  return {project,references:new ReferenceIndex(project),definitions,definitionHashes,terrain,biomes,
    assets:new Map(assets.map(asset=>[asset.id,asset])),
    coordinates:new Map(Object.values(project.chunkIndex).map(chunk=>[chunk.cx+','+chunk.cz,chunk.chunkId]))};
}
function required<T>(map:Map<string,T>,id:string):T {
  const value=map.get(id);if(value===undefined)throw Error('Missing canonical source '+id);return value;
}
/** Hash transitive ID dependencies once per chunk; no world geometry is allocated. */
export function dependencyIds(context:CompileContext,chunk:ChunkSourceV3):string[]{
  const found=new Set<string>(),pending=[...chunk.entityIds,...chunk.terrainRefs,...chunk.biomeRefs,...chunk.waterRefs,...chunk.pathRefs,...waterTerrainIds(context.project,chunk.waterRefs)];
  for(const id of context.project.chunkIndex[chunk.chunkId].dependencies)pending.push('chunk:'+id);
  while(pending.length){
    const id=pending.pop()!;if(found.has(id))continue;found.add(id);
    if(!id.startsWith('chunk:'))for(const next of context.references.outgoing(id))if(!found.has(next))pending.push(next);
  }
  // Visual components may be inherited from a prefab and therefore not present in raw refs.
  for(const entity of Object.values(chunk.entities)){
    const visual=resolveEntity(context.project,entity).components.Visual;
    if(visual)found.add(visual.assetId);
  }
  return [...found].sort();
}
export function compileChunkData(context:CompileContext,chunk:ChunkSourceV3,ids:string[]):CompiledChunkData {
  const {project}=context;
  const entities=Object.values(chunk.entities).sort((a,b)=>a.id.localeCompare(b.id)).map(entity=>{
    const resolved=resolveEntity(project,entity);
    return {id:resolved.id,kind:resolved.kind,name:resolved.name,ownerChunkId:resolved.ownerChunkId,
      ...(resolved.parentId?{parentId:resolved.parentId}:{}),components:resolved.components};
  });
  const terrain=[...chunk.terrainEdits,...[...chunk.terrainRefs,...waterTerrainIds(project,chunk.waterRefs)].map(id=>required(context.terrain,id))];
  const biomes=[...chunk.biomeEdits,...chunk.biomeRefs.map(id=>required(context.biomes,id))];
  const uniqueOrdered=<T extends {id:string;order:number}>(values:T[]):T[]=>[...new Map(values.map(value=>[value.id,value])).values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const neighbors:string[]=[];
  for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
    const id=context.coordinates.get((chunk.index.cx+dx)+','+(chunk.index.cz+dz));if(id)neighbors.push(id);
  }
  const dependencyHashes:Record<string,string>={};
  for(const id of ids){
    const hash=context.definitionHashes.get(id);if(!hash)throw Error('Missing dependency definition '+id);dependencyHashes[id]=hash;
  }
  return {schemaVersion:1,kind:'compiled-chunk',worldId:project.world.worldId,chunkId:chunk.chunkId,
    bounds:compiledChunkBounds(project,chunk.index.cx,chunk.index.cz),
    generator:{seed:project.world.seed,version:project.world.generatorVersion,density:project.world.density,seaLevel:project.world.seaLevel},
    entities,terrain:{mode:'procedural-with-ordered-overrides',edits:uniqueOrdered(terrain)},biomes:{edits:uniqueOrdered(biomes)},
    water:chunk.waterRefs.map(id=>project.libraries.water[id]),paths:chunk.pathRefs.map(id=>project.libraries.paths[id]),
    collision:{mode:'analytic-terrain-and-shape-descriptors',shapes:entities.flatMap(entity=>
      entity.components.Collider&&entity.components.Transform?[{entityId:entity.id,transform:entity.components.Transform,collider:entity.components.Collider}]:[])},
    navigation:{mode:'agent-and-path-descriptors',agents:entities.flatMap(entity=>entity.components.Navigation?[{entityId:entity.id,navigation:entity.components.Navigation}]:[]),
      pathIds:[...chunk.pathRefs],neighborChunkIds:neighbors.sort()},dependencyHashes};
}
