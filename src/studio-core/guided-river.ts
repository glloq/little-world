/** Downhill river authoring helper: reuse the existing hydraulic solver and network,
 * with an explicitly chosen start and heading. No procedural river is accepted
 * without the same WaterProfile validation used by the compiled game. */
import type {WaterBody,WaterLink} from '../world-data.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {traceDownhill,type TraceResult} from '../world-production/hydro-trace.ts';
import {compileWaterNetwork} from '../water/profile.ts';
export interface GuidedRiverContext {
 height(x:number,z:number):number;
 water(x:number,z:number):number|null;
 inWorld(x:number,z:number):boolean;
 seaLevel:number;
 existing:WaterBody[];
}
export interface GuidedRiverOptions {width:number;depth:number;maxLengthM:number;id:string}
export interface GuidedRiverResult {water:WaterBody;trace:TraceResult;warnings:string[]}
const distance=(p:PointXZ,q:PointXZ)=>Math.hypot(p.x-q.x,p.z-q.z);
function snapToSegment(p:PointXZ,a:PointXZ,b:PointXZ):{q:PointXZ;distance:number}{
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.min(1,Math.max(0,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
 const q={x:a.x+t*dx,z:a.z+t*dz};return {q,distance:distance(q,p)};
}
function receivingWater(existing:WaterBody[],end:PointXZ):{link:WaterLink;point:PointXZ;distance:number}|null{
 let best:{link:WaterLink;point:PointXZ;distance:number}|null=null;
 for(const w of existing){
  const points=w.points;if(points.length<2)continue;
  const closed=w.kind==='lake';
  for(let i=0;i<points.length-1+(closed?1:0);i++){
   const {q,distance:d}=snapToSegment(end,points[i],points[(i+1)%points.length]);
   if(d<(best?.distance??Infinity))best={link:{kind:closed?'lake':'river',id:w.id},point:q,distance:d};
  }
 }
 return best&&best.distance<=8?best:null;
}
export function planGuidedRiver(start:PointXZ,toward:PointXZ,context:GuidedRiverContext,options:GuidedRiverOptions):GuidedRiverResult{
 if(!context.inWorld(start.x,start.z)||!context.inWorld(toward.x,toward.z))throw Error('Cours d’eau hors carte');
 if(distance(start,toward)<3)throw Error('Choisir une direction à au moins 3 m de la source');
 if(!Number.isFinite(options.width)||options.width<1||options.width>40||!Number.isFinite(options.depth)||options.depth<.5||options.depth>20||!Number.isFinite(options.maxLengthM)||options.maxLengthM<40||options.maxLengthM>4000||!options.id)throw Error('Paramètres du cours d’eau invalides');
 const trace=traceDownhill(start,{height:context.height,water:context.water,inWorld:context.inWorld,seaLevel:context.seaLevel,
    heading:Math.atan2(toward.z-start.z,toward.x-start.x),maxLengthM:options.maxLengthM,
    stepM:10,spacingM:18,maxPoints:90,climbM:3});
 if(trace.points.length<2||distance(trace.points[0],trace.points.at(-1)!)<10)throw Error('Aucun cours d’eau descendant praticable trouvé. Modifier la source ou le relief.');
 const points=trace.points.map(q=>({...q})),warnings:string[]=[];
 let to:WaterLink|undefined;
 if(trace.end==='sea')to={kind:'sea'};
 else if(trace.end==='water'){
   const receiver=receivingWater(context.existing,points.at(-1)!);
   if(receiver){
     points[points.length-1]=receiver.point;to=receiver.link;
     warnings.push('Raccordement à '+receiver.link.kind+' : '+receiver.link.id);
   }else warnings.push('Point d’eau atteint sans raccordement identifiable : vérifier le réseau');
 }
 else warnings.push('Fin '+trace.end+' : créer un lac de réception ou prolonger le tracé');
 const water:WaterBody={id:options.id,kind:'river',points,width:options.width,depth:options.depth,
   level:Math.max(-20,Math.min(100,context.height(start.x,start.z)-.35)),
   profile:{mode:'terrain',offset:-.35},...(to?{to}:{})};
 const compiled=compileWaterNetwork([...context.existing,water],context.height,context.seaLevel).at(-1)!;
 const errors=compiled.diagnostics.filter(d=>d.severity==='ERROR');
 if(errors.length)throw Error('Rivière non applicable : '+errors.map(d=>d.message).join(' '));
 warnings.push(...compiled.diagnostics.filter(d=>d.severity==='WARNING').map(d=>d.message));
 return {water,trace,warnings};
}
