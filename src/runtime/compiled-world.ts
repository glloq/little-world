import {settlementGeoZones} from '../settlements/footprint.ts';
import {parseSkiArea,skiAreasOf,skiGeography} from '../snow/ski-area.ts';
import {habitatColliders} from '../settlements/habitat.ts';
/** Runtime reader for compiled V3 worlds (published static files or a Studio test build).
 * Source projects, compiled worlds and player saves stay separate: this module only
 * reads validated compiled resources. Sectors absent from the manifest have no authored
 * package and keep the base relief of `manifest.terrain`.
 */
import {loadCompiledManifest,loadCompiledLogic,loadCompiledChunkDescriptor} from '../world-compiler/load.ts';
import type {CompiledWorldManifest,CompiledChunkData,CompiledLogicData} from '../world-compiler/manifests.ts';
import {runtimeContent} from '../studio-core/migration.ts';
import {activitiesFromZones,activityItems} from '../gameplay/activities.ts';
import {economyItems} from '../gameplay/economy.ts';
import {gameplayDataFromIndex} from '../gameplay/project-adapter.ts';
import {defaultEnvironment} from '../environment/climate.ts';
import {validateAudioLinks} from '../audio/schema.ts';
import {transformedCollider,type CollisionDefinition} from '../physics/definitions.ts';
import {naturalColliders} from '../structures/natural-collision.ts';
import {createTerrainSource} from '../terrain.ts';
import {landscapeRegions} from '../world-production/landscapes.ts';
import {regionDressingRegions} from '../studio-core/region-dressing.ts';
import type {PlayableWorld} from '../gameplay/playable.ts';
import type {Point3} from '../gameplay/schema.ts';
import type {WorldDefinition,WorldConfig,TerrainStroke,BiomeStroke,WaterBody,PathDefinition} from '../world-data.ts';
import type {ComponentMap} from '../studio-core/types.ts';

export interface CompiledWorldBundle {manifestURL:string;manifest:CompiledWorldManifest;logic:CompiledLogicData;chunks:CompiledChunkData[];payloadBytes:number}
export interface OpenOptions {maxPayloadBytes?:number;concurrency?:number;signal?:AbortSignal}
/** Default detail radius of the current renderer; not a source preference. */
export const RUNTIME_VIEW_DISTANCE=240;

/** Loads manifest, global logic and the sparse authored sector packages.
 * Lot 1 limitation: authored packages are read at boot (bounded in bytes); terrain
 * geometry and far proxies are derived progressively by the renderer. */
