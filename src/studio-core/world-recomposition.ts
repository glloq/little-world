import {alignNaturalBiomes} from './world-biomes-v4.ts';
/** Recomposition is a dry-run first, preserving native mask ownership and manual work.
 * Full reshaping is refused when generated relief/water/recipes or terrain were edited.
 * Region-only refresh uses the existing authored recipes, including manual polygons. */
import type {ProjectDocument} from './types.ts';
import type {MapRequirements} from './map-requirements.ts';
import {composeWorld,projectFromComposition} from './world-composition.ts';
import {alignSteppedBiomes} from './world-biome-boundaries.ts';
import {applyRegionBatch,regionBatchChunks} from './region-batch.ts';
import {removeRegion} from './region-recipes.ts';
import {removeWater,putWater,removePath,putPath,removeEntity,putEntity} from './source.ts';
import {parseProject} from './schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {compileWaterNetwork} from '../water/profile.ts';
import {projectGeography} from './geo-context.ts';
const sourceHash=(p:ProjectDocument)=>fingerprint({...p,manifest:{...p.manifest,revision:0}});
const recipeSource=(v:unknown)=>{const {generated:_,...rest}=v as Record<string,unknown>;return rest;};
export interface RecompositionPreview {project:ProjectDocument;beforeHash:string;chunks:string[];summary:string;mode:'full'|'biomes'}
export function previewWorldRecomposition(p:ProjectDocument,next:MapRequirements,mode:'full'|'biomes'='full'):RecompositionPreview {
 if(!p.world.generation)throw Error('Ce projet ancien ne contient pas de besoins de génération. Créer un nouveau monde guidé.');
 if(Object.keys(p.chunkIndex).some(id=>!p.chunks[id]))throw Error('Charger les secteurs avant de comparer la composition');
 const scratch=structuredClone(p),beforeHash=sourceHash(p);
 let affected:string[]=[],skipBoundaries=new Set<string>();
 if(mode==='biomes'){
  const recipes=Object.values(p.libraries.regions??{}).filter(r=>r.id.startsWith('composition-'));
  if(!recipes.length)throw Error('Aucune région générée à rafraîchir');
  if((p.world.generation.compositionVersion??1)>=3){const baseline=composeWorld(p.world.generation).project;for(const recipe of recipes){const old=baseline.libraries.regions?.[recipe.id];if(!old||fingerprint(recipeSource(recipe))!==fingerprint(recipeSource(old)))skipBoundaries.add(recipe.id);}}
  affected=regionBatchChunks(scratch,recipes);for(let i=0;i<recipes.length;i+=16)applyRegionBatch(scratch,recipes.slice(i,i+16));
 }else{
  if(next.width!==p.world.generation.width||next.length!==p.world.generation.length)throw Error('Redimensionner nécessite un nouveau projet : secteurs et retouches conservés ici');
  const original=composeWorld(p.world.generation).project;
  const allEntities=(project:ProjectDocument)=>Object.fromEntries(Object.values(project.chunks).flatMap(c=>Object.entries(c.entities)));
  const originalEntities=allEntities(original),currentEntities=allEntities(p);
  if(fingerprint(p.world.terrain)!==fingerprint(original.world.terrain)||Object.values(p.chunks).some(c=>c.terrainEdits.length)||fingerprint(currentEntities)!==fingerprint(originalEntities))
   throw Error('Relief retouché ou objets placés : recomposition globale protégée. Rafraîchir seulement les biomes ou créer un nouveau projet.');
  const generatedWater=Object.fromEntries(Object.entries(p.libraries.water).filter(([id])=>id.startsWith('composition-')));
  if(fingerprint(generatedWater)!==fingerprint(original.libraries.water))throw Error('Eau générée modifiée ou supprimée : recomposition globale protégée');
  const regions=Object.fromEntries(Object.entries(p.libraries.regions??{}).filter(([id])=>id.startsWith('composition-')).map(([id,v])=>[id,recipeSource(v)]));
  const originals=Object.fromEntries(Object.entries(original.libraries.regions??{}).map(([id,v])=>[id,recipeSource(v)]));
  if(fingerprint(regions)!==fingerprint(originals))throw Error('Régions générées retouchées ou supprimées : recomposition globale protégée');
  if(fingerprint(p.libraries.terrainPlans??{})!==fingerprint(original.libraries.terrainPlans??{}))throw Error('Zones utiles retouchées ou verrouillées : recomposition globale protégée');
  if(fingerprint(p.libraries.zones??{})!==fingerprint(original.libraries.zones??{}))throw Error('Parcelles ou zones de mine retouchées : recomposition globale protégée');
  const ownedPaths=Object.fromEntries(Object.keys(original.libraries.paths).filter(id=>p.libraries.paths[id]).map(id=>[id,p.libraries.paths[id]]));
  if(fingerprint(ownedPaths)!==fingerprint(original.libraries.paths))throw Error('Accès générés retouchés ou supprimés : recomposition globale protégée');
  if(fingerprint(p.libraries.settlements??{})!==fingerprint(original.libraries.settlements??{}))throw Error('Village généré retouché ou verrouillé : recomposition protégée');
  for(const [id,d]of Object.entries(original.libraries.interactions))if(fingerprint(p.libraries.interactions[id])!==fingerprint(d))throw Error('Interaction générée retouchée : recomposition protégée');
  for(const [id,d]of Object.entries(original.libraries.dialogues))if(fingerprint(p.libraries.dialogues[id])!==fingerprint(d))throw Error('Dialogue généré retouché : recomposition protégée');
  const plan=composeWorld(next,p.manifest.name),generated=projectFromComposition(plan,p.manifest.name);
  for(const id of Object.keys(generated.libraries.paths))if(p.libraries.paths[id]&&!original.libraries.paths[id])throw Error('Un chemin manuel occupe un identifiant de génération');
  for(const id of Object.keys(originalEntities))removeEntity(scratch,id);
  scratch.assets={...generated.assets,...scratch.assets};
  for(const id of Object.keys(original.libraries.dialogues))delete scratch.libraries.dialogues[id];
  scratch.libraries.dialogues={...scratch.libraries.dialogues,...generated.libraries.dialogues};
  for(const id of Object.keys(original.libraries.interactions))delete scratch.libraries.interactions[id];
  scratch.libraries.interactions={...scratch.libraries.interactions,...generated.libraries.interactions};
  if(generated.libraries.settlements)scratch.libraries.settlements=structuredClone(generated.libraries.settlements);else delete scratch.libraries.settlements;
  for(const chunk of Object.values(generated.chunks))for(const entity of Object.values(chunk.entities))putEntity(scratch,entity);
  for(const id of Object.keys(ownedPaths))removePath(scratch,id);
  if(generated.libraries.terrainPlans)scratch.libraries.terrainPlans=structuredClone(generated.libraries.terrainPlans);else delete scratch.libraries.terrainPlans;
  for(const path of Object.values(generated.libraries.paths))putPath(scratch,path);
  for(const id of Object.keys(generatedWater))removeWater(scratch,id);
  for(const id of Object.keys(regions))removeRegion(scratch,id);
  scratch.world={...scratch.world,seed:generated.world.seed,terrain:generated.world.terrain,generation:generated.world.generation};
  for(const water of Object.values(generated.libraries.water))putWater(scratch,water);
  const recipes=Object.values(generated.libraries.regions??{}).map(r=>{const copy=structuredClone(r);delete copy.generated;return copy;});
  for(let i=0;i<recipes.length;i+=16)applyRegionBatch(scratch,recipes.slice(i,i+16));
  affected=[...new Set([...Object.keys(p.chunkIndex),...Object.keys(scratch.chunkIndex)])];
 }
 alignSteppedBiomes(scratch,skipBoundaries);alignNaturalBiomes(scratch,skipBoundaries);
 const hydro=compileWaterNetwork(Object.values(scratch.libraries.water),projectGeography(scratch).source,scratch.world.seaLevel);
 const errors=hydro.flatMap(w=>w.diagnostics.filter(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE'));
 if(errors.length)throw Error('Recomposition incompatible avec l’eau conservée : '+errors.map(d=>d.message).join(' '));
 parseProject(scratch);
 return {project:scratch,beforeHash,chunks:affected,mode,summary:mode==='full'?'Relief, eau et régions générés remplacés ; masques manuels conservés.':'Régions actuelles rafraîchies ; retouches, suppressions, relief et eau conservés.'};
}
/** Call inside session.change: one existing CommandBus transaction, stale preview refused. */
export function applyWorldRecomposition(p:ProjectDocument,preview:RecompositionPreview):void {
 if(sourceHash(p)!==preview.beforeHash)throw Error('Le projet a changé depuis l’aperçu. Recalculer la comparaison.');
 const next=structuredClone(preview.project);
 p.world=next.world;p.entityIndex=next.entityIndex;p.assets=next.assets;p.libraries=next.libraries;p.chunkIndex=next.chunkIndex;p.chunks=next.chunks;
}
