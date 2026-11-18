/** Versioned, project-owned courses. Mutations belong to Studio's shared CommandBus. */
import type {ProjectDocument,WorldDefinitionV3} from './types.ts';
import {validateRace,type RaceDefinition,type RaceGate,type RaceKind,type RacePoint} from '../gameplay/races.ts';
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:Record<string,unknown>,keys:readonly string[],label:string)=>{
 for(const k of Object.keys(v))if(!keys.includes(k))throw Error(label+' : champ inconnu '+k);
};
const limits=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const pathLength=(points:readonly {x:number;z:number}[])=>points.slice(1).reduce((total,p,i)=>total+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
export function sourceRaceKey(race:Pick<RaceDefinition,'kind'|'gates'|'maxTicks'|'worldId'|'id'>):string{
 // Fast stable dual hash of author-owned gameplay geometry. It is NOT a server signature.
 const source=JSON.stringify([race.worldId,race.id,race.kind,race.maxTicks,race.gates]);
 let a=2166136261,b=2246822519;
 for(let i=0;i<source.length;i++){
  const c=source.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,3266489917);
 }
 return 'studio:'+((a>>>0).toString(16).padStart(8,'0'))+((b>>>0).toString(16).padStart(8,'0'));
}
/** Strict at the importer/compiled boundary; optional field on old V3 projects. */
export function validateAuthoredRace(raw:unknown,world:WorldDefinitionV3):RaceDefinition{
 if(!isObj(raw))throw Error('Circuit : objet attendu');
 only(raw,['id','name','version','worldId','layoutKey','kind','classification','gates','maxTicks','startOnFirstGate'],'Circuit');
 if(typeof raw.id!=='string'||!/^race:[a-zA-Z0-9_-]{1,100}$/.test(raw.id)||
    typeof raw.name!=='string'||raw.name.trim().length<2||raw.name.length>100||
    raw.worldId!==world.worldId||raw.startOnFirstGate!==true||raw.classification!=='practice')
  throw Error('Circuit : identifiant, nom ou monde invalide');
 if(!Array.isArray(raw.gates))throw Error('Circuit : checkpoints absents');
 for(const rawGate of raw.gates){
   if(!isObj(rawGate))throw Error('Checkpoint : objet attendu');
   only(rawGate,['id','center','normal','shape','width','height','allowedModes'],'Checkpoint');
   for(const key of ['center','normal']){
     const point=rawGate[key];
     if(!isObj(point))throw Error('Checkpoint : position ou orientation absente');
     only(point,['x','y','z'],'Point checkpoint');
   }
 }
 const race=validateRace(raw as unknown as RaceDefinition,world.bounds);
 if(race.layoutKey!==sourceRaceKey(race))throw Error('Circuit : empreinte du tracé invalide');
 for(const gate of race.gates){
   if(!limits(gate.center.y,-1000,10000))throw Error('Altitude de checkpoint invalide');
 }
 return race;
}
export function putAuthoredRace(document:ProjectDocument,race:RaceDefinition){
 if(Object.keys(document.libraries.races??{}).length>=64&&!document.libraries.races?.[race.id])throw Error('64 circuits maximum');
 const parsed:RaceDefinition=structuredClone({...race,layoutKey:sourceRaceKey(race)});
 validateAuthoredRace(parsed,document.world);
 document.libraries.races={...(document.libraries.races??{}),[parsed.id]:parsed};
}
export function removeAuthoredRace(document:ProjectDocument,id:string){
 if(!document.libraries.races?.[id])return;
 const next={...document.libraries.races};delete next[id];document.libraries.races=next;
}
export function gatesFromTrace(points:readonly {x:number;z:number}[],kind:RaceKind,
 height:(x:number,z:number)=>number,old?:RaceDefinition):RaceGate[]{
 if(points.length<2||points.length>24||pathLength(points)<5)throw Error('Tracez au moins deux checkpoints distincts');
 return points.map((p,i)=>{
   const p0=points[Math.max(0,i-1)],p1=points[Math.min(points.length-1,i+1)];
   const dx=p1.x-p0.x,dz=p1.z-p0.z,d=Math.hypot(dx,dz);
   if(d<1e-5)throw Error('Directions de checkpoints superposées');
   const previous=old?.gates[i],flight=kind==='flight'||kind==='mixed'&&i>=2;
   const shape=previous?.shape??(flight?'circle':'rectangle');
   const gHeight=height(p.x,p.z),oldGround=previous?height(previous.center.x,previous.center.z):gHeight;
   const y=previous?gHeight+(previous.center.y-oldGround):gHeight+(flight?12:1.6);
   return {id:previous?.id??'gate-'+(i+1),center:{x:p.x,y,z:p.z},normal:{x:dx/d,y:0,z:dz/d},
     shape,width:previous?.width??(flight?16:9),height:previous?.height??(flight?16:5),
     allowedModes:previous?.allowedModes??(flight?['glide']:['roll'])};
 });
}
export function authoredRaceFromTrace(world:WorldDefinitionV3,options:{
 id:string;name:string;kind:RaceKind;points:readonly {x:number;z:number}[];
 height:(x:number,z:number)=>number;old?:RaceDefinition
}):RaceDefinition{
 const gates=gatesFromTrace(options.points,options.kind,options.height,options.old);
 const race:RaceDefinition={id:options.id,name:options.name,kind:options.kind,worldId:world.worldId,
   version:1,layoutKey:'',classification:'practice',startOnFirstGate:true,
   gates,maxTicks:options.old?.maxTicks??30*180};
 race.layoutKey=sourceRaceKey(race);
 return validateAuthoredRace(race,world);
}