export async function openCompiledWorld(manifestURL:string,fetcher:typeof fetch=fetch,options:OpenOptions={}):Promise<CompiledWorldBundle>{
  const manifest=await loadCompiledManifest(manifestURL,fetcher);
  const payloadBytes=manifest.chunks.reduce((sum,chunk)=>sum+chunk.byteLength,0),limit=options.maxPayloadBytes??48*1024*1024;
  if(payloadBytes>limit)throw Error(`Paquets auteur trop volumineux pour un chargement initial (${Math.ceil(payloadBytes/1048576)} Mio) : streaming des entités requis.`);
  if(options.signal?.aborted)throw Error('Chargement annulé');
  const chunks:CompiledChunkData[]=new Array(manifest.chunks.length);
  let logic:CompiledLogicData|undefined;
  let next=-1;
  async function worker(){
    while(next<manifest.chunks.length){
      if(options.signal?.aborted)throw Error('Chargement annulé');
      const index=next++;
      if(index===-1)logic=await loadCompiledLogic(manifestURL,manifest,fetcher);
      else chunks[index]=await loadCompiledChunkDescriptor(manifestURL,manifest,manifest.chunks[index],fetcher);
    }
  }
  const concurrency=Number.isFinite(options.concurrency)?Math.max(1,Math.floor(options.concurrency!)):6;
  await Promise.all(Array.from({length:Math.min(concurrency,manifest.chunks.length+1)},worker));
  if(!logic)throw Error('Logique du monde absente');
  return {manifestURL,manifest,logic,chunks,payloadBytes};
}
function unionById<T extends {id:string}>(lists:T[][]):T[]{const map=new Map<string,T>();for(const list of lists)for(const item of list)map.set(item.id,item);return [...map.values()];}
const stripOrder=<T extends {order:number}>(edit:T):Omit<T,'order'>=>{const {order:_,...rest}=edit;return structuredClone(rest);};
export function runtimeConfig(manifest:CompiledWorldManifest):WorldConfig{
  const {bounds}=manifest;
  if(Math.abs(bounds.minX+bounds.maxX)>1e-6||Math.abs(bounds.minZ+bounds.maxZ)>1e-6)throw Error('Le rendu actuel exige des limites centrées à l’origine');
  return {seed:manifest.seed,density:manifest.density,width:bounds.maxX-bounds.minX,length:bounds.maxZ-bounds.minZ,seaLevel:manifest.seaLevel,chunkSize:manifest.chunkSizeM,viewDistance:RUNTIME_VIEW_DISTANCE,generatorVersion:1,terrain:structuredClone(manifest.terrain)};
}
/** First dry point walking inland from the south-most coast along X=0 (or the legacy start). */
export function defaultSpawn(config:WorldConfig,terrain:TerrainStroke[]):Point3{
  const width=config.width??200,length=config.length??600;
  if(!config.terrain||config.terrain.kind==='legacy-valley'){const x=-24,z=-183;return Math.abs(x)<width/2&&Math.abs(z)<length/2?{x,y:0,z}:{x:0,y:0,z:0};}
  const height=createTerrainSource(config,terrain),sea=config.seaLevel??0;
  for(let z=length/2-4;z>-length/2;z-=4)if(height(0,z)>sea+1.2)return {x:0,y:0,z:z-6};
  return {x:0,y:0,z:0};
}
export function playableFromCompiled(bundle:CompiledWorldBundle,spawn?:Point3):PlayableWorld{
  const {manifest,logic,chunks}=bundle,config=runtimeConfig(manifest);
  const entities=unionById(chunks.map(chunk=>chunk.entities)).sort((a,b)=>a.id.localeCompare(b.id));
  const {placements,npcs,lights}=runtimeContent(entities,logic.libraries);
  const terrain=unionById(chunks.map(chunk=>chunk.terrain.edits)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(stripOrder) as TerrainStroke[];
  const biomes=unionById(chunks.map(chunk=>chunk.biomes.edits)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(stripOrder) as BiomeStroke[];
  const masks:Record<string,import('../geography/layers.ts').SectorLayers>={};for(const chunk of chunks)if(chunk.layers)masks[chunk.chunkId]=structuredClone(chunk.layers);
  const zones=[...Object.values(logic.libraries.zones??{}).map(z=>({kind:z.kind,polygon:z.polygon.map(p=>({...p}))})),...settlementGeoZones(logic.libraries.settlements)];
  const landscapes=[...landscapeRegions(logic.libraries.landscapes),...regionDressingRegions(logic.libraries.regions)];
  const raceRoads=Object.values(logic.libraries.races??{}).flatMap(r=>r.track?[structuredClone(r.track)]:[]);
  const world:WorldDefinition={...(logic.libraries.alpine||Object.keys(masks).length||zones.length||landscapes.length||raceRoads.length?{geography:{...(logic.libraries.alpine?skiGeography(logic.libraries.alpine):{}),sectorSizeM:manifest.chunkSizeM,masks,zones,...(landscapes.length?{landscapes}:{}),...(raceRoads.length?{races:raceRoads}:{})}}:{}),schemaVersion:2,name:manifest.worldId,config,placements,terrain,biomes,
    water:unionById(chunks.map(chunk=>chunk.water as WaterBody[])).map(w=>structuredClone(w)),paths:unionById(chunks.map(chunk=>chunk.paths as PathDefinition[])).map(p=>structuredClone(p)),npcs,...(lights.length?{lights}:{})};
  const components=new Map<string,ComponentMap>(entities.map(entity=>[entity.id,entity.components]));
  const activities=activitiesFromZones(Object.values(logic.libraries.zones??{}),createTerrainSource(config,terrain));
  const gameplay=gameplayDataFromIndex({entityIndex:logic.entityIndex,components,libraries:logic.libraries,environment:manifest.environment??defaultEnvironment(manifest.seed),worldId:manifest.worldId,buildVersion:manifest.buildVersion});
  gameplay.items=economyItems(activityItems(activities,gameplay.items));
  const rendered=new Set([...placements.map(p=>p.id),...npcs.map(n=>n.id)]);
  for(const entity of gameplay.entities)if(entity.interactable&&!rendered.has(entity.id))throw Error('Objet interactif sans représentation : '+entity.id);
  const collisions:CollisionDefinition[]=chunks.flatMap(chunk=>chunk.collision.shapes.filter(shape=>shape.collider.layer==='solid').map(shape=>transformedCollider(shape.entityId,shape.collider,shape.transform))); 
  for(const entity of entities)if(entity.components.NaturalStructure&&entity.components.Transform)
    collisions.push(...naturalColliders(entity.id,entity.components.NaturalStructure,entity.components.Transform));
  for(const entity of entities)if(entity.components.Habitat&&entity.components.Transform)collisions.push(...habitatColliders(entity.id,entity.components.Transform));
  const actions=[...gameplay.interactions.flatMap(i=>i.sequence),...gameplay.dialogues.flatMap(d=>d.lines.flatMap(l=>[...(l.actions??[]),...l.choices.flatMap(c=>c.actions??[])]))];
  validateAudioLinks(manifest.audio,gameplay.entities.map(e=>e.id),actions.filter(a=>a.type==='playSound').map(a=>(a as {soundId:string}).soundId));
  const questCatalog=Object.values(logic.libraries.questCatalog??{}).map(q=>structuredClone(q));
  const races=Object.values(logic.libraries.races??{}).map(r=>structuredClone(r));
  const surfZones=Object.values(logic.libraries.surfZones??{}).map(z=>structuredClone(z));
  const surfFeatures=Object.values(logic.libraries.surfFeatures??{}).map(f=>structuredClone(f));
  const start=spawn??defaultSpawn(config,terrain);
  if(Math.abs(start.x)>(config.width??0)/2||Math.abs(start.z)>(config.length??0)/2)throw Error('Point de départ hors de la carte');
  return {schemaVersion:1,kind:'playable-world',...(logic.libraries.alpine?{alpine:parseSkiArea(logic.libraries.alpine['composition-alpine'],manifest.bounds),alpineAreas:skiAreasOf(logic.libraries.alpine).map(area=>parseSkiArea(area,manifest.bounds))}:{}),...(manifest.audio?{audio:manifest.audio}:{}),world,gameplay,collisions,spawn:{...start},...(activities.mines.length||activities.farms.length?{activities}:{}),...(races.length?{races}:{}),...(questCatalog.length?{questCatalog}:{}),...(surfZones.length?{surfZones}:{}),...(surfFeatures.length?{surfFeatures}:{})};
}
/** Published worlds: a same-origin relative manifest path such as `maps/island/manifest.json`. */
export function publishedManifestURL(base:string,path:string):string{
  if(!/^[a-zA-Z0-9_./-]+\/manifest\.json$/.test(path)||path.startsWith('/')||path.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('Chemin de monde publié invalide');
  return base+path;
}
