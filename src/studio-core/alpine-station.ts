import {assetDefinitionFor,colliderFor,worldAsset} from '../world-production/registry.ts';
import {inspectGroundSegment} from '../paths/terrain-route.ts';
import type {SkiAreaV1} from '../snow/ski-area.ts';
import {createCharacter} from './character-authoring.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';
import {chunkAt} from './schema.ts';
import {putEntity} from './source.ts';
import {yawQuaternion} from './transforms.ts';
import type {PointXZ,ProjectDocument} from './types.ts';

export function addAlpineStation(project:ProjectDocument,area:SkiAreaV1){
 const areas=Object.values(project.libraries.alpine??{}),lifts=areas.filter(a=>a.lift).length;
 const summary=areas.length+' piste'+(areas.length>1?'s':'')+' balisée'+(areas.length>1?'s':'')+' et '+lifts+' remontée'+(lifts>1?'s':'')+'.';
 const base=area.points.at(-1)!;
 const terrain=project.world.terrain;
 if(terrain?.kind!=='archipelago')throw Error('Station des Cimes : relief insulaire requis.');
 const env=projectRaceTerrainEnvironment(project);
 const floor=(p:PointXZ,radius:number)=>{
  for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius]){
   const x=p.x+dx,z=p.z+dz,h=env.height(x,z);
   if(x<env.bounds.minX||x>env.bounds.maxX||z<env.bounds.minZ||z>env.bounds.maxZ||
     h<=env.seaLevel+.5||env.water(x,z,h)!==null||env.occupation(x,z)!=='none')return false;
  }
  return true;
 };
 const reachable=(p:PointXZ)=>inspectGroundSegment(base,p,{
  bounds:env.bounds,height:env.height,seaLevel:env.seaLevel,
  wet:(x,z)=>env.water(x,z,env.height(x,z))!==null,
 },{maxSlope:.42,widthM:1.6}).valid;
 const cabinAsset='architecture.wooden_cabin',size=worldAsset(cabinAsset)!.size;
 const footprint=Math.hypot(size[0],size[2])/2;
 const terraceId='station-cimes:terrasse',edge=7;
 let layout:{hut:PointXZ;sign:PointXZ;guide:PointXZ;bench:PointXZ;yaw:number}|undefined;
 search:for(let distance=footprint+22;distance<=95;distance+=4)for(let i=0;i<32;i++){
  const yaw=i*Math.PI/16,dx=Math.sin(yaw),dz=Math.cos(yaw);
  const at=(along:number,side:number)=>({x:base.x+dx*along+dz*side,z:base.z+dz*along-dx*side});
  const hut=at(distance,0),sign=at(distance-footprint-4,-2),guide=at(distance-footprint-4,0),
   bench=at(distance-footprint-4,2.5);
  const front=distance-footprint-7,back=distance+footprint+1,side=footprint+1;
  const polygon=[at(front,-side),at(front,side),at(back,side),at(back,-side)];
  if(!floor(at((front+back)/2,0),Math.hypot((back-front)/2,side)+edge)||!reachable(guide))continue;
  const heightM=env.height(guide.x,guide.z)-env.seaLevel;
  terrain.archipelago.features.push({id:terraceId,kind:'plateau',surface:true,polygon,heightM,edgeM:edge});
  const built=projectRaceTerrainEnvironment(project);
  const access=inspectGroundSegment(base,guide,{
   bounds:built.bounds,height:built.height,seaLevel:built.seaLevel,
   wet:(x,z)=>built.water(x,z,built.height(x,z))!==null,
  },{maxSlope:.48,widthM:1.6});
  if(access.valid){layout={hut,sign,guide,bench,yaw};break search;}
  terrain.archipelago.features.pop();
 }
 if(!layout)throw Error('Station des Cimes : aucun site sec et accessible au pied du télésiège.');
 const station=layout;
 const chalet='station-cimes:chalet';
 const signage='station-cimes:panneau',interaction=signage+':lire';
 function place(id:string,name:string,assetId:string,point:PointXZ){
  project.assets[assetId]=assetDefinitionFor(assetId)!;
  const collider=colliderFor(assetId);
  putEntity(project,{id,name,kind:'prop',ownerChunkId:chunkAt(project.world,point.x,point.z),components:{
   Transform:{type:'Transform',position:{...point,y:0},rotation:yawQuaternion(station.yaw),
    scale:{x:1,y:1,z:1}},
   Visual:{type:'Visual',assetId},...(collider?{Collider:collider}:{}),
   ...(id===chalet?{ShopAccess:{type:'ShopAccess',version:1,offset:{x:0,y:0,z:-6},yaw:0,width:2.6,range:2.6},
    State:{type:'State',initial:{shop:'ski'}}}:{}),
   ...(id===signage?{State:{type:'State',initial:{alpineStation:true}},Interactable:{type:'Interactable',prompt:'Lire le plan de la station',range:2.5,
    interactionIds:[interaction]}}:{}),
  }});
 }
 project.libraries.interactions[interaction]={id:interaction,trigger:{type:'onInteract',entityId:signage},
  repeat:'always',sequence:[{type:'showText',text:'Station des Cimes · '+summary+' Matériel en vente au chalet. La télécabine monte au départ du Grand Couloir : ouvrez Courses pour lancer le Chrono des Cimes.'}]};
 place(chalet,'Chalet et magasin de la station',cabinAsset,layout.hut);
 place(signage,'Plan de la station','structure.signpost',layout.sign);
 place('station-cimes:banc','Banc du chalet','structure.bench',layout.bench);
 const guide=createCharacter(project,{id:'station-cimes:monitrice',name:'Ariane, monitrice de ski',...layout.guide,species:'hamster'});
 const dialogue=project.libraries.dialogues['dialogue:'+guide];
 dialogue.lines=[{id:dialogue.start,text:'Bienvenue à la station des Cimes ! '+summary+' La télécabine part juste à côté du chalet.',choices:[
  {text:'Comment prendre une remontée ?',next:'lift'},{text:'Où trouver des skis ?',next:'gear'},{text:'Comment lancer le chrono ?',next:'race'},{text:'À bientôt !'},
 ]},
 {id:'lift',text:'Approchez-vous de l’embarquement d’une télécabine, d’un télésiège ou du téléski et utilisez la commande d’action. La remontée vous dépose tout en haut. Les jalons verts, bleus, rouges et noirs indiquent la difficulté des pistes.',choices:[{text:'Merci !'}]},
 {id:'gear',text:'Le comptoir du chalet vend des skis et un snowboard. Une fois achetés, équipez-les depuis le sac ou avec B : sans matériel, on marche dans la neige.',choices:[{text:'Merci !'}]},
 {id:'race',text:'Au départ du Grand Couloir, choisissez votre chrono en skis ou en snowboard dans Courses. La première porte lance le temps. Gardez de la vitesse sur les deux tremplins.',choices:[{text:'Merci !'}]}];
}
