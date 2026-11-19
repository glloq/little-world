/** Three actually separate, terrain-checked surf beaches on an authored island.
 * Planning is pure/deterministic. Studio commits A/B/C and the races atomically
 * only if every requested site is valid; no procedural port mesh is invented. */
import {findCoastalSurfSites,surfDemoRun,type SurfBounds,type SurfDemoSite,type SurfSiteSizes} from './surf-demo.ts';
import {validateSurfZone,type SurfZone} from './wave-field.ts';
import {validateSurfFeature,type SurfFeature} from './surf-features.ts';
import type {RaceDefinition,RaceGate} from '../gameplay/races.ts';
import {validateRace} from '../gameplay/races.ts';
import {sourceRaceKey} from '../studio-core/race-authoring.ts';
export type SurfAreaName='A'|'B'|'C';
export interface SurfCoastPlan {
 zone:SurfZone;label:string;name:SurfAreaName;
 start:{x:number;z:number};gates:RaceDefinition;features:SurfFeature[];
}
export interface SurfIslandLayout {
 beaches:SurfCoastPlan[];
 /** Marker only; real wharf/boat/merchant use existing separate port authoring. */
 calmPort:{x:number;z:number;radius:number}|null;
 warnings:string[];
}
const styles={
 A:{label:'A · Initiation',amplitude:.65,wavelength:25,speed:4.5,barrelStrength:0,style:'gentle'},
 B:{label:'B · Grandes vagues',amplitude:1.45,wavelength:36,speed:6.3,barrelStrength:1,style:'tubular'},
 C:{label:'C · Acrobaties',amplitude:1.65,wavelength:29,speed:8,barrelStrength:.6,style:'fast'},
} as const;
const ISLAND_SITE_SIZES:readonly SurfSiteSizes[]=[
 {lengths:[300,260,230,205,165,125],widths:[260,220,180,150,120,98,76]},
 {lengths:[260,230,205,165,125],widths:[180,150,120,98,76]},
 {}, // historical demo sizes
];
/** Organic outline and gently curved, meandering crests for the authored surf beaches. */
const ISLAND_FORMS={
 A:{organic:true,curvature:.0012,meander:4,meanderLength:170},
 B:{organic:true,curvature:-.0016,meander:6,meanderLength:140},
 C:{organic:true,curvature:.001,meander:5,meanderLength:120},
} as const;
const rectDistance=(r:SurfZone,x:number,z:number)=>
 Math.hypot(Math.max(r.minX-x,0,x-r.maxX),Math.max(r.minZ-z,0,z-r.maxZ));
const inBounds=(b:SurfBounds,x:number,z:number,m=3)=>x>=b.minX+m&&x<=b.maxX-m&&z>=b.minZ+m&&z<=b.maxZ-m;
const depth=(h:(x:number,z:number)=>number,s:number,x:number,z:number)=>s-h(x,z);
const blocked=(occ?:string|null)=>occ!==undefined&&occ!==null&&occ!==''&&occ!=='none';
const overlap=(a:SurfZone,b:SurfZone,gap=12)=>
 a.minX<b.maxX+gap&&a.maxX>b.minX-gap&&a.minZ<b.maxZ+gap&&a.maxZ>b.minZ-gap;
const coastPoint=(site:SurfDemoSite,dist:number,side:number)=>({
 x:(site.shore?.x??site.start.x)+(-site.zone.dirX)*dist-site.zone.dirZ*side,
 z:(site.shore?.z??site.start.z)+(-site.zone.dirZ)*dist+site.zone.dirX*side
});
/** Reject occupied ports, swimming passages, buildings and routes without
 * relying on a single center point. 'none' is the normal free-occupation value. */
