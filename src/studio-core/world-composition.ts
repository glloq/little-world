import {generateWorldActivities,validateWorldActivities} from './world-activities.ts';
import {generateBirthPort,validateBirthPort} from './birth-port.ts';
import {generateWelcomeVillage} from './welcome-village.ts';
import {compilePolygon} from '../geography/archipelago.ts';
import {planTerrainSites} from './terrain-site-planner.ts';
import {planTerrainAccess,terrainAccessContext,validateTerrainAccess} from './terrain-access.ts';
import {alignNaturalBiomes} from './world-biomes-v4.ts';
import {naturalQuality,type NaturalQuality} from './world-natural-quality.ts';
/** Author-only composition. The validated plan is the preview AND the saved document. */
import {createProject,parseProject} from './schema.ts';
import {validateMapRequirements,LANDSCAPES,type MapRequirements} from './map-requirements.ts';
import {planWorldTerrain} from './world-terrain-planner.ts';
import {planWorldHydro} from './world-hydro-planner.ts';
import {planWorldBiomes,provinceEnvironment,RIVER_BIOME_SPAN} from './world-biome-planner.ts';
import {generatorField} from '../terrain-generator.ts';
import {putPath,putWater} from './source.ts';
import {auditCirculation,planCirculationLinks} from './circulation.ts';
import {planSkiResortActivity,resortShaping} from './activity-planners.ts';
import {planPoles} from './world-poles.ts';
import {planActivityStories} from './activity-stories.ts';
import {planBathymetry,planDiveSites,SHELF} from './underwater-planner.ts';
import {compositionCoverage,type CompositionCoverage} from './world-composition-quality.ts';
import {alignSteppedBiomes} from './world-biome-boundaries.ts';
import {applyRegionBatch} from './region-batch.ts';
import type {ProjectDocument} from './types.ts';
import {auditLandUse,projectLandRegistry,type LandRegistry} from './land-registry.ts';
import {compositionProfile,runStages,type CompositionProfile,type PlanDiagnostic,type StageReport,type WorldStage} from './world-plan.ts';
export type CompositionDiagnostic=PlanDiagnostic;
export interface WorldComposition {project:ProjectDocument;ready:boolean;diagnostics:CompositionDiagnostic[];family:string;stages?:StageReport[];metrics:{generationMs:number;features:number;sectors:number;surveyCells:number;sourceBytes:number;coverage?:CompositionCoverage;natural?:NaturalQuality}}

/** Shared state of one composition run (doc 104 §C2). Each field is owned by the stage that sets it. */
export interface CompositionContext {
 requirements:MapRequirements;profile:CompositionProfile;name:string;identity?:{projectId:string;worldId:string};
 diagnostics:CompositionDiagnostic[];stages:StageReport[];
 planned:ReturnType<typeof planWorldTerrain>;project:ProjectDocument;
 field?:ReturnType<typeof generatorField>;hydro?:ReturnType<typeof planWorldHydro>;
 land?:LandRegistry;recipes?:ReturnType<typeof planWorldBiomes>;natural?:NaturalQuality;normalized?:ProjectDocument;coverage?:CompositionCoverage;
}
type Stage=WorldStage<CompositionContext>;
const archipelagoFeatures=(c:CompositionContext)=>c.project.world.terrain?.kind==='archipelago'?c.project.world.terrain.archipelago.features:undefined;

