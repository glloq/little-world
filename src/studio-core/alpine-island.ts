import {selectIslandStyle} from './island-styles.ts';
import {newIslandRequirements} from './map-requirements.ts';
import {composeWorld} from './world-composition.ts';
import {planSkiResortActivity} from './activity-planners.ts';

/** Monotone reshaping above 190 m: gentler upper slopes for skiing, river and port untouched. */
export const CIMES_SHAPING={fromM:190,rangeM:460,scale:.45,power:1} as const;
export const ALPINE_ISLAND={projectId:'little-world-alpine-island-authoring',worldId:'little-world-alpine-island',name:'Île des Cimes'};

export function buildAlpineIsland(){
 const base=selectIslandStyle(newIslandRequirements(),'central-massif');
 const composition=composeWorld({
  ...base,seed:4243,rivers:1,
  islandStyle:{...base.islandStyle!,altitudeM:650,valleys:.15},
  activities:{races:'downhill',ski:true,music:'contextual'},
 },ALPINE_ISLAND.name,{projectId:ALPINE_ISLAND.projectId,worldId:ALPINE_ISLAND.worldId});
 if(!composition.ready){
  throw Error('Île des Cimes : '+composition.diagnostics.filter(d=>d.severity==='ERROR').map(d=>d.message).join(' · '));
 }
 const {project}=composition;
 const village=project.libraries.settlements?.['composition-welcome-village'];
 if(!village||village.buildings.length<4)
  throw Error('Île des Cimes : le hameau maritime est incomplet.');
 const host=village.amenities?.find(amenity=>amenity.role==='host');
 if(!host)throw Error('Île des Cimes : habitant du port absent.');
 // The composed prototype run is replaced by a complete ski domain on a reshaped massif.
 const entries=village.buildings.map(b=>b.entry);
 const toward=entries.length?{x:entries.reduce((s,q)=>s+q.x,0)/entries.length,z:entries.reduce((s,q)=>s+q.z,0)/entries.length}:undefined;
 const {race}=planSkiResortActivity(project,{toward,shaping:CIMES_SHAPING});
 const questKey='quest:cimes-premiere-descente';
 project.libraries.questCatalog={
  ...project.libraries.questCatalog,
  [questKey]:{
   questKey,templateId:'cimes:premiere-descente',templateVersion:1,
   islandId:project.world.worldId,giverId:host.id,
   bindings:{title:'Première descente aux Cimes',
    instruction:'Achetez des skis ou un snowboard au chalet, montez avec la télécabine des Cimes, ouvrez Courses et choisissez le chrono. Suivez les portes et gardez de la vitesse sur les deux sauts.'},
   steps:[{kind:'race',raceId:race.id,islandId:project.world.worldId}],
   rewards:[{kind:'coins',quantity:8}],
   dependencies:[host.id,race.id],catalogRevision:'cimes-v1',
   proof:{capabilityIds:[host.id,race.id],validatorVersion:'world-activities-v1'},
  },
 };
 return project;
}
