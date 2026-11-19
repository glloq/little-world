/** Dedicated, static Little World surf island source. Source geometry is first-class Studio
 * V3 data, not a runtime toggle or hand-drawn screenshot. Production builds compile
 * this deterministic island for Pages without modifying existing volcano/forest islands.
 *
 * Usage: node --experimental-strip-types tools/generate-surf-island.mjs [dist]
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {blobOutline} from '../src/geography/archipelago-params.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {generateBirthPort} from '../src/studio-core/birth-port.ts';
import {projectRaceTerrainEnvironment} from '../src/studio-core/race-terrain-context.ts';
import {planThreeSurfBeaches} from '../src/surf/surf-island-planner.ts';
import {putAuthoredRace} from '../src/studio-core/race-authoring.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

export const SURF_ISLAND={worldId:'little-world-surf-island',islandId:'surf-island',
 projectId:'little-world-surf-island-authoring',name:'Île des trois vagues',
 width:1800,length:1600,seed:42811};
export function buildSurfIsland(){
 const C=SURF_ISLAND;
 const archipelago={
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
 const env=projectRaceTerrainEnvironment(p),portShield=(x,z)=>
  Math.hypot(x-port.shore.x,z-port.shore.z)<135?'port maritime réservé':env.occupation(x,z);
 const plan=planThreeSurfBeaches(env.height,p.world.bounds,p.world.seaLevel,C.seed,C.worldId,portShield);
 if(plan.beaches.length!==3)throw Error('Île Surf : trois plages sûres requises ; '+plan.warnings.join(' ; '));
 p.libraries.surfZones=Object.fromEntries(plan.beaches.map(b=>[b.zone.id,b.zone]));
 p.libraries.surfFeatures=Object.fromEntries(plan.beaches.flatMap(b=>b.features.map(f=>[f.id,f])));
 for(const b of plan.beaches)putAuthoredRace(p,b.gates);
 const project=parseProject(p);
 return {project,port,plan};
}
async function main(){
 const root=resolve(process.argv[2]??'dist');
 const output=join(root,'archipelago/worlds/surf-island');
 const {project,port,plan}=buildSurfIsland();
 const compile=await compileProjectToDirectory(project,output);
 // A copy of the actual authored source is retained for Studio import and diagnostics.
 const report={schemaVersion:1,worldId:SURF_ISLAND.worldId,
  beaches:plan.beaches.map(b=>({name:b.name,zone:b.zone.id,spawn:b.start,
   gates:b.gates.gates.length,features:b.features.length})),
  port:{shore:port.shore,boat:port.boat,trade:port.trade},
  chunks:compile.manifest.chunks.length,sourceHash:compile.manifest.sourceHash};
 await mkdir(output,{recursive:true});
 await writeFile(join(output,'surf-layout.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Île Surf publiée : '+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 await main();
