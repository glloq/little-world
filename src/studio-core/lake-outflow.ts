/** Explicit lake overflow authoring.
 * Traces DOWNSTREAM from a boundary point near a surveyed spillway. The lake
 * supplies the initial water level and the existing WATER graph validates it.
 * Does not modify the lake, terrain, rainfall or the world document. */
import type {WaterBody,WaterLink} from '../world-data.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {polygonSignedDistance,compileWaterNetwork} from '../water/profile.ts';
import {planGuidedRiver,type GuidedRiverContext,type GuidedRiverOptions,type GuidedRiverResult} from './guided-river.ts';
const distance=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
function nearestShore(lake:WaterBody,p:PointXZ):{point:PointXZ;distance:number}{
 let nearest={point:lake.points[0],distance:Infinity};
 for(let i=0;i<lake.points.length;i++){
  const a=lake.points[i],b=lake.points[(i+1)%lake.points.length],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  const q={x:a.x+t*dx,z:a.z+t*dz},d=distance(p,q);
  if(d<nearest.distance)nearest={point:q,distance:d};
 }
 return nearest;
}
export interface SpillwayEdge {crest:PointXZ;downstream:PointXZ;dropM:number;distanceM:number}
export function planLakeOutflow(
 lake:WaterBody,spillway:SpillwayEdge,ctx:GuidedRiverContext,options:GuidedRiverOptions
):GuidedRiverResult{
 if(lake.kind!=='lake')throw Error('Choisir un lac source');
 if(!ctx.existing.some(w=>w.id===lake.id&&w.kind==='lake'))throw Error('Lac source absent du réseau actuel');
 if(ctx.existing.some(w=>w.id===options.id))throw Error('Rivière de sortie déjà présente dans le réseau');
 const shore=nearestShore(lake,spillway.crest);
 if(shore.distance>Math.max(12,options.width*2))throw Error('Déversoir trop éloigné de la rive');
 if(distance(shore.point,spillway.downstream)<3)throw Error('Pente aval trop courte pour tracer le cours d’eau');
 if(!ctx.inWorld(shore.point.x,shore.point.z))throw Error('Sortie du lac hors carte');
 const plan=planGuidedRiver(shore.point,spillway.downstream,ctx,options);
 if(plan.trace.lengthM<40)throw Error('Sortie du lac trop courte : vérifier la pente et les berges');
 if(plan.water.to?.kind==='lake'&&plan.water.to.id===lake.id)
  throw Error('La sortie rejoint le lac source : choisir un autre déversoir');
 if(plan.water.points.length<2||polygonSignedDistance(lake.points,plan.water.points[1].x,plan.water.points[1].z)>-.5)
  throw Error('La rivière repart vers le lac, pas vers l’aval');
 const from:WaterLink={kind:'lake',id:lake.id},water={...plan.water,from};
 const compiled=compileWaterNetwork([...ctx.existing,water],ctx.height,ctx.seaLevel).at(-1)!;
 const errors=compiled.diagnostics.filter(x=>x.severity==='ERROR');
 if(errors.length)throw Error('Raccord de sortie refusé : '+errors.map(x=>x.message).join(' '));
 return {water,trace:plan.trace,warnings:[...plan.warnings,...compiled.diagnostics.filter(x=>x.severity==='WARNING').map(x=>x.message)]};
}
