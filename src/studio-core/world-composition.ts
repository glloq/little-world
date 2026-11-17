/** Author-only composition. The validated plan is the preview AND the saved document. */
import {createProject,parseProject} from './schema.ts';
import {validateMapRequirements,LANDSCAPES,type MapRequirements} from './map-requirements.ts';
import {planWorldTerrain} from './world-terrain-planner.ts';
import {planWorldHydro} from './world-hydro-planner.ts';
import {planWorldBiomes,provinceEnvironment,RIVER_BIOME_SPAN} from './world-biome-planner.ts';
import {generatorField} from '../terrain-generator.ts';
import {putWater} from './source.ts';
import {compositionCoverage,type CompositionCoverage} from './world-composition-quality.ts';
import {alignSteppedBiomes} from './world-biome-boundaries.ts';
import {applyRegionBatch} from './region-batch.ts';
import type {ProjectDocument} from './types.ts';
export interface CompositionDiagnostic {severity:'ERROR'|'WARNING';code:string;message:string}
export interface WorldComposition {project:ProjectDocument;ready:boolean;diagnostics:CompositionDiagnostic[];family:string;metrics:{generationMs:number;features:number;sectors:number;surveyCells:number;sourceBytes:number;coverage?:CompositionCoverage}}
export function composeWorld(input:MapRequirements,name='Mon petit monde'):WorldComposition {
 const started=performance.now(),r=validateMapRequirements(input),diagnostics:CompositionDiagnostic[]=[];
 let planned=planWorldTerrain(r);
 if(r.compositionVersion===3&&r.terraces<3)diagnostics.push({severity:'ERROR',code:'TERRACE_LEVELS_REQUIRED',message:'L’île étagée demande au moins 3 niveaux. Augmenter les terrasses ou choisir la composition en provinces.'});
 const project=createProject({name,width:r.width,length:r.length,seed:r.seed,chunkSizeM:128,terrain:{kind:'archipelago',version:1,archipelago:planned.terrain}});
 project.world.generation=r;
 if(r.type==='valley'||r.type==='continental')diagnostics.push({severity:'ERROR',code:'WORLD_TYPE_UNSUPPORTED',message:'Cette version compose des îles et archipels. Choisir une île pour un exutoire marin valide.'});
 let field=generatorField(project.world.terrain!,{width:r.width,length:r.length,seed:r.seed,seaLevel:0},()=>0);
 let hydro=planWorldHydro(r,planned.axis,field.height,project.world.bounds,planned.lakeCenter);
 // Bounded corrections: keep topology/sub-seeds, sharpen only the terrace joins,
 // then recompile the actual WATER network; never relax validation to accept it.
 for(let attempt=1;attempt<=2&&r.rivers>0&&!hydro.waters.some(w=>w.to?.kind==='sea');attempt++){
  planned=planWorldTerrain(r,attempt);
  project.world.terrain={kind:'archipelago',version:1,archipelago:planned.terrain};
  field=generatorField(project.world.terrain,{width:r.width,length:r.length,seed:r.seed,seaLevel:0},()=>0);
  hydro=planWorldHydro(r,planned.axis,field.height,project.world.bounds,planned.lakeCenter);
 }
 diagnostics.push(...hydro.diagnostics);
 for(const w of hydro.waters)putWater(project,w);
 const main=hydro.waters.filter(w=>w.to?.kind==='sea').length,branches=hydro.waters.filter(w=>w.to?.kind==='river').length;
 if(main<r.rivers)diagnostics.push({severity:'ERROR',code:'RIVERS_MISSING',message:`${main}/${r.rivers} rivière(s) principale(s) valide(s). Réduire le nombre demandé ou changer de graine.`});
 if(branches<r.tributaries)diagnostics.push({severity:'ERROR',code:'TRIBUTARIES_MISSING',message:`${branches}/${r.tributaries} affluent(s) raccordé(s). Réduire la demande ou modifier le relief.`});
 if((r.lakes||r.landscapes.some(l=>l.kind==='lake'))&&!hydro.waters.some(w=>w.kind==='lake'))diagnostics.push({severity:r.landscapes.some(l=>l.kind==='lake'&&l.required)?'ERROR':'WARNING',code:'LAKE_NOT_PLANNED',message:'Aucun bassin fermé avec déversoir validé dans cette composition. Ajouter le lac avec l’outil Bassins ou choisir une autre composition.'});
 if(r.waterfalls&&!hydro.waters.some(w=>w.falls?.length))diagnostics.push({severity:'WARNING',code:'FALL_NOT_PLANNED',message:'Les ruptures sont des rapides en pente ; aucune cascade verticale validée. Utiliser l’assistant Cascades après création.'});
 if(r.biomeMode==='custom'&&r.sequence.includes('lake'))diagnostics.push({severity:'WARNING',code:'LATERAL_LAKE',message:'Le lac proposé est un bassin latéral fermé ; la rivière ne le traverse pas. Pour un lac dans la succession, raccorder un déversoir avec l’outil Eau.'});
 const recipes=planWorldBiomes(project,r,planned.axis,planned.provinces);
 if(r.biomeMode==='custom'&&(r.compositionVersion??1)===1)for(const [i,kind]of r.sequence.entries()){
  const at=planned.axis[Math.min(planned.axis.length-1,Math.round((i+.5)/r.sequence.length*planned.axis.length*RIVER_BIOME_SPAN))],altitude=field.height(at.x,at.z);
  if((kind==='marsh'&&altitude>25)||(kind==='coast'&&field.coast(at.x,at.z)>200))diagnostics.push({severity:r.landscapes.some(l=>l.kind===kind&&l.required)?'ERROR':'WARNING',code:'SEQUENCE_INCOMPATIBLE',message:LANDSCAPES[kind]+' demandé trop en amont : déplacer ce paysage vers l’aval ou ajuster le relief.'});
 }
 if((r.compositionVersion??1)>=2&&r.biomeMode==='custom')for(const province of planned.provinces){
  if(province.station===undefined)continue;
  const kind=r.sequence[province.station],env=provinceEnvironment(project,province,planned.axis);
  if((kind==='marsh'&&env.altitudeM>35)||(kind==='coast'&&env.coastM>220))diagnostics.push({severity:r.landscapes.some(l=>l.kind===kind&&l.required)?'ERROR':'WARNING',code:'SEQUENCE_INCOMPATIBLE',message:LANDSCAPES[kind]+' incompatible avec cet étage du relief : modifier la succession ou choisir une autre graine.'});
 }
 if(recipes.length)applyRegionBatch(project,recipes);
 alignSteppedBiomes(project);
 for(const l of r.landscapes){
  if(l.kind==='lake')continue;
  if(!recipes.some(recipe=>recipe.name===LANDSCAPES[l.kind]))diagnostics.push({severity:l.required?'ERROR':'WARNING',code:'LANDSCAPE_MISSING',message:'Paysage absent de la succession : '+LANDSCAPES[l.kind]});
 }
 const normalized=parseProject(JSON.parse(JSON.stringify(project)));
 const coverage=(r.compositionVersion??1)>=2?compositionCoverage(normalized,planned.axis):undefined;
 return {project:normalized,ready:!diagnostics.some(d=>d.severity==='ERROR'),diagnostics,family:planned.family,
  metrics:{generationMs:performance.now()-started,features:planned.terrain.features.length,sectors:Object.keys(project.chunks).length,surveyCells:hydro.survey.sampled,sourceBytes:new TextEncoder().encode(JSON.stringify(project)).length,...(coverage?{coverage}:{})}};
}
/** Exact already-previewed source: never rerun the generator on confirmation. */
export function projectFromComposition(plan:WorldComposition,name:string):ProjectDocument {
 if(!plan.ready)throw Error('Composition incomplète : corriger les critères non satisfaits');
 if(!name.trim()||name.trim().length>100)throw Error('Nom du projet : 1 à 100 caractères');
 const p=structuredClone(plan.project);p.manifest.name=name.trim();return parseProject(p);
}