const SHAPE:Stage={id:'shape',label:'Forme et macro-relief',run(c){
 const r=c.requirements;c.planned=planWorldTerrain(r);
 if(r.compositionVersion===3&&r.terraces<3)c.diagnostics.push({severity:'ERROR',code:'TERRACE_LEVELS_REQUIRED',message:'L’île étagée demande au moins 3 niveaux. Augmenter les terrasses ou choisir la composition en provinces.'});
 c.project=createProject({...c.identity,name:c.name,width:r.width,length:r.length,seed:r.seed,chunkSizeM:128,terrain:{kind:'archipelago',version:1,archipelago:c.planned.terrain}});
 c.project.world.generation=r;
}};
/** Offshore profile first (shelf, drop-off): port, surf and boats then read the final depths (doc 104 §3). */
const SEABED:Stage={id:'seabed',label:'Profil des fonds marins',run(c){
 const u=c.requirements.underwater;if(!u)return;
 const t=c.project.world.terrain;if(t?.kind==='archipelago')t.archipelago.bathymetry={...SHELF[u.shelf],features:[]};
}};
const SITES:Stage={id:'sites',label:'Zones utiles (port, fermes, lac)',run(c){
 c.diagnostics.push(...planTerrainSites(c.project,c.requirements));
 if(c.requirements.type==='valley'||c.requirements.type==='continental')c.diagnostics.push({severity:'ERROR',code:'WORLD_TYPE_UNSUPPORTED',message:'Cette version compose des îles et archipels. Choisir une île pour un exutoire marin valide.'});
}};
const HYDRO:Stage={id:'hydro',label:'Hydrographie',run(c){
 const r=c.requirements,project=c.project;
 c.field=generatorField(project.world.terrain!,{width:r.width,length:r.length,seed:r.seed,seaLevel:0},()=>0);
 const dryReservations=Object.values(project.libraries.terrainPlans??{}).flatMap(p=>p.sites.filter(s=>s.kind!=='lake').map(s=>{const f=archipelagoFeatures(c)?.find(f=>f.id===s.featureId);return f?.kind==='plateau'?compilePolygon(f.polygon):()=>-1;}));
 let hydro=planWorldHydro(r,c.planned.axis,c.field.height,project.world.bounds,c.planned.lakeCenter,Object.values(project.libraries.water),dryReservations.length?(x,z)=>dryReservations.some(inside=>inside(x,z)>=0):undefined);
 // Bounded corrections: keep topology/sub-seeds, sharpen only the terrace joins,
 // then recompile the actual WATER network; never relax validation to accept it.
 for(let attempt=1;attempt<=2&&c.profile.terraceRetry&&r.rivers>0&&!hydro.waters.some(w=>w.to?.kind==='sea');attempt++){
  c.planned=planWorldTerrain(r,attempt);
  project.world.terrain={kind:'archipelago',version:1,archipelago:c.planned.terrain};
  c.field=generatorField(project.world.terrain,{width:r.width,length:r.length,seed:r.seed,seaLevel:0},()=>0);
  hydro=planWorldHydro(r,c.planned.axis,c.field.height,project.world.bounds,c.planned.lakeCenter);
 }
 c.hydro=hydro;c.diagnostics.push(...hydro.diagnostics);
 for(const w of hydro.waters)putWater(project,w);
}};
const ACCESS:Stage={id:'access',label:'Accès des zones utiles',run(c){
 planTerrainAccess(c.project);c.diagnostics.push(...validateTerrainAccess(c.project));
 const r=c.requirements,hydro=c.hydro!;
 const demandSeverity=c.profile.natural&&r.islandStyle?.hydrology==='preferred'?'WARNING':'ERROR';
 const main=hydro.waters.filter(w=>w.to?.kind==='sea').length,branches=hydro.waters.filter(w=>w.to?.kind==='river').length;
 if(main<r.rivers)c.diagnostics.push({severity:demandSeverity,code:'RIVERS_MISSING',message:`${main}/${r.rivers} rivière(s) principale(s) valide(s). Réduire le nombre demandé ou changer de graine.`});
 if(branches<r.tributaries)c.diagnostics.push({severity:demandSeverity,code:'TRIBUTARIES_MISSING',message:`${branches}/${r.tributaries} affluent(s) raccordé(s). Réduire la demande ou modifier le relief.`});
 if((r.lakes||r.landscapes.some(l=>l.kind==='lake'))&&!hydro.waters.some(w=>w.kind==='lake'))c.diagnostics.push({severity:r.landscapes.some(l=>l.kind==='lake'&&l.required)?'ERROR':'WARNING',code:'LAKE_NOT_PLANNED',message:'Aucun bassin fermé avec déversoir validé dans cette composition. Ajouter le lac avec l’outil Bassins ou choisir une autre composition.'});
 if(r.waterfalls&&!hydro.waters.some(w=>w.falls?.length))c.diagnostics.push({severity:'WARNING',code:'FALL_NOT_PLANNED',message:'Les ruptures sont des rapides en pente ; aucune cascade verticale validée. Utiliser l’assistant Cascades après création.'});
 if(r.biomeMode==='custom'&&r.sequence.includes('lake'))c.diagnostics.push({severity:'WARNING',code:'LATERAL_LAKE',message:'Le lac proposé est un bassin latéral fermé ; la rivière ne le traverse pas. Pour un lac dans la succession, raccorder un déversoir avec l’outil Eau.'});
}};
const SETTLEMENTS:Stage={id:'settlements',label:'Port et village d’accueil',run(c){
 const r=c.requirements,project=c.project;if(!r.maritimePort)return;
 const port=generateBirthPort(project);
 if(!port){c.diagnostics.push({severity:'ERROR',code:'MARITIME_PORT_MISSING',message:'Aucun port N1 praticable : choisir une autre graine, un relief plus doux ou désactiver le départ maritime.'});return;}
 if(!r.welcomeVillage||r.welcomeVillage==='none')return;
 const count=generateWelcomeVillage(project,port,r.welcomeVillage,r.welcomeActivity,r.earthworks===true,r.architecture),target=r.welcomeVillage==='hamlet'?12:24;
 if(!count)c.diagnostics.push({severity:'WARNING',code:'WELCOME_VILLAGE_MISSING',message:'Port créé ; aucun village ne tient sur les replats voisins.'});
 else if(count<target)c.diagnostics.push({severity:'WARNING',code:'WELCOME_VILLAGE_PARTIAL',message:count+'/'+target+' maisons possibles près du port ; les accès restent validés.'});
}};
/** Complementary villages (fishing, farming, mountain, market…) placed by terrain fitness (doc 104 §C6). */
const POLES:Stage={id:'poles',label:'Pôles habités',run(c){
 const r=c.requirements;if(!r.poles?.length)return;
 c.diagnostics.push(...planPoles(c.project,r.poles,{architecture:r.architecture,earthworks:r.earthworks===true}).diagnostics);
}};
const ACTIVITIES:Stage={id:'activities',label:'Activités',run(c){generateWorldActivities(c.project,c.diagnostics);}};
/** One walkable network: optional links from every destination to the port, then reachability audit. */
const CIRCULATION:Stage={id:'circulation',label:'Réseau de circulation',run(c){
 if(c.requirements.circulation){const links=planCirculationLinks(c.project,terrainAccessContext(c.project));for(const path of links.paths)putPath(c.project,path);}
 c.diagnostics.push(...auditCirculation(c.project).map(d=>({severity:d.severity,code:d.code,message:d.message})));
}};
/** Reefs, blue holes and trench away from the port and surf breaks, then dive sites with discoveries. */
const DIVE:Stage={id:'dive',label:'Récifs et sites de plongée',run(c){
 const u=c.requirements.underwater;if(!u)return;
 c.diagnostics.push(...planBathymetry(c.project,u).diagnostics);
 if(u.diveSites)c.diagnostics.push(...planDiveSites(c.project).diagnostics);
}};
/** Land registry of everything placed so far; overlaps between incompatible uses are reported. */
const LAND:Stage={id:'land',label:'Occupation du sol',run(c){c.land=projectLandRegistry(c.project);c.diagnostics.push(...auditLandUse(c.project,c.land).map(d=>({severity:d.severity,code:d.code,message:d.message})));}};
const BIOMES:Stage={id:'biomes',label:'Biomes et régions',run(c){
 const r=c.requirements,project=c.project,planned=c.planned,field=c.field!;
 const recipes=c.recipes=planWorldBiomes(project,r,planned.axis,planned.provinces);
 if(r.biomeMode==='custom'&&c.profile.version===1)for(const [i,kind]of r.sequence.entries()){
  const at=planned.axis[Math.min(planned.axis.length-1,Math.round((i+.5)/r.sequence.length*planned.axis.length*RIVER_BIOME_SPAN))],altitude=field.height(at.x,at.z);
  if((kind==='marsh'&&altitude>25)||(kind==='coast'&&field.coast(at.x,at.z)>200))c.diagnostics.push({severity:r.landscapes.some(l=>l.kind===kind&&l.required)?'ERROR':'WARNING',code:'SEQUENCE_INCOMPATIBLE',message:LANDSCAPES[kind]+' demandé trop en amont : déplacer ce paysage vers l’aval ou ajuster le relief.'});
 }
 if(c.profile.provinces&&r.biomeMode==='custom')for(const province of planned.provinces){
  if(province.station===undefined)continue;
  const kind=r.sequence[province.station],env=provinceEnvironment(project,province,planned.axis);
  if((kind==='marsh'&&env.altitudeM>35)||(kind==='coast'&&env.coastM>220))c.diagnostics.push({severity:r.landscapes.some(l=>l.kind===kind&&l.required)?'ERROR':'WARNING',code:'SEQUENCE_INCOMPATIBLE',message:LANDSCAPES[kind]+' incompatible avec cet étage du relief : modifier la succession ou choisir une autre graine.'});
 }
 for(let i=0;i<recipes.length;i+=16)applyRegionBatch(project,recipes.slice(i,i+16));
 alignSteppedBiomes(project);alignNaturalBiomes(project);
}};
/** Complete ski domain on the reshaped massif, after biomes so snow masks follow the new relief. */
const RESORT:Stage={id:'resort',label:'Domaine skiable',run(c){
 if(!c.requirements.activities?.skiResort)return;
 const village=c.project.libraries.settlements?.['composition-welcome-village'],entries=village?.buildings.map(b=>b.entry)??[];
 const toward=entries.length?{x:entries.reduce((s,q)=>s+q.x,0)/entries.length,z:entries.reduce((s,q)=>s+q.z,0)/entries.length}:undefined;
 const altitude=c.requirements.islandStyle?.altitudeM??c.natural?.maxAltitudeM??400;
 try{planSkiResortActivity(c.project,{toward,shaping:resortShaping(altitude)});}
 catch(e){c.diagnostics.push({severity:'ERROR',code:'ACTIVITY_RESORT_MISSING',message:'Domaine skiable impossible : '+(e instanceof Error?e.message:String(e))});}
}};
/** Activity hosts, composed dialogues and quests built from what really exists (doc 104 §C7). */
const STORIES:Stage={id:'stories',label:'Hôtes, dialogues et quêtes',run(c){
 if(!c.requirements.stories)return;
 c.diagnostics.push(...planActivityStories(c.project,{locale:c.requirements.locale}).diagnostics);
}};
const AUDIT:Stage={id:'audit',label:'Contrôle des demandes',run(c){
 const r=c.requirements,natural=c.natural=c.profile.natural?naturalQuality(c.project):undefined,recipes=c.recipes!;
 for(const l of r.landscapes){
  if(l.kind==='lake')continue;
  if(natural?(natural.biomeShare[l.kind]??0)<.001:!recipes.some(recipe=>recipe.name===LANDSCAPES[l.kind]))c.diagnostics.push({severity:l.required?'ERROR':'WARNING',code:'LANDSCAPE_MISSING',message:'Paysage absent ou de surface insuffisante : '+LANDSCAPES[l.kind]});
 }
 if(c.profile.natural&&r.islandStyle?.model==='caldera'&&r.type!=='archipelago')c.diagnostics.push({severity:'ERROR',code:'STYLE_TYPE',message:'La caldera fragmentée nécessite le type Archipel.'});
 if(c.profile.natural&&r.biomeMode==='custom')c.diagnostics.push({severity:'WARNING',code:'ENVIRONMENTAL_SEQUENCE',message:'La succession est une préférence par altitude sur les versants ; les milieux incompatibles avec le terrain ne sont pas imposés.'});
 c.diagnostics.push(...validateBirthPort(c.project));
 // Same activity checks as the compiler preflight: a composition is never 'ready' if it cannot compile.
 if(c.profile.complete)c.diagnostics.push(...validateWorldActivities(c.project).filter(d=>!c.diagnostics.some(x=>x.code===d.code&&x.message===d.message)));
}};
const NORMALIZE:Stage={id:'normalize',label:'Normalisation et couverture',run(c){
 c.normalized=parseProject(JSON.parse(JSON.stringify(c.project)));
 c.coverage=c.profile.provinces?compositionCoverage(c.normalized,c.planned.axis):undefined;
}};
/** The ordered composition pipeline. Extend by inserting stages, never by branching inside composeWorld. */
export const COMPOSITION_STAGES:readonly Stage[]=[SHAPE,SEABED,SITES,HYDRO,ACCESS,SETTLEMENTS,POLES,ACTIVITIES,DIVE,BIOMES,RESORT,CIRCULATION,LAND,STORIES,AUDIT,NORMALIZE];

