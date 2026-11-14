/** World Production V1 — reference region (WP-5): a ≈ 1 km² island assembled ONLY with the
 * production tools (archipelago relief + landscape presets + registry assets), distinct from
 * the final map. It shows: varied forest, clearing, meadow, valley, stream, waterfall (WATER
 * explicit falls), lake/pool, cliff, beach, transition to a rocky zone, a small village, a
 * bridge, paths, a mine entrance, a farm plot and models of the merged asset branch.
 * Writes maps/production-reference.project.json, its Studio copy and the compiled world
 * public/maps/production-reference/. Usage: npm run generate:production-reference */
import {writeFile} from 'node:fs/promises';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity,putPath} from '../src/studio-core/source.ts';
import {putZone} from '../src/studio-core/zones.ts';
import {blobOutline} from '../src/geography/archipelago-params.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {applyLandscape,newLandscape} from '../src/world-production/landscapes.ts';
import {assetDefinitionFor} from '../src/world-production/registry.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

export const PRODUCTION_REFERENCE={width:1400,length:1400,seed:9031};
/** Landscape instances of the reference region: [preset, centre, size, rotation, params]. */
export const REFERENCE_LANDSCAPES=[
  ['forest-valley',{x:-260,z:200},[340,520],.15,{stream:false,clearings:3,depth:10}],
  ['waterfall-gorge',{x:140,z:300},[220,360],0,{drop:14}],
  ['river-bend',{x:140,z:20},[260,260],0,{riverWidth:6,bridge:true}],
  ['marsh-basin',{x:-230,z:-380},[240,220],0,{ponds:2,depth:3}],
  ['village-clearing',{x:-60,z:-170},[260,240],0,{houses:5,fields:true,windmill:true,orchard:true}],
  ['sandy-beach',{x:-430,z:-170},[420,180],Math.PI/2,{dunes:30,palms:false}],
  ['rocky-cliff',{x:430,z:-60},[300,200],Math.PI/2,{height:30}],
  ['ancient-ruins',{x:-120,z:120},[130,130],.4,{walls:2}],
];
export const REFERENCE_VIEWS={volcano:null,forest:{x:-260,z:200},valley:{x:-250,z:120},river:{x:140,z:20},cliff:{x:430,z:-60},coast:{x:-420,z:-170},village:{x:-60,z:-170},falls:{x:140,z:300},mine:{x:330,z:300}};
export function productionReferenceArchipelago(){
  return {seabedDepthM:30,detailM:2,
    landmasses:[{id:'main',name:'Île de référence World Production',outline:blobOutline(-20,40,560,560,26,.5),coastNoiseM:28,coastWavelengthM:320,beachWidthM:60,shoreHeightM:2,lowlandHeightM:5,hillHeightM:5,cliffs:.4}],
    features:[
      {id:'north-highland',kind:'mountain',x:-20,z:430,radiusM:420,heightM:62,roughness:.45},
      {id:'east-ridge',kind:'ridge',points:[{x:330,z:420},{x:400,z:180},{x:420,z:-40}],widthM:120,heightM:26},
    ]};
}
export function buildProductionReference(){
  const {width,length,seed}=PRODUCTION_REFERENCE;
  const p=createProject({name:'Scène de référence World Production',width,length,seed,projectId:'little-world-production-reference-authoring',worldId:'little-world-production-reference',terrain:{kind:'archipelago',version:1,archipelago:productionReferenceArchipelago()}});
  p.world.environment=defaultEnvironment(seed);
  const reports=[];
  for(const [presetId,center,[w,l],rotation,params]of REFERENCE_LANDSCAPES){
    const inst=newLandscape(p,presetId,center,{width:w,length:l,rotation,params});reports.push(applyLandscape(p,inst));
  }
  // Remarkable places and links that no preset owns (manual authoring, like in the Studio).
  const place=(id,name,assetId,x,z,ry=0,y=0)=>{const def=assetDefinitionFor(assetId);if(def&&!p.assets[assetId])p.assets[assetId]=def;
    putEntity(p,{id,name,kind:assetId.startsWith('architecture.')?'building':'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y,z},rotation:{x:0,y:Math.sin(ry/2),z:0,w:Math.cos(ry/2)},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId}}});};
  const {ctx}=projectGeography(p);
  // Lighthouse on the cliff headland, small dock at the beach.
  place('ref-lighthouse','Phare du cap','architecture.lighthouse',470,-120,.6);
  const sea=p.world.seaLevel;let dockX=-420;for(let x=-420;x>-640;x-=2)if(ctx.height(x,-170)<sea-.6){dockX=x;break;}
  for(let i=0;i<6;i++)place(`ref-dock-${i+1}`,`Ponton ${i+1}`,'structure.dock_tile',dockX+6-i*2,-170,Math.PI/2,Math.max(0,sea-ctx.height(dockX+6-i*2,-170)+.2));
  // Mine entrance at the foot of the east ridge (reserved zone, MINE contract) + path from the village.
  putZone(p,{id:'ref-mine',kind:'mine',name:'Entrée de la mine',polygon:[{x:300,z:280},{x:350,z:275},{x:355,z:320},{x:305,z:325}],levels:3});
  place('ref-mine-post-l','Poteau d’entrée de mine','structure.post_rustic',318,276);place('ref-mine-post-r','Poteau d’entrée de mine','structure.post_rustic',334,274);
  putPath(p,{id:'ref-path-mine',points:[{x:-60,z:-170},{x:40,z:-60},{x:200,z:120},{x:300,z:240},{x:325,z:272}],width:2.5,kind:'trail',smooth:true});
  putPath(p,{id:'ref-path-beach',points:[{x:-60,z:-170},{x:-250,z:-150},{x:-400,z:-170}],width:2.5,kind:'dirt',smooth:true});
  putPath(p,{id:'ref-path-ruins',points:[{x:-60,z:-170},{x:-90,z:-20},{x:-120,z:110}],width:2,kind:'trail',smooth:true});
  // Wooden arch bridge where the mine trail crosses the river-bend corridor is provided by the
  // river-bend preset (stone bridge); a watermill stands on the river bank.
  place('ref-watermill','Moulin à eau','architecture.watermill_log_stone',205,-20,-1.2);
  return {project:parseProject(p),reports};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const {project,reports}=buildProductionReference();
  for(const r of reports)if(r.diagnostics.length)console.warn(r.instanceId,r.diagnostics);
  await writeFile(new URL('../maps/production-reference.project.json',import.meta.url),JSON.stringify(project,null,1)+'\n');
  await writeFile(new URL('../public/maps/production-reference.project.json',import.meta.url),JSON.stringify(project)+'\n');
  const result=await compileProjectToDirectory(project,new URL('../public/maps/production-reference',import.meta.url).pathname);
  console.log(JSON.stringify({worldId:result.manifest.worldId,landscapes:Object.keys(project.libraries.landscapes).length,entities:Object.keys(project.entityIndex).length,water:Object.keys(project.libraries.water).length,paths:Object.keys(project.libraries.paths).length,authoredChunks:result.manifest.chunks.length,written:result.written},null,1));
}