function usable(site:SurfDemoSite,ground:(x:number,z:number)=>number,
 bounds:SurfBounds,sea:number,occupied?:(x:number,z:number)=>string|null):boolean{
 const width=Math.min(site.zone.maxX-site.zone.minX,site.zone.maxZ-site.zone.minZ);
 for(const distance of [12,25,45,Math.min(80,surfDemoRun(site)+18)])
  // Wide zones: also check their lateral edges (ports, passages, buildings).
  for(const side of [-Math.min(20,width*.26),0,Math.min(20,width*.26),
    ...(width>60?[-width*.45,width*.45]:[])]){
   const p=coastPoint(site,distance,side);
   if(!inBounds(bounds,p.x,p.z,4)||depth(ground,sea,p.x,p.z)<(distance<=12?.1:.6)||
      blocked(occupied?.(p.x,p.z)))return false;
  }
 return true;
}
export function planThreeSurfBeaches(ground:(x:number,z:number)=>number,
 bounds:SurfBounds,seaLevel:number,seed:number,worldId:string,
 occupied?:(x:number,z:number)=>string|null):SurfIslandLayout{
 if(!worldId||!Number.isSafeInteger(seed)||seed<0)throw Error('Monde de surf invalide');
 // Dedicated surf map: the largest breaking areas that still leave three separate beaches
 // and a calm port marker; smaller sizes (historical last) only as fallback.
 let best:SurfIslandLayout|null=null;
 for(const sizes of ISLAND_SITE_SIZES){
  const plan=planWithSizes(ground,bounds,seaLevel,seed,worldId,sizes,occupied);
  if(plan.beaches.length===3&&plan.calmPort)return plan;
  if(!best||plan.beaches.length>best.beaches.length)best=plan;
 }
 return best!;
}
function planWithSizes(ground:(x:number,z:number)=>number,bounds:SurfBounds,seaLevel:number,seed:number,
 worldId:string,sizes:SurfSiteSizes,occupied?:(x:number,z:number)=>string|null):SurfIslandLayout{
 const sites=findCoastalSurfSites(ground,bounds,seaLevel,seed,64,sizes),beaches:SurfCoastPlan[]=[],
  warnings:string[]=[];
 if(!sites.length)return {beaches,calmPort:null,
  warnings:['Aucune côte adaptée : aucun couloir d’eau libre suffisamment profond.']};
 for(const name of ['A','B','C'] as const){
  const pref=styles[name];
  const site=sites.find(candidate=>
   usable(candidate,ground,bounds,seaLevel,occupied)&&
   beaches.every(previous=>!overlap(previous.zone,candidate.zone,28)));
  if(!site){warnings.push('Plage '+name+' : aucune bande côtière libre et séparée.');continue;}
  const zone=validateSurfZone({...site.zone,id:'surf:island-'+name.toLowerCase()+'-'+seed,
   seed:seed+name.charCodeAt(0),amplitude:pref.amplitude,wavelength:pref.wavelength,
   speed:pref.speed,barrelStrength:pref.barrelStrength,style:pref.style,
   form:{...ISLAND_FORMS[name]},edgeFade:Math.min(45,Math.max(18,Math.min(site.zone.maxX-site.zone.minX,site.zone.maxZ-site.zone.minZ)*.16))});
  const d=zone,startPoint=site.start,run=surfDemoRun(site);
  const gates:RaceGate[]=[0,.33*run,.66*run,run].map((distance,i)=>({
   id:'surf-'+name.toLowerCase()+'-gate-'+(i+1),
   center:{x:startPoint.x+d.dirX*distance,y:seaLevel+.4,z:startPoint.z+d.dirZ*distance},
   normal:{x:d.dirX,y:0,z:d.dirZ},shape:'rectangle',width:name==='A'?20:14,
   height:8,allowedModes:['surf','air']
  }));
  const race:RaceDefinition={id:'race:surf-'+name.toLowerCase()+'-'+seed,
   name:'Surf '+pref.label,version:1,worldId,layoutKey:'',kind:'surf',
   classification:'practice',startOnFirstGate:true,
   maxTicks:name==='A'?30*180:30*135,gates};
  race.layoutKey=sourceRaceKey(race);validateRace(race,bounds);
  const features:SurfFeature[]=[];
  if(name==='C')for(const [kind,distance,side,power] of [
   ['boost',.22*run,0,5],['ramp',.53*run,0,1.4],['buoy',.8*run,Math.min(11,(d.maxX-d.minX)/4),0]
  ] as const){
   const pos={x:startPoint.x+d.dirX*distance-d.dirZ*side,
    z:startPoint.z+d.dirZ*distance+d.dirX*side};
   if(depth(ground,seaLevel,pos.x,pos.z)<1.2)continue;
   features.push(validateSurfFeature({id:'surf-feature:island-'+name.toLowerCase()+'-'+kind+'-'+seed,
    kind,x:pos.x,z:pos.z,dirX:d.dirX,dirZ:d.dirZ,
    radius:kind==='buoy'?2:kind==='ramp'?4.5:5,
    power,cooldownTicks:kind==='buoy'?25:150}));
  }
  beaches.push({zone,name,label:pref.label,start:startPoint,gates:race,features});
 }
 // Prefer a fourth, calm site away from all surfing lanes and obstacles.
 let calmPort:null|{x:number;z:number;radius:number}=null;
 // Calm water only needs a coast point: search the denser historical candidate list.
 const calmSites=findCoastalSurfSites(ground,bounds,seaLevel,seed,64);
 for(const site of calmSites){
  if(!site.shore)continue;
  const q=coastPoint(site,27,0),shore=coastPoint(site,-9,0);
  // The calm marker itself must stay ≥ 65 m (plus its radius) from every breaking zone.
  if(beaches.some(b=>rectDistance(b.zone,q.x,q.z)<65+26))continue;
  if(!inBounds(bounds,q.x,q.z,30)||depth(ground,seaLevel,q.x,q.z)<1.2||
    ground(shore.x,shore.z)<=seaLevel+.2||blocked(occupied?.(q.x,q.z))||
    blocked(occupied?.(shore.x,shore.z)))continue;
  calmPort={x:q.x,z:q.z,radius:26};break;
 }
 if(!calmPort)warnings.push('Port calme : quai et bateau à implanter sur une côte hors zone de déferlement.');
 return {beaches,calmPort,warnings};
}
