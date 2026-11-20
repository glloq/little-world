import {selectIslandStyle} from './island-styles.ts';
import {newIslandRequirements} from './map-requirements.ts';
import {composeWorld} from './world-composition.ts';
import {projectGeography} from './geo-context.ts';
import {putAuthoredRace} from './race-authoring.ts';
import {raceFromSkiArea} from './ski-race.ts';
import {addAlpineStation} from './alpine-station.ts';

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
 const area=project.libraries.alpine?.['composition-alpine'];
 if(!area)throw Error('Île des Cimes : piste de ski absente.');
 area.groomed=true;
 const race=raceFromSkiArea(project.world,area,projectGeography(project).ctx.height);
 putAuthoredRace(project,race);
 addAlpineStation(project,area);
 const questKey='quest:cimes-premiere-descente';
 project.libraries.questCatalog={
  ...project.libraries.questCatalog,
  [questKey]:{
   questKey,templateId:'cimes:premiere-descente',templateVersion:1,
   islandId:project.world.worldId,giverId:host.id,
   bindings:{title:'Première descente aux Cimes',
    instruction:'Montez au sommet avec le télésiège, ouvrez Courses et lancez le Chrono des Cimes. Franchissez toutes les portes en glisse.'},
   steps:[{kind:'race',raceId:race.id,islandId:project.world.worldId}],
   rewards:[{kind:'coins',quantity:8}],
   dependencies:[host.id,race.id],catalogRevision:'cimes-v1',
   proof:{capabilityIds:[host.id,race.id],validatorVersion:'world-activities-v1'},
  },
 };
 return project;
}
