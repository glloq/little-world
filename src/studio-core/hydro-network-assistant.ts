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
  if((source.falls?.length??0)>=8)continue;
  for(let i=1;i<source.points.length-1;i++){
   if(source.falls?.some(f=>f.at===i))continue;
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

/** Optional explicit waterfall, using terrain profile elevations and the existing WATER compiler.
 * No fall is saved if it introduces a compiler error; max 8 falls per river. */
export function planHydroFall(waters:readonly WaterBody[],candidate:HydroFallAdvice,height:(x:number,z:number)=>number,seaLevel:number):WaterBody{
 const river=waters.find(w=>w.id===candidate.riverId);
 if(!river||river.kind==='lake'||river.profile?.mode==='manual')throw Error('Cascade automatique réservée aux cours d’eau à profil terrain');
 const index=candidate.point-1;
 if(index<1||index>=river.points.length-1||river.falls?.some(f=>f.at===index)||(river.falls?.length??0)>=8)throw Error('Point de cascade invalide ou limite atteinte');
 const previous=compileWaterNetwork([...waters],height,seaLevel).find(w=>w.id===river.id);
 if(!previous||previous.diagnostics.some(d=>d.severity==='ERROR'))throw Error('Corriger le réseau hydrologique avant de créer une cascade');
 const position=river.points[index];
 const at=previous.points.reduce((best,p)=>Math.hypot(p.x-position.x,p.z-position.z)<Math.hypot(best.x-position.x,best.z-position.z)?p:best);
 const top=Number(at.level.toFixed(2)),downstream=river.points[index+1];
 const bottom=Number(Math.min(top-1,height(downstream.x,downstream.z)+(river.profile?.mode==='terrain'?river.profile.offset:-.35)).toFixed(2));
 if(!Number.isFinite(top)||!Number.isFinite(bottom)||bottom< -50||top>150||top-bottom<1)throw Error('Chute incompatible avec les altitudes autorisées');
 const updated:WaterBody={...structuredClone(river),falls:[...(river.falls??[]),{at:index,top,bottom}].sort((a,b)=>a.at-b.at)};
 const compiled=compileWaterNetwork([...waters.filter(w=>w.id!==river.id),updated],height,seaLevel);
 const errors=compiled.flatMap(w=>w.diagnostics.filter(d=>d.severity==='ERROR').map(d=>w.id+': '+d.message));
 if(errors.length)throw Error('Cascade refusée par le moteur hydrologique : '+errors.join(' ; '));
 return updated;
}

/** Bounded batch waterfall proposals. Each candidate is checked with the same WATER
 * compiler against all previously accepted candidates. Does not mutate input. */
export function planHydroFalls(
 waters:readonly WaterBody[],candidates:readonly HydroFallAdvice[],
 height:(x:number,z:number)=>number,seaLevel:number,maxFalls=6
):{changes:WaterBody[];rejected:{riverId:string;point:number;reason:string}[]}{
 const limit=Math.min(8,Math.max(1,Math.floor(maxFalls))),current=new Map(waters.map(w=>[w.id,structuredClone(w)]));
 const changed=new Set<string>(),rejected:{riverId:string;point:number;reason:string}[]=[];
 const sorted=[...candidates].sort((a,b)=>b.dropM-a.dropM||a.riverId.localeCompare(b.riverId)||a.point-b.point);
 for(const candidate of sorted.slice(0,64)){
  if([...changed].reduce((sum,id)=>sum+(current.get(id)?.falls?.length??0)-(waters.find(w=>w.id===id)?.falls?.length??0),0)>=limit)break;
  try{
   const updated=planHydroFall([...current.values()],candidate,height,seaLevel);
   current.set(updated.id,updated);changed.add(updated.id);
  }catch(error){rejected.push({riverId:candidate.riverId,point:candidate.point,reason:error instanceof Error?error.message:String(error)});}
 }
 return {changes:[...changed].sort().map(id=>current.get(id)!),rejected};
}
