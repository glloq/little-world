import {selectIslandStyle} from './island-styles.ts';
import {newIslandRequirements} from './map-requirements.ts';
import {composeWorld} from './world-composition.ts';

export const HARVEST_ISLAND={projectId:'little-world-harvest-island-authoring',worldId:'little-world-harvest-island',name:'Île des Moissons'};

export function buildHarvestIsland(){
 const base=selectIslandStyle(newIslandRequirements(),'gentle');
 const composition=composeWorld({
  ...base,width:2700,length:2200,seed:4242,welcomeVillage:'village',welcomeActivity:'agriculture',
  activities:{races:'flat',ski:false,music:'contextual'},
 },HARVEST_ISLAND.name,{projectId:HARVEST_ISLAND.projectId,worldId:HARVEST_ISLAND.worldId});
 if(!composition.ready){
  throw Error('Île des Moissons : '+composition.diagnostics.filter(d=>d.severity==='ERROR').map(d=>d.message).join(' · '));
 }
 const {project}=composition,village=project.libraries.settlements?.['composition-welcome-village'];
 const fields=Object.values(project.libraries.zones??{}).filter(zone=>zone.kind==='farm-plot');
 if(!village?.amenities?.some(amenity=>amenity.role==='mill')||
   !fields.some(field=>field.farm?.assignment==='player')||!fields.some(field=>field.farm?.assignment==='npc'))
  throw Error('Île des Moissons : moulin et parcelles du joueur et des habitants requis.');
 return project;
}
