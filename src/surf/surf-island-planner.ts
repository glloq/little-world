/** Deterministic three-beach surf layout on an EXISTING generated island.
 * This is a planning aid: the Studio transaction owns publication and may reject
 * sites with incompatible shallow water, a missing coast or an occupied harbour. */
import {findDemoSurfSite,type SurfBounds} from './surf-demo.ts';
import {validateSurfZone,type SurfZone} from './wave-field.ts';
import {validateSurfFeature,type SurfFeature} from './surf-features.ts';
import type {RaceDefinition,RaceGate} from '../gameplay/races.ts';
import {validateRace} from '../gameplay/races.ts';
import {sourceRaceKey} from '../studio-core/race-authoring.ts';

export type SurfAreaName='A'|'B'|'C';
export interface SurfCoastPlan {
 zone:SurfZone; label:string;name:SurfAreaName;
 start:{x:number;z:number}; gates:RaceDefinition; features:SurfFeature[];
}
export interface SurfIslandLayout {
 beaches:SurfCoastPlan[];
 /** Reserved calm water and shoreline: a real dock/merchant is NOT created here. */
 calmPort:{x:number;z:number;radius:number}|null;
 warnings:string[];
}
const settings={
 A:{label:'A · Initiation',amplitude:.65,wavelength:25,speed:4.5,barrelStrength:0,width:90,offset:-135},
 B:{label:'B · Grandes vagues',amplitude:1.45,wavelength:36,speed:6.3,barrelStrength:1,width:100,offset:0},
 C:{label:'C · Acrobaties',amplitude:1.65,wavelength:29,speed:8,barrelStrength:.6,width:105,offset:135},
} as const;
const inBounds=(b:SurfBounds,x:number,z:number,m=3)=>x>=b.minX+m&&x<=b.maxX-m&&z>=b.minZ+m&&z<=b.maxZ-m;
const depth=(ground:(x:number,z:number)=>number,sea:number,x:number,z:number)=>sea-ground(x,z);
export function planThreeSurfBeaches(ground:(x:number,z:number)=>number,
 bounds:SurfBounds,seaLevel:number,seed:number,worldId:string,
 occupied?:(x:number,z:number)=>string|null):SurfIslandLayout{
 if(!worldId||!Number.isSafeInteger(seed)||seed<0)throw Error('Monde de surf invalide');
 const start=findDemoSurfSite(ground,bounds,seaLevel,seed);
 if(!start)return {beaches:[],calmPort:null,warnings:['Aucune côte surfable détectée : il faut une île entourée de mer jouable.']};
 const d=start.zone,t={x:-d.dirZ,z:d.dirX},beaches:SurfCoastPlan[]=[],warnings:string[]=[];
 for(const name of ['A','B','C'] as const){
  const pref=settings[name],p={x:start.start.x+t.x*pref.offset,z:start.start.z+t.z*pref.offset};
  let coast:number|null=null;
  for(let a=0;a<=270;a+=4){
   const x=p.x+d.dirX*a,z=p.z+d.dirZ*a;
   if(!inBounds(bounds,x,z,2))break;
   if(depth(ground,seaLevel,x,z)<.15){coast=a;break;}
  }
  if(coast===null||coast<32){warnings.push(pref.label+' : bande côtière absente ou trop proche.');continue;}
  const at=(shoreDistance:number,side=0)=>({
   x:p.x+d.dirX*(coast!-shoreDistance)+t.x*side,
   z:p.z+d.dirZ*(coast!-shoreDistance)+t.z*side
  });
  const near=at(12),far=at(205),half=pref.width/2;
  const bounds2={minX:Math.min(near.x,far.x)-Math.abs(t.x)*half,
   maxX:Math.max(near.x,far.x)+Math.abs(t.x)*half,
   minZ:Math.min(near.z,far.z)-Math.abs(t.z)*half,
   maxZ:Math.max(near.z,far.z)+Math.abs(t.z)*half};
  let valid=true;
  for(const dist of [12,25,65,120,180,205])for(const side of [-half*.82,0,half*.82]){
   const q=at(dist,side);
   if(!inBounds(bounds,q.x,q.z,4)||depth(ground,seaLevel,q.x,q.z)<.45||
      occupied?.(q.x,q.z)){valid=false;break;}
  }
  if(!valid||![bounds2.minX,bounds2.maxX].every(x=>x>=bounds.minX&&x<=bounds.maxX)||
     ![bounds2.minZ,bounds2.maxZ].every(z=>z>=bounds.minZ&&z<=bounds.maxZ)){
   warnings.push(pref.label+' : profondeur, limites ou occupation incompatibles.');continue;
  }
  const zone=validateSurfZone({id:'surf:island-'+name.toLowerCase()+'-'+seed,...bounds2,
    dirX:d.dirX,dirZ:d.dirZ,seaLevel,amplitude:pref.amplitude,
    wavelength:pref.wavelength,speed:pref.speed,seed:seed+name.charCodeAt(0),
    shoreFadeDepth:3,edgeFade:9,barrelStrength:pref.barrelStrength});
  const startPoint=at(175),gateDistances=[0,45,91,135];
  const gates:RaceGate[]=gateDistances.map((forward,i)=>{
   const q={x:startPoint.x+d.dirX*forward,z:startPoint.z+d.dirZ*forward};
   return {id:'surf-'+name.toLowerCase()+'-gate-'+(i+1),center:{x:q.x,y:seaLevel+.4,z:q.z},
    normal:{x:d.dirX,y:0,z:d.dirZ},shape:'rectangle',width:name==='A'?23:16,
    height:8,allowedModes:['surf','air']};
  });
  const race:RaceDefinition={id:'race:surf-'+name.toLowerCase()+'-'+seed,name:'Surf '+pref.label,
    version:1,worldId,layoutKey:'',kind:'surf',classification:'practice',
    startOnFirstGate:true,maxTicks:name==='A'?30*180:30*135,gates};
  race.layoutKey=sourceRaceKey(race);
  validateRace(race,bounds);
  const features:SurfFeature[]=[];
  if(name==='C'){
   for(const [kind,dist,side,power] of [
    ['boost',145,0,5],['ramp',93,0,1.4],['buoy',40,17,0],
   ] as const){
    const q=at(dist,side);
    if(depth(ground,seaLevel,q.x,q.z)<1.2)continue;
    const f:SurfFeature={id:'surf-feature:island-'+name.toLowerCase()+'-'+kind+'-'+seed,
     kind,x:q.x,z:q.z,dirX:d.dirX,dirZ:d.dirZ,
     radius:kind==='buoy'?2:kind==='ramp'?4.5:5,power,cooldownTicks:kind==='buoy'?25:150};
    features.push(validateSurfFeature(f));
   }
  }
  beaches.push({zone,label:pref.label,name,start:startPoint,gates:race,features});
 }
 // Port location is a reserved *planning suggestion*, not an installed dock/boat.
 const portCenter={x:start.start.x+t.x*290,z:start.start.z+t.z*290};
 let calmPort:null|{x:number;z:number;radius:number}=null;
 if(inBounds(bounds,portCenter.x,portCenter.z,28)&&
    depth(ground,seaLevel,portCenter.x,portCenter.z)>=1.4&&
    !occupied?.(portCenter.x,portCenter.z)&&
    beaches.every(v=>Math.hypot(v.start.x-portCenter.x,v.start.z-portCenter.z)>100))
   calmPort={...portCenter,radius:26};
 else warnings.push('Port calme : zone libre non trouvée ; placer le quai et le marchand séparément.');
 return {beaches,calmPort,warnings};
}
