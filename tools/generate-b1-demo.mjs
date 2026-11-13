/** B1 demonstration scene of the PHYS / WATER / MINE / AGRI campaign — reproducible, no new
 * asset. A small island holds every acceptance situation:
 *  - irregular relief, crates (solid colliders) and a slope near the start;
 *  - a plateau whose river falls (explicit waterfall) into a lake, an outlet river to the sea;
 *  - a hill containing a three-level mine (stone, iron veins, crystals);
 *  - two farm plots with an irrigation point (one already sown).
 * Water levels are derived from the generated relief and the network is validated here.
 * Writes the V3 source (maps/), a public copy for the Studio and the compiled static world
 * (public/maps/b1-demo/). Usage: npm run generate:b1 */
import {writeFile} from 'node:fs/promises';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity,putWater,putPath} from '../src/studio-core/source.ts';
import {blobOutline} from '../src/geography/archipelago-params.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {createTerrainSource} from '../src/terrain.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
import {defaultMineSettings,validateMineSettings} from '../src/mine/mine-data.ts';
import {defaultFarmSettings} from '../src/farm/farm-data.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

export const B1_DEMO={width:800,length:1200,seed:3108};
/** Places of the acceptance walk (also used by the browser test). */
export const B1_SITES={start:{x:-40,z:330},crates:{x:-40,z:300},slope:{x:-80,z:250},lake:{x:20,z:-40},waterfallTop:{x:20,z:-205},mine:{x:170,z:60},farm:{x:-150,z:120}};
function archipelago(){
  return {seabedDepthM:30,detailM:2,
    landmasses:[{id:'island',name:'Île de démonstration B1',outline:blobOutline(0,-20,330,500,20,.6),coastNoiseM:25,coastWavelengthM:300,beachWidthM:30,shoreHeightM:3,lowlandHeightM:14,hillHeightM:6,cliffs:.2}],
    features:[
      {id:'plateau',kind:'plateau',polygon:[{x:-120,z:-340},{x:160,z:-340},{x:170,z:-190},{x:-110,z:-185}],heightM:22,edgeM:10},
      {id:'lake-basin',kind:'basin',x:20,z:-40,radiusM:70,depthM:7},
      {id:'outlet',kind:'valley',points:[{x:20,z:20},{x:60,z:200},{x:90,z:420}],widthM:40,depthM:4},
      {id:'mine-hill',kind:'hill',x:170,z:60,radiusM:110,heightM:26,roughness:.25},
      {id:'slope',kind:'hill',x:-80,z:230,radiusM:45,heightM:10,roughness:.1},
    ]};
}
export function buildB1Project(){
  const {width,length,seed}=B1_DEMO;
  const p=createProject({name:'Démonstration B1 — PHYS / WATER / MINE / AGRI',width,length,seed,projectId:'little-world-b1-demo-authoring',worldId:'little-world-b1-demo',terrain:{kind:'archipelago',version:1,archipelago:archipelago()}});
  p.world.environment=defaultEnvironment(seed);
  const config={seed,density:p.world.density,seaLevel:p.world.seaLevel,width,length,terrain:p.world.terrain},ground=createTerrainSource(config,[]);
  // Lake: outline around the basin, level just under its lowest shore point (no spill).
  const outline=blobOutline(B1_SITES.lake.x,B1_SITES.lake.z,48,40,12,.2).map(q=>({x:Math.round(q.x*10)/10,z:Math.round(q.z*10)/10}));
  const level=Math.round((Math.min(...outline.map(q=>ground(q.x,q.z)))-.6)*10)/10;
  putWater(p,{id:'lake',kind:'lake',points:outline,width:1,level,depth:3});
  // River on the plateau, waterfall at the plateau edge, ending in the lake.
  const top={x:20,z:-196},foot={x:20,z:-170},shoreN=outline.reduce((a,q)=>q.z<a.z?q:a);
  const river={id:'plateau-river',points:[{x:20,z:-320},{x:20,z:-260},top,{x:20,z:-150},{x:shoreN.x,z:shoreN.z+2}],width:6,level:0,depth:1,profile:{mode:'terrain',offset:-.35},to:{kind:'lake',id:'lake'}};
  // High level = the river's own level arriving at the plateau edge; low level = the foot.
  const arriving=compileWaterNetwork([river],ground,0)[0].points.find(q=>q.x===top.x&&q.z===top.z).level;
  const fallTop=Math.floor(arriving*10)/10,fallBottom=Math.round((ground(foot.x,foot.z)-.35)*10)/10;
  putWater(p,{...river,falls:[{at:2,top:fallTop,bottom:fallBottom}]});
  // Outlet river from the south shore of the lake to the sea.
  const shoreS=outline.reduce((a,q)=>q.z>a.z?q:a);
  putWater(p,{id:'outlet-river',points:[{x:shoreS.x,z:shoreS.z-2},{x:60,z:200},{x:80,z:330},{x:95,z:520}],width:7,level:0,depth:1.2,profile:{mode:'terrain',offset:-.35},from:{kind:'lake',id:'lake'},to:{kind:'sea'}});
  // Mine under the hill: three levels, entrance facing the lake (north side of the zone).
  const minePolygon=[{x:140,z:30},{x:205,z:30},{x:210,z:100},{x:135,z:100}];
  const mine=defaultMineSettings(minePolygon,3,ground(172,40),77);mine.entrance={x:172.5,z:31.5,heading:0};
  mine.galleries=[{levelId:'level-1',minX:171,maxX:174,minZ:32,maxZ:60},{levelId:'level-1',minX:160,maxX:190,minZ:58,maxZ:61},{levelId:'level-2',minX:171,maxX:174,minZ:40,maxZ:75},{levelId:'level-3',minX:165,maxX:182,minZ:52,maxZ:55}];
  mine.connectors=[{id:'stairs-1',upper:'level-1',lower:'level-2',x:172.5,z:45.5},{id:'stairs-2',upper:'level-2',lower:'level-3',x:172.5,z:68.5}];
  mine.galleries.push({levelId:'level-3',minX:171,maxX:174,minZ:52,maxZ:72});
  validateMineSettings(mine,minePolygon,3);
  // Farm plots near the start, irrigation barrel between them.
  const plot=(x,z)=>[{x,z},{x:x+12,z},{x:x+12,z:z+16},{x,z:z+16}];
  const farm1={...defaultFarmSettings(plot(-170,110)),irrigation:{x:-153,z:118}},farm2={...defaultFarmSettings(plot(-150,110)),initialCrop:'carrot',irrigation:{x:-153,z:118},rowAngle:Math.PI/2};
  p.libraries.zones={
    'zone-mine':{id:'zone-mine',kind:'mine',name:'Mine de la colline',polygon:minePolygon,levels:3,mine},
    'plot-west':{id:'plot-west',kind:'farm-plot',name:'Champ de l’ouest',polygon:plot(-170,110),farm:farm1},
    'plot-east':{id:'plot-east',kind:'farm-plot',name:'Potager de l’est',polygon:plot(-150,110),farm:farm2},
  };
  // Obstacles on the start meadow (solid colliders) and a path to the plots.
  const place=(id,name,assetId,x,z,collider)=>putEntity(p,{id,name,kind:'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId},...(collider?{Collider:{type:'Collider',shape:'box',size:{x:1.2,y:1.2,z:1.2},layer:'solid'}}:{})}});
  for(const [i,[dx,dz]] of [[-4,0],[0,0],[4,0],[8,-6],[-8,-6]].entries())place('crate-'+i,'Caisse '+(i+1),'props.crate',B1_SITES.crates.x+dx,B1_SITES.crates.z+dz,true);
  putPath(p,{id:'path-start-farm',points:[{x:-40,z:320},{x:-100,z:200},{x:-150,z:132}],width:3,kind:'dirt',smooth:true});
  putPath(p,{id:'path-start-mine',points:[{x:-40,z:320},{x:60,z:150},{x:172,z:24}],width:3,kind:'stone',smooth:true});
  // The network must compile without error (levels derived from the relief).
  const errors=compileWaterNetwork(Object.values(p.libraries.water),ground,p.world.seaLevel).flatMap(c=>c.diagnostics.filter(d=>d.severity==='ERROR').map(d=>c.id+': '+d.message));
  if(errors.length)throw Error('Réseau d’eau de la démonstration invalide :\n'+errors.join('\n'));
  return parseProject(p);
}
if(import.meta.url===`file://${process.argv[1]}`){
  const project=buildB1Project();
  await writeFile(new URL('../maps/b1-demo.project.json',import.meta.url),JSON.stringify(project,null,2)+'\n');
  await writeFile(new URL('../public/maps/b1-demo.project.json',import.meta.url),JSON.stringify(project)+'\n');
  const result=await compileProjectToDirectory(project,new URL('../public/maps/b1-demo',import.meta.url).pathname);
  console.log(JSON.stringify({worldId:result.manifest.worldId,buildVersion:result.manifest.buildVersion,authoredChunks:result.manifest.chunks.length,written:result.written,lake:project.libraries.water.lake.level},null,2));
}
