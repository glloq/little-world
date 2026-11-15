/** A3: deterministic, bounded hydro-network suggestions, no autonomous terrain edits.
 * Links are committed only after the same compiler's network checks succeed.
 * Waterfalls are flagged as candidates, never silently added to source documents. */
import type {WaterBody,WaterLink} from '../world-data.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {compileWaterNetwork,type HydroDiagnostic} from '../water/profile.ts';
export interface HydroLinkAdvice {sourceId:string;targetId:string;targetKind:'lake'|'river';distanceM:number;snapped:PointXZ}
export interface HydroFallAdvice {riverId:string;point:number;dropM:number;slope:number}
export interface HydroReview {diagnostics:{id:string;diagnostic:HydroDiagnostic}[];links:HydroLinkAdvice[];falls:HydroFallAdvice[]}
const dist=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
function closestSegment(point:PointXZ,points:PointXZ[],closed:boolean){
 let closest:PointXZ|null=null,best=Infinity;
 for(let j=1;j<points.length+(closed?1:0);j++){
  const a=points[j-1],b=points[j%points.length],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  const q={x:a.x+dx*t,z:a.z+dz*t},d=dist(point,q);
  if(d<best){best=d;closest=q;}
 }
 return closest?{point:closest,distance:best}:null;
}
export function reviewHydroNetwork(waters:readonly WaterBody[],height:(x:number,z:number)=>number,seaLevel:number):HydroReview {
 const compiled=compileWaterNetwork([...waters],height,seaLevel);
 const diagnostics=compiled.flatMap(w=>w.diagnostics.map(diagnostic=>({id:w.id,diagnostic})));
 const links:HydroLinkAdvice[]=[],falls:HydroFallAdvice[]=[];
 for(const source of waters){
  if(source.kind==='lake'||source.points.length<2)continue;
  const last=source.points.at(-1)!;
  if(!source.to){
   let nearest:HydroLinkAdvice|null=null;
   for(const target of waters){
    if(target.id===source.id||target.points.length<2)continue;
    const projected=closestSegment(last,target.points,target.kind==='lake');
    if(!projected||projected.distance>10||projected.distance>= (nearest?.distanceM??Infinity))continue;
    nearest={sourceId:source.id,targetId:target.id,targetKind:target.kind==='lake'?'lake':'river',
      distanceM:projected.distance,snapped:projected.point};
   }
   if(nearest)links.push(nearest);
  }
  if(source.falls?.length)continue;
  for(let i=1;i<source.points.length-1;i++){
   const dx=dist(source.points[i-1],source.points[i]);
   if(dx<1)continue;
   const drop=height(source.points[i-1].x,source.points[i-1].z)-height(source.points[i].x,source.points[i].z),slope=drop/dx;
   if(drop>=2.5&&slope>.18)falls.push({riverId:source.id,point:i+1,dropM:drop,slope});
   if(falls.length>=64)break;
  }
 }
 links.sort((a,b)=>a.distanceM-b.distanceM||a.sourceId.localeCompare(b.sourceId));
 return {diagnostics,links:links.slice(0,64),falls:falls.slice(0,64)};
}
/** Propose, but do not mutate, a downstream link. Reject every new compiler error.
 * Edits are handed to StudioSession.change + putWater by the caller. */
export function planHydroLink(waters:readonly WaterBody[],candidate:HydroLinkAdvice,height:(x:number,z:number)=>number,seaLevel:number):WaterBody {
 const source=waters.find(w=>w.id===candidate.sourceId),target=waters.find(w=>w.id===candidate.targetId);
 if(!source||source.kind==='lake'||!target||source.id===target.id||source.to||source.points.length<2)throw Error('Raccordement impossible : source, destination ou lien existant invalide');
 const nearest=closestSegment(source.points.at(-1)!,target.points,target.kind==='lake');
 if(!nearest||nearest.distance>10)throw Error('Exutoire trop éloigné : rapprocher le dernier point');
 const to:WaterLink={kind:target.kind==='lake'?'lake':'river',id:target.id};
 const points=source.points.map(p=>({...p}));points[points.length-1]=nearest.point;
 const updated:WaterBody={...structuredClone(source),points,to};
 const compiled=compileWaterNetwork([...waters.filter(w=>w.id!==source.id),updated],height,seaLevel);
 const errors=compiled.flatMap(w=>w.diagnostics.filter(d=>d.severity==='ERROR').map(d=>w.id+': '+d.message));
 if(errors.length)throw Error('Raccordement refusé par le moteur hydrologique : '+errors.join(' ; '));
 return updated;
}
