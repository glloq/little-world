import {selectIslandStyle} from './island-styles.ts';
import {newIslandRequirements} from './map-requirements.ts';
import {CROPS} from '../farm/farm-data.ts';
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
 const field=fields.find(zone=>zone.farm?.assignment==='player'&&zone.farm.crops.includes('carrot'));
 const host=village?.amenities?.find(amenity=>amenity.role==='host');
 if(!village?.amenities?.some(amenity=>amenity.role==='mill')||
   !field||!host||!fields.some(field=>field.farm?.assignment==='npc'))
  throw Error('Île des Moissons : moulin et parcelles du joueur et des habitants requis.');
 const questKey='quest:moissons-premiere-recolte',islandId=project.world.worldId,itemId=CROPS.carrot.itemId;
 project.libraries.questCatalog={
  ...project.libraries.questCatalog,
  [questKey]:{
   questKey,templateId:'moissons:premiere-recolte',templateVersion:1,islandId,giverId:host.id,
   bindings:{title:'Les premières carottes',farmPlotId:field.id,
    instruction:'Semez des carottes dans votre parcelle, arrosez-les et récoltez-les à maturité. Apportez une carotte à l’habitant du village.'},
   steps:[{kind:'acquire',itemId,quantity:1,source:'farm',fromIslandId:islandId},
    {kind:'deliver',itemId,quantity:1,giverId:host.id,islandId}],
   rewards:[{kind:'coins',quantity:6}],
   dependencies:[host.id,field.id,itemId],catalogRevision:'moissons-v1',
   proof:{capabilityIds:[host.id,field.id,itemId],validatorVersion:'world-activities-v1'},
  },
 };
 return project;
}
