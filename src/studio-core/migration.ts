import {waterTerrainIds} from '../water/sectors.ts';
import { parseWorld, type WorldDefinition } from '../world-data.ts';
import type { BiomeEdit, TerrainEdit, EntityDefinitionV3, MigrationReport, ProjectDocument } from './types.ts';
import { affectedChunkIds, chunkAt, createProject, parseProject } from './schema.ts';
import { ensureChunk, putBiomeEdit, putEntity, putTerrainEdit } from './source.ts';
import { resolveEntity } from './references.ts';
/** Stable custom UUID v8 derived from serialized legacy source, not a random import timestamp. */
function sourceUUID(source:string,salt:string):string{
  let hex='';for(let lane=0;lane<4;lane++){let hash=(2166136261+lane*374761393)>>>0;for(const char of salt+source)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;hex+=hash.toString(16).padStart(8,'0');}
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;
}
function stableJSON(value:unknown):string{if(Array.isArray(value))return `[${value.map(stableJSON).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableJSON(v)}`).join(',')}}`;return JSON.stringify(value);}
export function migrateWorldToV3(input:unknown,options:{projectId?:string;worldId?:string}={}):{project:ProjectDocument;report:MigrationReport}{
  const version=(input as {schemaVersion?:unknown}|null)?.schemaVersion;if(version!==1&&version!==2)throw Error('Migration : source V1 ou V2 requise');
  const legacy=parseWorld(input);if(version===1)legacy.npcs=[];
  const serialized=stableJSON(input),config=legacy.config;
  const project=createProject({name:legacy.name,width:config.width,length:config.length,seed:config.seed,chunkSizeM:config.chunkSize,density:config.density,seaLevel:config.seaLevel,viewDistance:config.viewDistance,projectId:options.projectId??sourceUUID(serialized,'project'),worldId:options.worldId??sourceUUID(serialized,'world')});
  project.manifest.createdWith=`little-world-migration-v${version}-v3`;
  const preservedIds:string[]=[],warnings:string[]=[];
  if(version===1)warnings.push('Le format V1 ne contient aucun PNJ : aucun PNJ de démonstration supplémentaire n’a été injecté.');
  for(const placement of legacy.placements){
    const prefabId=`prefab:${placement.assetId}`;
    if(!project.libraries.prefabs[prefabId])project.libraries.prefabs[prefabId]={id:prefabId,version:1,name:project.assets[placement.assetId].name,components:{Visual:{type:'Visual',assetId:placement.assetId}}};
    const scale=placement.scale??1;
    const entity:EntityDefinitionV3={id:placement.id,kind:placement.assetId.startsWith('architecture.')?'building':'prop',name:project.assets[placement.assetId].name,ownerChunkId:chunkAt(project.world,placement.x,placement.z),prefabId,components:{Transform:{type:'Transform',position:{x:placement.x,y:0,z:placement.z},rotation:{x:0,y:Math.sin(placement.rotation/2),z:0,w:Math.cos(placement.rotation/2)},scale:{x:scale,y:scale,z:scale}}}};
    putEntity(project,entity);preservedIds.push(placement.id);
  }
  legacy.terrain.forEach((edit,order)=>{putTerrainEdit(project,{...edit,order});preservedIds.push(edit.id);});
  legacy.biomes.forEach((edit,order)=>{putBiomeEdit(project,{...edit,order});preservedIds.push(edit.id);});
  for(const [kind,lines]of [['water',legacy.water],['paths',legacy.paths]] as const)for(const line of lines){
    if(kind==='water')project.libraries.water[line.id]=structuredClone(line) as WorldDefinition['water'][number];else project.libraries.paths[line.id]=structuredClone(line);
    const minX=Math.min(...line.points.map(p=>p.x)),maxX=Math.max(...line.points.map(p=>p.x)),minZ=Math.min(...line.points.map(p=>p.z)),maxZ=Math.max(...line.points.map(p=>p.z));
    for(const id of affectedChunkIds(project.world,(minX+maxX)/2,(minZ+maxZ)/2,Math.hypot(maxX-minX,maxZ-minZ)/2+line.width/2)){const chunk=ensureChunk(project,id);(kind==='water'?chunk.waterRefs:chunk.pathRefs).push(line.id);}preservedIds.push(line.id);
  }
  for(const npc of legacy.npcs){
    const behaviorId=`behavior:${npc.id}`,dialogueId=`dialogue:${npc.id}`;project.libraries.behaviors[behaviorId]={id:behaviorId,kind:npc.behavior};
    if(npc.dialogue)project.libraries.dialogues[dialogueId]={id:dialogueId,actorId:npc.id,...structuredClone(npc.dialogue)};
    const entity:EntityDefinitionV3={id:npc.id,kind:'character',name:npc.name,ownerChunkId:chunkAt(project.world,npc.x,npc.z),components:{Transform:{type:'Transform',position:{x:npc.x,y:0,z:npc.z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Character:{type:'Character',species:npc.kind,rigId:'squirrel-rigid',appearance:structuredClone(npc.appearance)},Navigation:{type:'Navigation',behaviorId,speed:npc.speed,radius:npc.radius,...(npc.path?{path:structuredClone(npc.path)}:{})},BehaviorRef:{type:'BehaviorRef',behaviorId},...(npc.dialogue?{DialogueActor:{type:'DialogueActor',dialogueIds:[dialogueId]}}:{})}};
    putEntity(project,entity);preservedIds.push(npc.id,...(npc.dialogue?.lines.map(line=>line.id)??[]));
  }
  const validated=parseProject(project);
  return {project:validated,report:{fromVersion:version,toVersion:3,projectId:project.manifest.projectId,worldId:project.manifest.worldId,counts:{entities:Object.keys(project.entityIndex).length,terrainEdits:legacy.terrain.length,biomeEdits:legacy.biomes.length,water:legacy.water.length,paths:legacy.paths.length,dialogues:Object.keys(project.libraries.dialogues).length,chunks:Object.keys(project.chunkIndex).length},preservedIds,warnings}};
}
/** Temporary V2-shaped renderer adapter. V3 validation owns its dimensions;
 * this does not relax the legacy V2 import contract or generate a compiled world. */
export function toRuntimeWorld(project:ProjectDocument,chunkIds?:string[]):WorldDefinition{
  const {world}=project,width=world.bounds.maxX-world.bounds.minX,length=world.bounds.maxZ-world.bounds.minZ;
  if(Math.abs(world.bounds.minX+world.bounds.maxX)>1e-6||Math.abs(world.bounds.minZ+world.bounds.maxZ)>1e-6)throw Error('Le rendu historique exige actuellement des limites centrées à l’origine');
  const selected=(chunkIds??Object.keys(project.chunks)).map(id=>{const chunk=project.chunks[id];if(!chunk)throw Error(`Secteur non chargé : ${id}`);return chunk;});
  const terrainIds=new Set([...selected.flatMap(c=>c.terrainRefs),...waterTerrainIds(project,[...new Set(selected.flatMap(c=>c.waterRefs))])]),biomeIds=new Set(selected.flatMap(c=>c.biomeRefs));
  const terrain=new Map<string,TerrainEdit>(),biomes=new Map<string,BiomeEdit>();
  for(const c of Object.values(project.chunks)){for(const edit of c.terrainEdits)if(terrainIds.has(edit.id))terrain.set(edit.id,edit);for(const edit of c.biomeEdits)if(biomeIds.has(edit.id))biomes.set(edit.id,edit);}
  if(terrain.size!==terrainIds.size||biomes.size!==biomeIds.size)throw Error('Charger les dépendances canoniques des retouches avant prévisualisation');
  const placements:WorldDefinition['placements']=[],npcs:WorldDefinition['npcs']=[];
  for(const chunk of selected)for(const id of chunk.entityIds){
    const entity=resolveEntity(project,chunk.entities[id]),c=entity.components,t=c.Transform!;
    if(c.Character){const n=c.Navigation,behavior=n?project.libraries.behaviors[n.behaviorId]?.kind:'idle',dialogue=c.DialogueActor?.dialogueIds[0],graph=dialogue?project.libraries.dialogues[dialogue]:undefined;npcs.push({id:entity.id,name:entity.name,kind:c.Character.species,x:t.position.x,z:t.position.z,behavior:behavior??'idle',radius:n?.radius??0,speed:n?.speed??0,appearance:structuredClone(c.Character.appearance),...(n?.path?{path:structuredClone(n.path)}:{}),...(graph?{dialogue:{start:graph.start,lines:structuredClone(graph.lines)}}:{})});
    }else if(c.Visual)placements.push({id:entity.id,assetId:c.Visual.assetId,x:t.position.x,z:t.position.z,rotation:Math.atan2(2*(t.rotation.w*t.rotation.y+t.rotation.x*t.rotation.z),1-2*(t.rotation.y*t.rotation.y+t.rotation.z*t.rotation.z)),scale:t.scale.x});
  }
  const waterIds=new Set(selected.flatMap(c=>c.waterRefs)),pathIds=new Set(selected.flatMap(c=>c.pathRefs));
  const stripOrder=<T extends {order:number}>(edit:T):Omit<T,'order'>=>{const {order:_,...data}=edit;return structuredClone(data);};
  return {schemaVersion:2,name:project.manifest.name,config:{seed:world.seed,density:world.density,width,length,seaLevel:world.seaLevel,chunkSize:world.chunkSizeM,viewDistance:world.viewDistance,generatorVersion:1,...(world.terrain?{terrain:structuredClone(world.terrain)}:{})},placements,terrain:[...terrain.values()].sort((a,b)=>a.order-b.order).map(stripOrder),biomes:[...biomes.values()].sort((a,b)=>a.order-b.order).map(stripOrder),water:[...waterIds].map(id=>structuredClone(project.libraries.water[id])),paths:[...pathIds].map(id=>structuredClone(project.libraries.paths[id])),npcs};
}
