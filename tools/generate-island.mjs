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
import {lightFor,colliderFor,assetDefinitionFor} from '../src/world-production/registry.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {classifyPoint} from '../src/geography/classify.ts';
import {ECONOMY_ITEMS} from '../src/gameplay/economy.ts';
import {roadsideSpots} from '../src/world-production/roadside.ts';
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
  // South — castle town, hamlets, ports, marsh, estuary, beaches.
  ['castle-town',P(-80,-1550),[380,380],0,{houses:40,cathedral:true}],
  ['village-clearing',P(-780,-950),[260,260],.4,{houses:3,fields:true,windmill:false,orchard:true}],
  ['village-clearing',P(780,-2650),[260,260],-.3,{houses:3,fields:true,windmill:true,orchard:false}],
  ['marsh-basin',P(-620,-2350),[520,460],0,{ponds:3,depth:3}],
  ['river-bend',P(280,-2800),[380,760],.1,{riverWidth:9,bridge:true}],
  ['sandy-beach',P(-120,-3560),[1000,260],0,{dunes:40}],
  ['sandy-beach',P(-1230,-1600),[700,220],Math.PI/2,{dunes:30}],
  ['sandy-beach',P(1210,-1200),[600,200],-Math.PI/2,{dunes:24}],
  ['sandy-beach',P(-1220,-3560),[380,240],0,{dunes:20,palms:true}],
  ['fishing-port',P(-330,-3540),[300,300],Math.PI,{houses:7}],
  ['fishing-port',P(1080,-1150),[260,260],-Math.PI/2,{houses:5}],
  ['rocky-cliff',P(1180,900),[700,240],Math.PI/2,{height:45}],
  ['rocky-cliff',P(-1240,1500),[700,240],-Math.PI/2,{height:50}],
  // Inhabited places of the centre and the north, camps at the resources.
  ['mine-camp',P(-430,1130),[160,160],0,{levels:4}],
  ['forest-camp',P(-560,120),[160,160],.2,{}],
  ['forest-camp',P(620,700),[160,160],-.4,{}],
  ['mountain-hamlet',P(-660,2080),[220,220],0,{houses:4}],
  ['mountain-hamlet',P(820,2260),[220,220],.5,{houses:3}],
  // Landmarks spread over the island (several hidden behind ridges or in valleys).
  ['landmark-site',P(-930,640),[120,120],0,{kind:0}],
  ['landmark-site',P(420,-560),[120,120],0,{kind:1}],
  ['landmark-site',P(-520,-2930),[120,120],.4,{kind:2}],
  ['landmark-site',P(-720,3150),[120,120],0,{kind:3,hermit:false}],
  ['landmark-site',P(1100,-2150),[120,120],-1.2,{kind:4}],
  ['landmark-site',P(1000,2700),[120,120],0,{kind:5}],
  ['landmark-site',P(-300,2050),[120,120],0,{kind:6}],
  ['landmark-site',P(-1000,-300),[120,120],0,{kind:5,hermit:false}],
  // Woods with a clearing and a hidden chest, filling the large bare meadows (density map, WP-G3).
  ['woodland',P(340,-160),[280,220],.3,{kind:0}],
  ['woodland',P(900,260),[240,260],-.4,{kind:2}],
  ['woodland',P(500,-1650),[300,220],.8,{kind:0}],
  ['woodland',P(-560,-1780),[240,240],0,{kind:1}],
  ['woodland',P(900,-2420),[260,220],-.2,{kind:2}],
  ['woodland',P(-230,-2860),[240,200],.5,{kind:0}],
  ['woodland',P(420,480),[220,200],1.1,{kind:1}],
  ['woodland',P(900,-480),[240,220],.2,{kind:0}],
  ['woodland',P(-1000,-900),[220,240],0,{kind:0,treasure:false}],
  ['woodland',P(120,-2250),[220,200],-.7,{kind:1,treasure:false}],
];
export const ISLAND_PLACES={volcano:P(-120,2650),village:P(-80,-1550),harbour:P(-330,-3560),mine:P(-430,1130),lake:P(80,750),falls:P(-300,1650),beach:P(-120,-3500),forest:P(-700,350),cliff:P(1150,900),marsh:P(-620,-2350)};
export function buildIsland(){
  const {width,length,seed}=ISLAND;
  const p=createProject({name:'Île du volcan',width,length,seed,projectId:'little-world-island-authoring',worldId:'little-world-island',terrain:{kind:'archipelago',version:1,archipelago:islandArchipelago()}});
  p.world.environment=defaultEnvironment(seed);
  const reports=ISLAND_LANDSCAPES.map(([presetId,center,[w,l],rotation,params])=>applyLandscape(p,newLandscape(p,presetId,center,{width:w,length:l,rotation,params})));
  const place=(id,name,assetId,x,z,ry=0,y=0)=>{const def=assetDefinitionFor(assetId);if(def&&!p.assets[assetId])p.assets[assetId]=def;
    putEntity(p,{id,name,kind:assetId.startsWith('architecture.')?'building':'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y,z},rotation:{x:0,y:Math.sin(ry/2),z:0,w:Math.cos(ry/2)},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId},...(colliderFor(assetId)?{Collider:colliderFor(assetId)}:{}),...(lightFor(assetId,id)?{Light:lightFor(assetId,id)}:{})}});};
  const {ctx}=projectGeography(p),sea=p.world.seaLevel;
  place('island-lighthouse-south','Phare du cap sud','architecture.lighthouse',900,-3180,.8);
  place('island-lighthouse-north','Phare du cap nord','architecture.lighthouse',980,2880,-.6);
  // Big boulders, rock spires and cliff blocks on rocky ground (deterministic, away from paths/water).
  let placed=0;for(let k=0;k<4000&&placed<140;k++){
    const x=Math.round(((k*7919)%2851)-1425),z=Math.round(((k*104729)%7801)-3900),s=classifyPoint(ctx,x,z);
    if(s.underwater||s.occupation!=='none'||!['rock','gravel','basalt'].includes(s.geology)&&!(s.biome==='mountain'||s.biome==='scrub'))continue;
const kind=['nature.boulder_large','nature.boulder_pile','nature.rock_spire','nature.cliff_block'][k%4];
    place(`island-rock-${placed++}`,'Rocher',kind,x,z,(k*2.4)%6.28);}
  // Cliff-top treasures: chests above walkable-steep faces (6–35 m), reached by climbing (BotW-like
  // reward for exploration). Deterministic scan of the relief, spaced out over the island.
  const H=(x,z)=>ctx.height(x,z),grad=(x,z,e=.5)=>{const gx=(H(x+e,z)-H(x-e,z))/(2*e),gz=(H(x,z+e)-H(x,z-e))/(2*e);return {s:Math.hypot(gx,gz),gx,gz};};
  const tops=[];scan:for(let z=-3800;z<=3800;z+=6)for(let x=-1450;x<=1450;x+=6){const g=grad(x,z);if(g.s<1.6)continue;const ux=g.gx/g.s,uz=g.gz/g.s,fx=x-ux*3,fz=z-uz*3;
    if(grad(fx,fz).s>.6||H(fx,fz)<sea+1)continue;let top=null;for(let d=1;d<45;d++){const sx=x+ux*d,sz=z+uz*d;if(grad(sx,sz).s<.5){top={x:sx+ux*3,z:sz+uz*3};break;}}
    if(!top)continue;const rise=H(top.x,top.z)-H(fx,fz),t=classifyPoint(ctx,top.x,top.z);if(rise<6||rise>35||t.underwater||t.occupation!=='none'||grad(top.x,top.z).s>.5)continue;
    if(tops.some(o=>Math.hypot(o.x-top.x,o.z-top.z)<380))continue;tops.push({...top,rise,yaw:Math.atan2(-ux,-uz)});if(tops.length>=12)break scan;}
  const coinDef=ECONOMY_ITEMS.find(i=>i.id==='coin');if(tops.length&&!p.libraries.items.coin)p.libraries.items.coin={id:'coin',name:coinDef.name,category:coinDef.category,maxQuantity:coinDef.maxQuantity,...(coinDef.description?{description:coinDef.description}:{})};
  tops.forEach((t,i)=>{const id=`island-cliff-treasure-${i}`,act=`island.treasure-${i}`,coins=25+Math.round(t.rise*2);if(!p.assets['structure.chest'])p.assets['structure.chest']=assetDefinitionFor('structure.chest');
    putEntity(p,{id,name:'Coffre du sommet',kind:'prop',ownerChunkId:chunkAt(p.world,t.x,t.z),components:{Transform:{type:'Transform',position:{x:+t.x.toFixed(2),y:0,z:+t.z.toFixed(2)},rotation:{x:0,y:Math.sin(t.yaw/2),z:0,w:Math.cos(t.yaw/2)},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'structure.chest'},Collider:colliderFor('structure.chest'),
      State:{type:'State',initial:{opened:false}},Persistence:{type:'Persistence',fields:['opened']},Interactable:{type:'Interactable',prompt:'Ouvrir le coffre',range:2.2,interactionIds:[act]}}});
    p.libraries.interactions[act]={id:act,trigger:{type:'onInteract',entityId:id},condition:{type:'stateEquals',entityId:id,key:'opened',value:false},repeat:'once',persistent:true,
      sequence:[{type:'giveItem',itemId:'coin',quantity:coins},{type:'setState',entityId:id,key:'opened',value:true},{type:'showText',text:`Trésor du sommet ! +${coins} pièces.`}]};});
  // Main routes linking towns, camps, ports and landmarks.
  const route=(id,pts,kind='dirt',width=3)=>putPath(p,{id,points:pts.map(([x,z])=>P(x,z)),width,kind,smooth:true});
  route('route-town-port',[[-80,-1830],[-150,-2400],[-260,-3000],[-330,-3330]]);
  route('route-town-forest-mine',[[-80,-1270],[-250,-700],[-480,-100],[-560,120],[-560,600],[-450,1000]]);
  route('route-town-hamlet-w',[[-300,-1500],[-560,-1200],[-780,-950]],'dirt',2.5);
  route('route-town-hamlet-e',[[150,-1700],[450,-2200],[780,-2650]],'trail',2.5);
  route('route-east-port',[[200,-1500],[600,-1300],[950,-1150]],'dirt',2.5);
  route('route-centre-north',[[-450,1000],[-300,1500],[-300,1950],[-560,2050]],'trail',2);
  route('route-lake-east',[[80,750],[400,800],[620,700],[820,1500],[820,2150]],'trail',2);
  route('route-stones',[[-80,-1270],[200,-900],[420,-620]],'trail',2);
  // Roadside campfires with log seats every ~320 m along the routes (lit, flickering).
  const authored=Object.values(p.chunks).flatMap(c=>Object.values(c.entities)).map(e=>e.components.Transform.position);let camp=0;
  for(const path of Object.values(p.libraries.paths).filter(q=>q.id.startsWith('route-'))){
    for(const s of roadsideSpots(path.points,{spacing:320,offset:7,avoid:authored,ok:(x,z)=>{const c=classifyPoint(ctx,x,z);return !c.underwater&&c.occupation==='none'&&c.slope<.25;}})){
      const id=`island-camp-${camp++}`;place(id,'Feu de camp','structure.campfire',+s.x.toFixed(2),+s.z.toFixed(2),s.yaw);
      for(const [k,a]of [[0,.8],[1,2.6]]){const lx=s.x+Math.sin(s.yaw+a)*1.9,lz=s.z+Math.cos(s.yaw+a)*1.9;place(`${id}-seat-${k}`,'Rondin','nature.log_fallen',+lx.toFixed(2),+lz.toFixed(2),s.yaw+a+Math.PI/2);}
      authored.push({x:s.x,z:s.z});}}
  return {project:parseProject(p),reports};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const {project,reports}=buildIsland();
  for(const r of reports)if(r.diagnostics.length)console.warn(r.instanceId,r.diagnostics);
  await writeFile(new URL('../maps/island.project.json',import.meta.url),JSON.stringify(project,null,1)+'\n');
  const result=await compileProjectToDirectory(project,new URL('../public/maps/island',import.meta.url).pathname);
  console.log(JSON.stringify({worldId:result.manifest.worldId,buildVersion:result.manifest.buildVersion,landscapes:Object.keys(project.libraries.landscapes).length,features:project.world.terrain.archipelago.features.length,entities:Object.keys(project.entityIndex).length,water:Object.keys(project.libraries.water).length,paths:Object.keys(project.libraries.paths).length,zones:Object.keys(project.libraries.zones).length,authoredChunks:result.manifest.chunks.length,payloadBytes:result.manifest.chunks.reduce((s,c)=>s+c.byteLength,0)},null,1));
}
