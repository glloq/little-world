/** Existing V3 heightfield/Collider pipeline: slope, ramp, cliff, thin roof, arch and water.
 * No render-only colliders or special physics rules in this scene. */
import {writeFile} from 'node:fs/promises';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity,putPath,putWater} from '../src/studio-core/source.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {compileProjectToDirectory} from './compile-project.mjs';
const P=(x,z)=>({x,z}),rect=(x0,z0,x1,z1)=>[P(x0,z0),P(x1,z0),P(x1,z1),P(x0,z1)];
export const MOTION_SITES={slope:P(-90,-205),ramp:P(-90,-45),cliff:P(90,-120),landing:P(0,130),arch:P(-80,120),roof:P(45,120),water:P(125,210)};
export function buildMotionReference(){
 const p=createProject({name:'Déplacements — pente, roulade et planeur',projectId:'little-world-motion-reference-authoring',worldId:'little-world-motion-reference',width:400,length:600,seed:6201,density:0,terrain:{kind:'archipelago',version:1,archipelago:{seabedDepthM:8,detailM:0,
 landmasses:[{id:'lab',name:'Banc de déplacements',outline:rect(-199,-299,199,299),coastNoiseM:0,coastWavelengthM:100,beachWidthM:4,shoreHeightM:2,lowlandHeightM:6,hillHeightM:0,cliffs:0}],
 features:[
 {id:'lab-ground',kind:'plateau',polygon:rect(-194,-294,194,294),heightM:6,edgeM:3},
 {id:'slope-deck',kind:'plateau',polygon:rect(-155,-260,-25,-180),heightM:66,edgeM:110},
 {id:'launch-ramp',kind:'ridge',points:[P(-140,-45),P(-40,-45)],heightM:12,widthM:28},
 {id:'cliff-deck',kind:'plateau',polygon:rect(35,-250,155,-70),heightM:72,edgeM:4},
 {id:'lab-pool',kind:'basin',x:125,z:210,radiusM:40,depthM:4},
 ]}}});
 p.world.environment={...defaultEnvironment(6201),dayLengthSeconds:86400};
 putPath(p,{id:'lab-route',points:[MOTION_SITES.slope,MOTION_SITES.ramp,P(-90,40),MOTION_SITES.arch,P(-90,210)],kind:'dirt',width:3,smooth:false});
 // Three familiar boxes build a real passable arch; a separate thin slab tests vertical sweeps.
 const block=(id,name,x,z,y,sx,sy,sz)=>putEntity(p,{id,name,kind:'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:sx/1.2,y:sy/1.2,z:sz/1.2}},Visual:{type:'Visual',assetId:'props.crate'},Collider:{type:'Collider',shape:'box',size:{x:1.2,y:1.2,z:1.2},layer:'solid'}}});
 block('arch-left','Pilier gauche',-87,120,0,2,12,3);block('arch-right','Pilier droit',-73,120,0,2,12,3);block('arch-top','Traverse de passage',-80,120,12,16,2,3);
 block('thin-roof','Plateforme fine (atterrissage et plafond)',45,120,8,24,.15,24);
 putWater(p,{id:'lab-water',kind:'lake',points:rect(108,193,142,227),width:1,level:4,depth:2});
 return parseProject(p);
}
if(import.meta.url===`file://${process.argv[1]}`){
 const p=buildMotionReference();
 await writeFile(new URL('../maps/motion-reference.project.json',import.meta.url),JSON.stringify(p,null,2)+'\n');
 await writeFile(new URL('../public/maps/motion-reference.project.json',import.meta.url),JSON.stringify(p)+'\n');
 const r=await compileProjectToDirectory(p,new URL('../public/maps/motion-reference/',import.meta.url).pathname);
 console.log(JSON.stringify({world:r.manifest.worldId,chunks:r.manifest.chunks.length,written:r.written.length}));
}
