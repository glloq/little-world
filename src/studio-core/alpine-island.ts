import {selectIslandStyle} from './island-styles.ts';
import {newIslandRequirements} from './map-requirements.ts';
import {composeWorld} from './world-composition.ts';
import {projectGeography} from './geo-context.ts';
import {putAuthoredRace} from './race-authoring.ts';
import {raceFromSkiArea} from './ski-race.ts';

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
 if((project.libraries.settlements?.['composition-welcome-village']?.buildings.length??0)<4)
  throw Error('Île des Cimes : le hameau maritime est incomplet.');
 const area=project.libraries.alpine?.['composition-alpine'];
 if(!area)throw Error('Île des Cimes : piste de ski absente.');
 putAuthoredRace(project,raceFromSkiArea(project.world,area,projectGeography(project).ctx.height));
 return project;
}
