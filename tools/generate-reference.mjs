/** Geography reference scene (G7) — reproducible, distinct from the final B1 map.
 * 1 600 × 2 400 m archipelago containing every situation the Geography Engine must handle:
 * mountainous main island, volcano with crater, valley carrying a river, beaches and cliffs,
 * meadow, forest, wetland, a buildable plateau with a village zone, a farm plot, a mine
 * entrance (reserved zone) and an islet. Writes the V3 source (maps/), a public copy for the
 * Studio and the compiled static world (public/maps/reference/). */
import {writeFile} from 'node:fs/promises';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity,putWater,putPath} from '../src/studio-core/source.ts';
import {paintMask,regionCells} from '../src/studio-core/geo-edits.ts';
import {blobOutline} from '../src/geography/archipelago-params.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

export const REFERENCE={width:1600,length:2400,seed:2024};
export const REFERENCE_SITES={
  volcano:{x:-150,z:-560},massif:{x:-260,z:430},valley:{x:60,z:150},plateau:{x:200,z:360},village:{x:200,z:360},
  farm:{x:-20,z:640},mine:{x:-330,z:560},wetland:{x:-330,z:-60},islet:{x:540,z:-930},forest:{x:-200,z:180},meadow:{x:120,z:-260},
};
export function referenceArchipelago(){
  return {seabedDepthM:35,detailM:2,
    landmasses:[
      {id:'main',name:'Île de référence',outline:blobOutline(-90,90,560,930,26,.8),coastNoiseM:45,coastWavelengthM:420,beachWidthM:40,shoreHeightM:4,lowlandHeightM:30,hillHeightM:12,cliffs:.45},
      {id:'islet',name:'Îlot du phare',outline:blobOutline(540,-930,140,95,12,2.2),coastNoiseM:12,coastWavelengthM:160,beachWidthM:18,shoreHeightM:3,lowlandHeightM:8,hillHeightM:5,cliffs:.7},
    ],
    features:[
      {id:'volcano',kind:'volcano',x:-150,z:-560,radiusM:380,heightM:230,craterRadiusM:50,craterDepthM:24},
      {id:'massif',kind:'mountain',x:-260,z:430,radiusM:300,heightM:170,roughness:.6},
      {id:'ridge',kind:'ridge',points:[{x:-420,z:240},{x:-260,z:430},{x:-120,z:640}],widthM:90,heightM:40},
      {id:'valley',kind:'valley',points:[{x:-60,z:420},{x:60,z:150},{x:180,z:-60},{x:340,z:-190},{x:470,z:-230}],widthM:95,depthM:9},
      {id:'plateau',kind:'plateau',polygon:blobOutline(200,360,110,80,8,.3),heightM:36,edgeM:30},
      {id:'wetland',kind:'basin',x:-330,z:-60,radiusM:95,depthM:4},
      {id:'hills',kind:'hill',x:100,z:760,radiusM:170,heightM:18,roughness:.3},
    ]};
}
export function buildReferenceProject(){
  const {width,length,seed}=REFERENCE;
  const p=createProject({name:'Scène de référence géographique',width,length,seed,projectId:'little-world-geo-reference-authoring',worldId:'little-world-geo-reference',terrain:{kind:'archipelago',version:1,archipelago:referenceArchipelago()}});
  p.world.environment=defaultEnvironment(seed);
  const circle=(c,radius)=>regionCells(p,{kind:'circle',x:c.x,z:c.z,radius});
  // Author corrections (sector masks) guarantee each situation, generation does the rest.
  paintMask(p,'biome','w',circle(REFERENCE_SITES.wetland,80));paintMask(p,'moisture','9',circle(REFERENCE_SITES.wetland,70));
  paintMask(p,'biome','f',regionCells(p,{kind:'polygon',points:[{x:-340,z:90},{x:-60,z:110},{x:-40,z:290},{x:-300,z:300}]}));
  paintMask(p,'biome','m',circle(REFERENCE_SITES.meadow,110));
  paintMask(p,'occupation','b',circle(REFERENCE_SITES.village,55));paintMask(p,'biome','g',circle(REFERENCE_SITES.village,60));
  // River in the valley (terrain-following profile), paths between village, farm and shore.
  putWater(p,{id:'river',points:[{x:-60,z:420},{x:60,z:150},{x:180,z:-60},{x:330,z:-185}],width:9,level:0,depth:1.4,profile:{mode:'terrain',offset:-.35}});
  putPath(p,{id:'path-village-farm',points:[{x:200,z:360},{x:110,z:520},{x:-20,z:640}],width:3});
  putPath(p,{id:'path-village-shore',points:[{x:200,z:360},{x:300,z:200},{x:380,z:40}],width:3});
  // Activity zones: farm plot and mine entrance (no agriculture/mine simulation here).
  p.libraries.zones={
    'zone-farm':{id:'zone-farm',kind:'farm-plot',name:'Champ de référence',polygon:[{x:-90,z:590},{x:50,z:580},{x:60,z:700},{x:-80,z:705}]},
    'zone-mine':{id:'zone-mine',kind:'mine',name:'Entrée de la mine',polygon:[{x:-360,z:540},{x:-300,z:535},{x:-295,z:585},{x:-355,z:590}],levels:3},
  };
  // Village: a few cottages on the plateau, a crate marking the mine entrance.
  const place=(id,name,assetId,x,z,ry=0)=>putEntity(p,{id,name,kind:'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:Math.sin(ry/2),z:0,w:Math.cos(ry/2)},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId}}});
  place('village-house-1','Maison du plateau','architecture.cottage',185,345,.4);
  place('village-house-2','Maison du puits','architecture.cottage',222,372,-.8);
  place('village-house-3','Maison du chemin','architecture.cottage',176,392,2.1);
  place('mine-marker','Caisse de l’entrée de mine','props.crate',-328,560);
  return parseProject(p);
}
if(import.meta.url===`file://${process.argv[1]}`){
  const project=buildReferenceProject();
  await writeFile(new URL('../maps/reference.project.json',import.meta.url),JSON.stringify(project,null,2)+'\n');
  await writeFile(new URL('../public/maps/reference.project.json',import.meta.url),JSON.stringify(project)+'\n');
  const result=await compileProjectToDirectory(project,new URL('../public/maps/reference',import.meta.url).pathname);
  console.log(JSON.stringify({worldId:result.manifest.worldId,buildVersion:result.manifest.buildVersion,authoredChunks:result.manifest.chunks.length,written:result.written},null,2));
}
