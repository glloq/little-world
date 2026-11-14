/** Island 4 × 3 km — populated production (World Production V1 → complete game V1, doc 42 §H5).
 * Composition (north = +Z): an inhabited north (fishing ports, walled castle town, villages,
 * beaches) where the game starts on the north beach, cut off by a central ridge from a wild
 * south (volcano, western massif, gorges, mine, hamlets); hills everywhere break the lines of
 * sight so that whole regions hide behind the relief (horizon culling saves their rendering).
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

export const ISLAND={width:4000,length:3000,seed:4242};
const P=(x,z)=>({x,z});
export function islandArchipelago(){
  return {seabedDepthM:40,detailM:2.5,
    landmasses:[
      {id:'main',name:'Île du volcan',outline:[P(-1850,0),P(-1800,600),P(-1550,1150),P(-1000,1380),P(-300,1420),P(400,1380),P(1050,1300),P(1550,1000),P(1850,450),P(1880,-200),P(1700,-850),P(1350,-1250),P(700,-1400),P(0,-1420),P(-700,-1380),P(-1300,-1200),P(-1750,-650)],
        coastNoiseM:90,coastWavelengthM:700,beachWidthM:60,shoreHeightM:3,lowlandHeightM:14,hillHeightM:24,cliffs:.3},
      {id:'islet-ne',name:'Îlot du nord-est',outline:blobOutline(1700,1350,120,90,12,1.3),coastNoiseM:16,coastWavelengthM:160,beachWidthM:18,shoreHeightM:3,lowlandHeightM:10,hillHeightM:10,cliffs:.8},
    ],
    features:[
      {id:'volcano',kind:'volcano',x:1100,z:-700,radiusM:650,heightM:380,craterRadiusM:90,craterDepthM:45},
      {id:'massif-west',kind:'mountain',x:-1200,z:-600,radiusM:560,heightM:260,roughness:.4},
      {id:'central-ridge',kind:'ridge',points:[P(-750,80),P(-200,-120),P(300,-250),P(800,150)],widthM:320,heightM:120},
      {id:'south-cliffs',kind:'ridge',points:[P(-900,-1150),P(-300,-1200),P(250,-1180)],widthM:220,heightM:110},
      {id:'hills-nw',kind:'hill',x:-850,z:420,radiusM:300,heightM:85,roughness:.4},
      {id:'hills-ne',kind:'hill',x:620,z:880,radiusM:260,heightM:80,roughness:.45},
      {id:'hills-e',kind:'hill',x:1350,z:330,radiusM:300,heightM:95,roughness:.45},
      {id:'hills-w',kind:'hill',x:-1480,z:330,radiusM:300,heightM:90,roughness:.4},
      {id:'knoll-centre',kind:'hill',x:250,z:350,radiusM:190,heightM:55,roughness:.35},
      {id:'knoll-west',kind:'hill',x:-1050,z:230,radiusM:200,heightM:60,roughness:.4},
      {id:'knoll-port',kind:'hill',x:-420,z:1060,radiusM:170,heightM:45,roughness:.4},
      {id:'knoll-east',kind:'hill',x:520,z:420,radiusM:150,heightM:48,roughness:.4},
      {id:'ridge-nw',kind:'ridge',points:[P(-1550,950),P(-1250,1150),P(-950,1250)],widthM:200,heightM:70},
      {id:'ridge-ne',kind:'ridge',points:[P(1050,1150),P(1350,780),P(1600,700)],widthM:180,heightM:65},
      {id:'river-valley',kind:'valley',points:[P(-100,-950),P(-450,-350),P(-600,350),P(-700,1250)],widthM:220,depthM:16},
      {id:'south-valley',kind:'valley',points:[P(-200,-1050),P(300,-900),P(500,-450)],widthM:220,depthM:30},
      {id:'lake',kind:'basin',x:150,z:-650,radiusM:160,depthM:4},
    ]};
}
/** [preset, centre, [width, length], rotation, params] — composition of the 4 × 3 km island. */
export const ISLAND_LANDSCAPES=[
  // North — the inhabited coast: start beach, port, walled town, villages.
  ['castle-town',P(-150,650),[380,380],Math.PI,{houses:40,cathedral:true}],
  ['fishing-port',P(300,1290),[300,260],0,{houses:6}],
  ['fishing-port',P(1730,520),[280,280],-Math.PI/2,{houses:5}],
  ['village-clearing',P(-1150,720),[260,260],.4,{houses:3,fields:true,windmill:false,orchard:true}],
  ['village-clearing',P(950,660),[260,260],-.3,{houses:3,fields:true,windmill:true,orchard:false}],
  ['sandy-beach',P(-320,1390),[900,140],0,{dunes:30}],
  ['sandy-beach',P(-1720,700),[560,200],Math.PI/2,{dunes:24,palms:true}],
  ['river-bend',P(-610,230),[380,560],.1,{riverWidth:8,bridge:true}],
  ['marsh-basin',P(1250,980),[360,280],0,{ponds:3,depth:6}],
  // Centre — forest camps and woods on both sides of the central ridge.
  ['forest-camp',P(-900,-200),[160,160],.2,{}],
  ['forest-camp',P(1300,-120),[160,160],-.4,{}],
  // South — wild relief: volcano, cliffs, pass, gorge, forest valley, lake, mine, hamlets, ruins.
  ['volcanic-field',P(1100,-760),[800,600],0,{flows:4}],
  ['rocky-cliff',P(-300,-1330),[700,200],0,{height:45}],
  ['rocky-cliff',P(1790,-300),[600,200],Math.PI/2,{height:40}],
  ['mountain-pass',P(300,-950),[500,400],-.3,{height:90}],
  ['waterfall-gorge',P(-650,-900),[240,480],0,{drop:16}],
  ['forest-valley',P(-480,-520),[480,560],.1,{depth:22,stream:true}],
  ['marsh-basin',P(150,-650),[380,300],0,{ponds:2,depth:4}],
  ['mine-camp',P(-1000,-850),[160,160],0,{levels:4}],
  ['mountain-hamlet',P(-1350,-1000),[200,200],0,{houses:4}],
  ['mountain-hamlet',P(760,-1200),[200,200],.5,{houses:3}],
  ['ancient-ruins',P(-1620,-320),[140,140],.5,{walls:3}],
  ['ancient-ruins',P(520,-1260),[130,130],-.3,{walls:2}],
  // Landmarks spread over the island (several hidden behind ridges or in valleys).
  ['landmark-site',P(-1650,250),[120,120],0,{kind:0}],
  ['landmark-site',P(470,60),[120,120],0,{kind:1}],
  ['landmark-site',P(1500,1150),[120,120],.4,{kind:2}],
  ['landmark-site',P(-1000,-1250),[120,120],0,{kind:3,hermit:false}],
  ['landmark-site',P(700,-320),[120,120],-1.2,{kind:4}],
  ['landmark-site',P(-300,-1080),[120,120],0,{kind:5}],
  ['landmark-site',P(-1500,-700),[120,120],0,{kind:6}],
  // Woods with a clearing and a hidden chest.
  ['woodland',P(-700,1020),[260,220],.3,{kind:0}],
  ['woodland',P(250,960),[240,220],-.4,{kind:2}],
  ['woodland',P(-1480,-120),[260,220],.8,{kind:0}],
  ['woodland',P(620,1120),[240,220],0,{kind:1}],
  ['woodland',P(-1300,320),[240,200],-.2,{kind:2}],
  ['woodland',P(1000,180),[240,220],.5,{kind:0,treasure:false}],
];
export const ISLAND_PLACES={volcano:P(1100,-700),village:P(-150,650),harbour:P(300,1290),mine:P(-1000,-850),lake:P(150,-650),falls:P(-650,-900),beach:P(-320,1350),forest:P(-480,-520),cliff:P(1790,-300),marsh:P(1250,980)};
export function buildIsland(){
  const {width,length,seed}=ISLAND;
  const p=createProject({name:'Île du volcan',width,length,seed,projectId:'little-world-island-authoring',worldId:'little-world-island',terrain:{kind:'archipelago',version:1,archipelago:islandArchipelago()}});
  p.world.environment=defaultEnvironment(seed);
  // Presets that trace water are applied last: their WATER validation sees the final relief.
  const WATER_PRESETS=['forest-valley','marsh-basin','river-bend','waterfall-gorge'],ordered=[...ISLAND_LANDSCAPES].sort((a,b)=>WATER_PRESETS.indexOf(a[0])-WATER_PRESETS.indexOf(b[0]));
  const reports=ordered.map(([presetId,center,[w,l],rotation,params])=>applyLandscape(p,newLandscape(p,presetId,center,{width:w,length:l,rotation,params})));
  const place=(id,name,assetId,x,z,ry=0,y=0)=>{const def=assetDefinitionFor(assetId);if(def&&!p.assets[assetId])p.assets[assetId]=def;
    putEntity(p,{id,name,kind:assetId.startsWith('architecture.')?'building':'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y,z},rotation:{x:0,y:Math.sin(ry/2),z:0,w:Math.cos(ry/2)},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId},...(colliderFor(assetId)?{Collider:colliderFor(assetId)}:{}),...(lightFor(assetId,id)?{Light:lightFor(assetId,id)}:{})}});};
  const {ctx}=projectGeography(p),sea=p.world.seaLevel;
  place('island-lighthouse-west','Phare du cap ouest','architecture.lighthouse',-1640,1120,.8);
  place('island-lighthouse-south','Phare du cap sud','architecture.lighthouse',1420,-1130,-.6);
  // Big boulders, rock spires and cliff blocks on rocky ground (deterministic, away from paths/water).
  let placed=0;for(let k=0;k<4000&&placed<120;k++){
    const x=Math.round(((k*7919)%3851)-1925),z=Math.round(((k*104729)%2901)-1450),s=classifyPoint(ctx,x,z);
    if(s.underwater||s.occupation!=='none'||!['rock','gravel','basalt'].includes(s.geology)&&!(s.biome==='mountain'||s.biome==='scrub'))continue;
const kind=['nature.boulder_large','nature.boulder_pile','nature.rock_spire','nature.cliff_block'][k%4];
    place(`island-rock-${placed++}`,'Rocher',kind,x,z,(k*2.4)%6.28);}
  // Cliff-top treasures: chests above walkable-steep faces (6–35 m), reached by climbing (BotW-like
  // reward for exploration). Deterministic scan of the relief, spaced out over the island.
  const H=(x,z)=>ctx.height(x,z),grad=(x,z,e=.5)=>{const gx=(H(x+e,z)-H(x-e,z))/(2*e),gz=(H(x,z+e)-H(x,z-e))/(2*e);return {s:Math.hypot(gx,gz),gx,gz};};
  const tops=[];scan:for(let z=-1450;z<=1450;z+=6)for(let x=-1950;x<=1950;x+=6){const g=grad(x,z);if(g.s<1.6)continue;const ux=g.gx/g.s,uz=g.gz/g.s,fx=x-ux*3,fz=z-uz*3;
    if(grad(fx,fz).s>.6||H(fx,fz)<sea+1)continue;let top=null;for(let d=1;d<45;d++){const sx=x+ux*d,sz=z+uz*d;if(grad(sx,sz).s<.5){top={x:sx+ux*3,z:sz+uz*3};break;}}
    if(!top)continue;const rise=H(top.x,top.z)-H(fx,fz),t=classifyPoint(ctx,top.x,top.z);if(rise<6||rise>35||t.underwater||t.occupation!=='none'||grad(top.x,top.z).s>.5)continue;
    if(tops.some(o=>Math.hypot(o.x-top.x,o.z-top.z)<300))continue;tops.push({...top,rise,yaw:Math.atan2(-ux,-uz)});if(tops.length>=12)break scan;}
  const coinDef=ECONOMY_ITEMS.find(i=>i.id==='coin');if(tops.length&&!p.libraries.items.coin)p.libraries.items.coin={id:'coin',name:coinDef.name,category:coinDef.category,maxQuantity:coinDef.maxQuantity,...(coinDef.description?{description:coinDef.description}:{})};
  tops.forEach((t,i)=>{const id=`island-cliff-treasure-${i}`,act=`island.treasure-${i}`,coins=25+Math.round(t.rise*2);if(!p.assets['structure.chest'])p.assets['structure.chest']=assetDefinitionFor('structure.chest');
    putEntity(p,{id,name:'Coffre du sommet',kind:'prop',ownerChunkId:chunkAt(p.world,t.x,t.z),components:{Transform:{type:'Transform',position:{x:+t.x.toFixed(2),y:0,z:+t.z.toFixed(2)},rotation:{x:0,y:Math.sin(t.yaw/2),z:0,w:Math.cos(t.yaw/2)},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'structure.chest'},Collider:colliderFor('structure.chest'),
      State:{type:'State',initial:{opened:false}},Persistence:{type:'Persistence',fields:['opened']},Interactable:{type:'Interactable',prompt:'Ouvrir le coffre',range:2.2,interactionIds:[act]}}});
    p.libraries.interactions[act]={id:act,trigger:{type:'onInteract',entityId:id},condition:{type:'stateEquals',entityId:id,key:'opened',value:false},repeat:'once',persistent:true,
      sequence:[{type:'giveItem',itemId:'coin',quantity:coins},{type:'setState',entityId:id,key:'opened',value:true},{type:'showText',text:`Trésor du sommet ! +${coins} pièces.`}]};});
  // Main routes linking towns, camps, ports and landmarks.
  const route=(id,pts,kind='dirt',width=3)=>putPath(p,{id,points:pts.map(([x,z])=>P(x,z)),width,kind,smooth:true});
  route('route-port-town',[[260,1180],[120,1000],[-150,880]]);
  route('route-town-village-w',[[-400,640],[-800,700],[-1080,720]],'dirt',2.5);
  route('route-town-village-e',[[100,640],[500,620],[880,660]],'dirt',2.5);
  route('route-village-e-port',[[1020,640],[1300,600],[1540,560]],'dirt',2.5);
  route('route-town-south',[[-150,420],[-120,60],[-300,-380],[-700,-700],[-960,-820]]);
  route('route-pass-hamlet',[[-300,-380],[100,-560],[400,-900],[700,-1150]],'trail',2);
  route('route-mine-hamlet-w',[[-1040,-880],[-1250,-960]],'trail',2);
  route('route-west-coast',[[-1080,720],[-1400,400],[-1600,100],[-1600,-260]],'trail',2);
  route('route-forest-east',[[500,620],[900,300],[1260,-100]],'trail',2);
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
