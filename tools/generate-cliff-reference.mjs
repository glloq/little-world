/** Compact V3 cliff lab. Uses only existing heightfield features, paths and local rock
 * faces; source, Studio copy and compiled output share the ordinary export pipeline. */
import {writeFile} from 'node:fs/promises';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity,putPath} from '../src/studio-core/source.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

const P=(x,z)=>({x,z});
export const CLIFF_SITES={
 simple:{label:'1 · Falaise droite',points:[P(-115,-78),P(-55,-78)],widthM:9,heightM:23},
 broken:{label:'2 · Cassures et décrochements',points:[P(-28,-90),P(-12,-90),P(-12,-78),P(8,-78),P(23,-90)],widthM:8,heightM:29},
 curved:{label:'3 · Falaise courbe',points:[P(48,-70),P(55,-84),P(69,-92),P(85,-92),P(99,-84),P(106,-70)],widthM:9,heightM:25},
 plateau:{label:'4 · Bord de plateau',points:[P(-103,57),P(-103,80),P(-79,80),P(-55,80),P(-55,57)],widthM:7,heightM:8},
 volcanic:{label:'5 · Roche volcanique dure',points:[P(38,75),P(51,71),P(60,78),P(73,69),P(87,75)],widthM:7,heightM:32},
};
export function buildCliffReference(){
 const p=createProject({name:'Falaises — laboratoire low-poly',projectId:'little-world-cliff-reference-authoring',worldId:'little-world-cliff-reference',width:280,length:280,chunkSizeM:280,seed:5207,density:0,viewDistance:240,terrain:{kind:'archipelago',version:1,archipelago:{seabedDepthM:8,detailM:0,
 landmasses:[{id:'lab',name:'Socle du laboratoire',outline:[P(-139,-139),P(139,-139),P(139,139),P(-139,139)],coastNoiseM:0,coastWavelengthM:100,beachWidthM:4,shoreHeightM:2,lowlandHeightM:6,hillHeightM:0,cliffs:0}],
 features:[
 {id:'lab-ground',kind:'plateau',polygon:[P(-134,-134),P(134,-134),P(134,134),P(-134,134)],heightM:6,edgeM:3},
 {id:'lab-plateau',kind:'plateau',polygon:[P(-104,35),P(-54,35),P(-54,80),P(-104,80)],heightM:24,edgeM:7},
 {id:'lab-volcano',kind:'volcano',x:64,z:68,radiusM:47,heightM:10,craterRadiusM:7,craterDepthM:2},
 ...Object.entries(CLIFF_SITES).map(([id,{points,widthM,heightM}])=>({id:'rl-cliff-lab-'+id,kind:'ridge',points,widthM,heightM})),
 ]}}});
 // Fixed daylight baseline; no random vegetation or automatic rock dressing to hide faces.
 p.world.environment={...defaultEnvironment(5207),initialDayPhase:.36,dayLengthSeconds:86400,weatherPeriodSeconds:86400};
 putPath(p,{id:'lab-loop',points:[P(-120,0),P(-80,-35),P(0,-38),P(105,-35),P(120,15),P(110,110),P(0,120),P(-120,110),P(-120,0)],kind:'dirt',width:3,smooth:true});
 putPath(p,{id:'lab-crossing',points:[P(0,-38),P(0,0),P(0,120)],kind:'trail',width:3,smooth:false});
 // Four original low-poly context rocks, away from the test faces.
 for(const [i,[x,z]]of [[-119,24],[-32,110],[118,-5],[23,12]].entries()){
  const id='lab-rock-'+i;
  putEntity(p,{id,name:'Repère rocheux '+(i+1),kind:'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'nature.rock'}}});
 }
 return parseProject(p);
}
if(import.meta.url===`file://${process.argv[1]}`){
 const project=buildCliffReference();
 await writeFile(new URL('../maps/cliff-reference.project.json',import.meta.url),JSON.stringify(project,null,2)+'\n');
 await writeFile(new URL('../public/maps/cliff-reference.project.json',import.meta.url),JSON.stringify(project)+'\n');
 const result=await compileProjectToDirectory(project,new URL('../public/maps/cliff-reference/',import.meta.url).pathname);
 console.log(JSON.stringify({worldId:result.manifest.worldId,chunks:result.manifest.chunks.length,written:result.written},null,2));
}
