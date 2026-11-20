import type {PointXZ} from '../geography/archipelago.ts';
import type {RaceGate} from '../gameplay/races.ts';
import {assetDefinitionFor,colliderFor,worldAsset} from '../world-production/registry.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';
import {chunkAt} from './schema.ts';
import {putEntity} from './source.ts';
import {yawQuaternion} from './transforms.ts';
import {addSurfShoreQuest} from './surf-shore-quest.ts';
import type {ProjectDocument} from './types.ts';

const shoreHints:Readonly<Record<string,string>>={
  A:'Plage A · Le parcours le plus large pour apprendre à suivre les portes. Prenez le départ au large.',
  B:'Plage B · Les vagues forment des tubes. Suivez les portes vers le rivage.',
  C:'Plage C · Rampes et accélérateurs jalonnent le parcours. Prenez de la vitesse avant la rampe.',
};
const coastKit=[
  {id:'structure.beach_flag',name:'Fanion du parcours',side:0},
  {id:'structure.surf_rack',name:'Râtelier de planches',side:5},
  {id:'structure.beach_shelter',name:'Abri des surfeurs',side:-7},
];

export function addSurfShoreStops(project:ProjectDocument,beaches:readonly {name:string;gates:{gates:readonly RaceGate[]}}[]){
  const env=projectRaceTerrainEnvironment(project);
  const eligible=(point:PointXZ,radius:number)=>{
    const {x,z}=point,b=env.bounds;
    if(x-radius<b.minX||x+radius>b.maxX||z-radius<b.minZ||z+radius>b.maxZ)return false;
    const samples=[[0,0],[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]];
    const heights=samples.map(([dx,dz])=>env.height(x+dx,z+dz));
    return Math.min(...heights)>env.seaLevel+.65&&Math.max(...heights)-Math.min(...heights)<.9&&
      samples.every(([dx,dz],i)=>env.occupation(x+dx,z+dz)==='none'&&env.water(x+dx,z+dz,heights[i])===null);
  };
  const markers:string[]=[];
  let guide:PointXZ|undefined;
  for(const beach of beaches){
    const finish=beach.gates.gates.at(-1)!;
    const {x:dx,z:dz}=finish.normal;
    for(const prop of coastKit){
      const asset=assetDefinitionFor(prop.id)!;
      const bounds=worldAsset(prop.id)!.size;
      const radius=Math.hypot(bounds[0],bounds[2])/2;
      let point:PointXZ|undefined;
      for(let distance=30;distance<=460;distance+=5){
        const candidate={x:finish.center.x+dx*distance-dz*prop.side,z:finish.center.z+dz*distance+dx*prop.side};
        if(eligible(candidate,radius)){point=candidate;break;}
      }
      if(!point)throw Error('Aucun emplacement côtier sec pour '+prop.name+' · '+beach.name);
      const id='surf-shore:'+beach.name.toLowerCase()+':'+prop.id.split('.')[1];
      const collider=colliderFor(prop.id);
      const marker=prop.side===0,interactionId=id+':read',hint=shoreHints[beach.name];
      if(marker){
        markers.push(id);
        project.libraries.interactions[interactionId]={id:interactionId,trigger:{type:'onInteract',entityId:id},repeat:'always',
          sequence:[{type:'setState',entityId:id,key:'seen',value:true},{type:'showText',text:hint}]};
        if(beach.name==='A'){
          guide=[4,6,9].map(offset=>({x:point.x+dx*offset,z:point.z+dz*offset})).find(candidate=>eligible(candidate,.5));
        }
      }
      project.assets[asset.id]=asset;
      putEntity(project,{id,name:prop.name+' · plage '+beach.name,kind:'prop',ownerChunkId:chunkAt(project.world,point.x,point.z),components:{
        Transform:{type:'Transform',position:{...point,y:0},rotation:yawQuaternion(Math.atan2(dx,dz)),scale:{x:1,y:1,z:1}},
        Visual:{type:'Visual',assetId:asset.id},...(collider?{Collider:collider}:{}),
        ...(marker?{State:{type:'State',initial:{seen:false,surfShoreMarker:beach.name}},Persistence:{type:'Persistence',fields:['seen']},
          Interactable:{type:'Interactable',prompt:'Lire le fanion '+beach.name,range:2.5,interactionIds:[interactionId]}}:{}),
      }});
    }
  }
  if(!guide)throw Error('Aucun emplacement sec près du fanion A pour le moniteur.');
  return addSurfShoreQuest(project,guide,markers);
}
