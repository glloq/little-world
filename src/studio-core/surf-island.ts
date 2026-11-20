import {createProject,parseProject} from './schema.ts';
import {blobOutline} from '../geography/archipelago-params.ts';
import {defaultEnvironment} from '../environment/climate.ts';
import {generateBirthPort} from './birth-port.ts';
import type {ArchipelagoParams} from '../geography/archipelago.ts';
import {generateWelcomeVillage} from './welcome-village.ts';
import {planSurfActivity} from './activity-planners.ts';

export const SURF_ISLAND={worldId:'little-world-surf-island',islandId:'surf-island',
 projectId:'little-world-surf-island-authoring',name:'Île des trois vagues',
 width:1800,length:1600,seed:42811};
export function buildSurfIsland(){
 const C=SURF_ISLAND;
 const archipelago:ArchipelagoParams={
  seabedDepthM:36,detailM:2.5,
  landmasses:[{
   id:'surf-atoll',name:'Île des trois vagues',
   outline:blobOutline(0,0,520,425,24,1.07),
   coastNoiseM:17,coastWavelengthM:340,
   beachWidthM:72,shoreHeightM:1.8,lowlandHeightM:9,
   hillHeightM:24,cliffs:.07
  }],
  features:[
   {id:'surf-summit',kind:'hill',x:0,z:0,radiusM:255,heightM:63,roughness:.12},
   {id:'surf-wood',kind:'hill',x:-155,z:100,radiusM:140,heightM:23,roughness:.18}
  ]
 };
 const p=createProject({name:C.name,width:C.width,length:C.length,seed:C.seed,
  projectId:C.projectId,worldId:C.worldId,chunkSizeM:96,density:.72,viewDistance:300,
  terrain:{kind:'archipelago',version:1,archipelago}});
 p.world.environment=defaultEnvironment(C.seed);
 const port=generateBirthPort(p);
 if(!port)throw Error('Île Surf : aucun quai N1 réel réalisable dans la baie calme');
 const homes=generateWelcomeVillage(p,port,'hamlet');
 if(homes<4)throw Error('Île Surf : le village du port doit contenir au moins quatre maisons.');
 const {plan,giverId}=planSurfActivity(p,port,C.seed);
 if(plan.beaches.length!==3||!giverId)throw Error('Île Surf : trois plages sûres requises ; '+plan.warnings.join(' ; '));
 const questKey='quest:trois-vagues-chronos',raceIds=plan.beaches.map(beach=>beach.gates.id);
 p.libraries.questCatalog={
  ...p.libraries.questCatalog,
  [questKey]:{
   questKey,templateId:'surf:trois-chronos',templateVersion:1,islandId:C.worldId,giverId,
   bindings:{title:'Les trois chronos de Céladon',
    instruction:'Depuis Courses, lancez puis terminez les parcours de surf A, B et C dans cet ordre. Le journal situe le prochain départ.'},
   steps:raceIds.map(raceId=>({kind:'race',raceId,islandId:C.worldId})),
   rewards:[{kind:'coins',quantity:18}],
   dependencies:[giverId,...raceIds],catalogRevision:'surf-v1',
   proof:{capabilityIds:[giverId,...raceIds],validatorVersion:'surf-beaches-v1'},
  },
 };
 const project=parseProject(p);
 return {project,port,plan,homes};
}

export function buildSurfProject(){return buildSurfIsland().project;}
