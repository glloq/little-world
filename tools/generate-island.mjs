/** B1 island 3 × 8 km — first populated production (World Production V1, WP-6).
 * Composition (north = +Z): volcanic north (volcano, crater, basalt fields, high cliffs, deep
 * valleys), central massifs (forests, rivers, a waterfall gorge, a lake basin, ruins, a mine),
 * southern plains (main village, hamlets, fields, marsh, estuary, beaches, natural harbour).
 * Everything is re-editable authoring data: archipelago shapes + landscape presets + a few
 * remarkable places and routes; vegetation stays procedural (biotopes + seed + cell).
 * Writes maps/island.project.json and the compiled world public/maps/island/.
 * Usage: npm run generate:island */
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

export const ISLAND={width:3000,length:8000,seed:4242};
const P=(x,z)=>({x,z});
export function islandArchipelago(){
  return {seabedDepthM:45,detailM:2.5,
    landmasses:[
      {id:'main',name:'Île du volcan',outline:[P(-260,3640),P(320,3600),P(760,3380),P(1060,2900),P(1180,2200),P(1150,1500),P(1230,800),P(1190,100),P(1250,-600),P(1220,-1300),P(1280,-2000),P(1180,-2700),P(920,-3250),P(520,-3560),P(0,-3660),P(-520,-3560),P(-920,-3260),P(-1200,-2700),P(-1300,-2000),P(-1240,-1300),P(-1300,-600),P(-1260,100),P(-1230,800),P(-1300,1500),P(-1220,2200),P(-1050,2900),P(-740,3380)],
        coastNoiseM:120,coastWavelengthM:900,beachWidthM:70,shoreHeightM:3,lowlandHeightM:10,hillHeightM:6,cliffs:.42},
      {id:'islet-ne',name:'Îlot du nord-est',outline:blobOutline(1180,3480,170,120,12,1.3),coastNoiseM:20,coastWavelengthM:200,beachWidthM:20,shoreHeightM:3,lowlandHeightM:10,hillHeightM:8,cliffs:.8},
      {id:'islet-sw',name:'Îlot des sables',outline:blobOutline(-1220,-3560,200,130,12,2.1),coastNoiseM:18,coastWavelengthM:220,beachWidthM:45,shoreHeightM:2,lowlandHeightM:4,hillHeightM:3,cliffs:.1},
    ],
    features:[
      {id:'volcano',kind:'volcano',x:-120,z:2650,radiusM:1150,heightM:540,craterRadiusM:120,craterDepthM:55},
      {id:'north-ridge',kind:'ridge',points:[P(250,2900),P(650,3150),P(950,3250)],widthM:260,heightM:90},
      {id:'north-valley-w',kind:'valley',points:[P(-450,2400),P(-750,2900),P(-950,3300)],widthM:220,depthM:45},
      {id:'massif-west',kind:'mountain',x:-650,z:1050,radiusM:640,heightM:240,roughness:.3},
      {id:'massif-east',kind:'mountain',x:700,z:1350,radiusM:540,heightM:190,roughness:.5},
      {id:'central-ridge',kind:'ridge',points:[P(-650,1050),P(0,1500),P(700,1350)],widthM:300,heightM:70},
      {id:'central-valley',kind:'valley',points:[P(0,1350),P(150,700),P(350,0),P(650,-700),P(1000,-1150)],widthM:300,depthM:14},
      {id:'south-hills',kind:'hill',x:450,z:-1800,radiusM:520,heightM:28,roughness:.3},
      {id:'west-hills',kind:'hill',x:-850,z:-200,radiusM:460,heightM:34,roughness:.35},
      {id:'estuary',kind:'valley',points:[P(150,-2100),P(250,-2700),P(320,-3300),P(380,-3800)],widthM:240,depthM:10},
    ]};
}
/** [preset, centre, [width, length], rotation, params] — composition of the B1 island. */
export const ISLAND_LANDSCAPES=[
  // North — volcanic highlands, cliffs.
  ['volcanic-field',P(-150,2150),[1000,700],0,{flows:4}],
  ['volcanic-field',P(500,3150),[600,420],.3,{flows:3,cone:true}],
  ['rocky-cliff',P(-350,3480),[900,260],0,{height:60}],
  ['mountain-pass',P(380,2050),[700,520],-.4,{height:120}],
  // Centre — forests, rivers, gorge, lake basin, ruins.
  ['forest-valley',P(-700,350),[620,1000],.1,{depth:18,stream:true}],
  ['forest-valley',P(720,950),[500,820],-.15,{depth:16,stream:true}],
  ['waterfall-gorge',P(-300,1650),[280,560],0,{drop:18}],
  ['waterfall-gorge',P(900,1900),[280,560],.3,{drop:18}],
  ['river-bend',P(260,250),[420,700],.35,{riverWidth:7,bridge:true}],
  ['marsh-basin',P(80,750),[420,380],0,{ponds:3,depth:4}],
  ['ancient-ruins',P(-980,1350),[150,150],.5,{walls:3}],
  ['ancient-ruins',P(1020,1450),[140,140],-.3,{walls:2}],
  ['ancient-ruins',P(-250,-700),[130,130],0,{walls:2}],
  // South — village, hamlets, fields, marsh, estuary, beaches.
  ['village-clearing',P(-80,-1550),[440,420],0,{houses:8,fields:true,windmill:true,orchard:true}],
  ['village-clearing',P(-780,-950),[260,260],.4,{houses:3,fields:true,windmill:false,orchard:true}],
  ['village-clearing',P(780,-2650),[260,260],-.3,{houses:3,fields:false,windmill:false,orchard:false}],
  ['marsh-basin',P(-620,-2350),[520,460],0,{ponds:3,depth:3}],
  ['river-bend',P(280,-2800),[380,760],.1,{riverWidth:9,bridge:true}],
  ['sandy-beach',P(-120,-3560),[1000,260],0,{dunes:40}],
  ['sandy-beach',P(-1230,-1600),[700,220],Math.PI/2,{dunes:30}],
  ['sandy-beach',P(1210,-1200),[600,200],-Math.PI/2,{dunes:24}],
  ['sandy-beach',P(-1220,-3560),[380,240],0,{dunes:20,palms:true}],
  ['rocky-cliff',P(1180,900),[700,240],Math.PI/2,{height:45}],
  ['rocky-cliff',P(-1240,1500),[700,240],-Math.PI/2,{height:50}],
];
export const ISLAND_PLACES={volcano:P(-120,2650),village:P(-80,-1550),harbour:P(150,-3420),mine:P(-420,1180),lake:P(80,750),falls:P(-300,1650),beach:P(-120,-3500),forest:P(-700,350),cliff:P(1150,900),marsh:P(-620,-2350)};
export function buildIsland(){
  const {width,length,seed}=ISLAND;
  const p=createProject({name:'Île du volcan',width,length,seed,projectId:'little-world-island-authoring',worldId:'little-world-island',terrain:{kind:'archipelago',version:1,archipelago:islandArchipelago()}});
  p.world.environment=defaultEnvironment(seed);
  const reports=ISLAND_LANDSCAPES.map(([presetId,center,[w,l],rotation,params])=>applyLandscape(p,newLandscape(p,presetId,center,{width:w,length:l,rotation,params})));
  const place=(id,name,assetId,x,z,ry=0,y=0)=>{const def=assetDefinitionFor(assetId);if(def&&!p.assets[assetId])p.assets[assetId]=def;
    putEntity(p,{id,name,kind:assetId.startsWith('architecture.')?'building':'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y,z},rotation:{x:0,y:Math.sin(ry/2),z:0,w:Math.cos(ry/2)},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId}}});};
  const {ctx}=projectGeography(p),sea=p.world.seaLevel;
  // Natural harbour: a dock line from the south beach into the bay, lighthouses on two capes.
  const hx=ISLAND_PLACES.harbour.x;let hz=-3300;for(let z=-3300;z>-3800;z-=2)if(ctx.height(hx,z)<sea-.8){hz=z;break;}
  for(let i=0;i<8;i++){const z=hz+8-i*2;place(`island-dock-${i+1}`,`Ponton du port ${i+1}`,'structure.dock_tile',hx,z,0,Math.max(0,sea-ctx.height(hx,z)+.2));}
  place('island-lighthouse-south','Phare du cap sud','architecture.lighthouse',900,-3180,.8);
  place('island-lighthouse-north','Phare du cap nord','architecture.lighthouse',980,2880,-.6);
  // Mine at the foot of the western massif (MINE contract: reserved zone), entrance posts.
  const m=ISLAND_PLACES.mine;
  putZone(p,{id:'island-mine',kind:'mine',name:'Mine du massif ouest',polygon:[P(m.x-30,m.z-25),P(m.x+30,m.z-28),P(m.x+34,m.z+25),P(m.x-28,m.z+28)],levels:4});
  place('island-mine-post-l','Poteau d’entrée de mine','structure.post_rustic',m.x-8,m.z-30);place('island-mine-post-r','Poteau d’entrée de mine','structure.post_rustic',m.x+8,m.z-31);
  // Main routes: village → forest → mine; village → fields/hamlet; village → harbour; village → east hamlet.
  putPath(p,{id:'route-village-mine',points:[P(-80,-1550),P(-200,-1000),P(-420,-400),P(-600,250),P(-560,800),P(-430,1150)],width:3,kind:'dirt',smooth:true});
  putPath(p,{id:'route-village-hamlet-w',points:[P(-80,-1550),P(-420,-1250),P(-780,-950)],width:2.5,kind:'dirt',smooth:true});
  putPath(p,{id:'route-village-harbour',points:[P(-80,-1550),P(0,-2300),P(100,-3000),P(150,-3380)],width:3,kind:'dirt',smooth:true});
  putPath(p,{id:'route-village-hamlet-e',points:[P(-80,-1550),P(350,-2100),P(780,-2650)],width:2.5,kind:'trail',smooth:true});
  putPath(p,{id:'route-ruins-centre',points:[P(-420,-400),P(-250,-700)],width:2,kind:'trail',smooth:true});
  putPath(p,{id:'route-lake-volcano',points:[P(-560,800),P(-100,700),P(80,750),P(150,1200),P(250,1700),P(150,2100)],width:2,kind:'trail',smooth:true});
  return {project:parseProject(p),reports};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const {project,reports}=buildIsland();
  for(const r of reports)if(r.diagnostics.length)console.warn(r.instanceId,r.diagnostics);
  await writeFile(new URL('../maps/island.project.json',import.meta.url),JSON.stringify(project,null,1)+'\n');
  const result=await compileProjectToDirectory(project,new URL('../public/maps/island',import.meta.url).pathname);
  console.log(JSON.stringify({worldId:result.manifest.worldId,buildVersion:result.manifest.buildVersion,landscapes:Object.keys(project.libraries.landscapes).length,features:project.world.terrain.archipelago.features.length,entities:Object.keys(project.entityIndex).length,water:Object.keys(project.libraries.water).length,paths:Object.keys(project.libraries.paths).length,zones:Object.keys(project.libraries.zones).length,authoredChunks:result.manifest.chunks.length,payloadBytes:result.manifest.chunks.reduce((s,c)=>s+c.byteLength,0)},null,1));
}