export function composeWorld(input:MapRequirements,name='Mon petit monde',identity?:{projectId:string;worldId:string},stages:readonly Stage[]=COMPOSITION_STAGES):WorldComposition {
 const started=performance.now(),requirements=validateMapRequirements(input);
 const c=runStages(stages,{requirements,profile:compositionProfile(requirements),name,identity,diagnostics:[],stages:[]} as unknown as CompositionContext);
 const project=c.normalized??c.project;
 return {project,ready:!c.diagnostics.some(d=>d.severity==='ERROR'),diagnostics:c.diagnostics,family:c.planned.family,stages:c.stages,
  metrics:{generationMs:performance.now()-started,features:archipelagoFeatures(c)?.length??c.planned.terrain.features.length,sectors:Object.keys(c.project.chunks).length,surveyCells:c.hydro?.survey.sampled??0,sourceBytes:new TextEncoder().encode(JSON.stringify(c.project)).length,...(c.coverage?{coverage:c.coverage}:{}),...(c.natural?{natural:c.natural}:{})}};
}
/** Exact already-previewed source: never rerun the generator on confirmation. */
export function projectFromComposition(plan:WorldComposition,name:string):ProjectDocument {
 if(!plan.ready)throw Error('Composition incomplète : corriger les critères non satisfaits');
 if(!name.trim()||name.trim().length>100)throw Error('Nom du projet : 1 à 100 caractères');
 const p=structuredClone(plan.project);p.manifest.name=name.trim();return parseProject(p);
}
