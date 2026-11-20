import {createProject,parseProject} from './schema.ts';
import {blobOutline} from '../geography/archipelago-params.ts';
import {defaultEnvironment} from '../environment/climate.ts';
import {generateBirthPort} from './birth-port.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';
import {planThreeSurfBeaches} from '../surf/surf-island-planner.ts';
import {putAuthoredRace} from './race-authoring.ts';
import type {ArchipelagoParams} from '../geography/archipelago.ts';
import {generateWelcomeVillage} from './welcome-village.ts';

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
 const env=projectRaceTerrainEnvironment(p),portShield=(x:number,z:number)=>
  Math.hypot(x-port.shore.x,z-port.shore.z)<135?'port maritime réservé':env.occupation(x,z);
 const plan=planThreeSurfBeaches(env.height,p.world.bounds,p.world.seaLevel,C.seed,C.worldId,portShield);
 if(plan.beaches.length!==3)throw Error('Île Surf : trois plages sûres requises ; '+plan.warnings.join(' ; '));
 p.libraries.surfZones=Object.fromEntries(plan.beaches.map(b=>[b.zone.id,b.zone]));
 p.libraries.surfFeatures=Object.fromEntries(plan.beaches.flatMap(b=>b.features.map(f=>[f.id,f])));
 for(const b of plan.beaches)putAuthoredRace(p,b.gates);
 const project=parseProject(p);
 return {project,port,plan,homes};
}
