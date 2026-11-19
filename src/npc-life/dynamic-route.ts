/** Bounded check of the next metres of a scripted NPC journey.
 * Uses the active collision/terrain callback, not stale A* graph edges.
 * No allocations proportional to world size and no per-frame route searches.
 */
import {positionOnResidentRoute,type ResidentRoute} from './schedule.ts';
import type {ResidentWalkable} from './routes.ts';

/** Walk each actual polyline edge; sampling across a corner would illegally
 * cut the corner and may miss a wall. Caps apply to the complete requested span.
 */
export function residentRouteAheadClear(
 route:ResidentRoute,distance:number,walk:ResidentWalkable,horizon=3,
):boolean{
 if(!Number.isFinite(distance)||!Number.isFinite(horizon)||horizon<=0||
    !Number.isFinite(route.length)||route.length<0||!route.points.length||
    route.distances.length!==route.points.length)return false;
 const start=Math.max(0,Math.min(route.length,distance));
 const end=Math.min(route.length,start+Math.min(12,horizon));
 if(end-start<1e-6)return true;
 // Every interpolated movement follows an authored graph edge, never a
 // straight chord between positions on opposite sides of a corner.
 let previous=positionOnResidentRoute(route,start);
 for(let i=1;i<route.distances.length;i++){
  const lo=Math.max(start,route.distances[i-1]),hi=Math.min(end,route.distances[i]);
  if(hi<=lo)continue;
  const atLo=positionOnResidentRoute(route,lo);
  if(Math.hypot(previous.x-atLo.x,previous.z-atLo.z)>1e-5)return false;
  for(let d=lo;d<hi-1e-6;){
   const next=Math.min(hi,d+.5),to=positionOnResidentRoute(route,next);
   if(!walk(to.x,to.z,previous.x,previous.z))return false;
   previous=to;d=next;
  }
 }
 return true;
}

/** Validate the entire interval about to be travelled, not just the endpoint.
 * Returns false rather than accepting an oversized jump after a suspended tab.
 * Scripted navigation can then replan from the last safe position.
 */
export function residentRouteStepClear(
 route:ResidentRoute,fromDistance:number,toDistance:number,walk:ResidentWalkable,maxAdvance=12,
):boolean{
 if(!Number.isFinite(fromDistance)||!Number.isFinite(toDistance)||
    !Number.isFinite(maxAdvance)||maxAdvance<=0||toDistance<fromDistance||
    toDistance-fromDistance>Math.min(12,maxAdvance)+1e-6||
    fromDistance<0||toDistance>route.length+1e-6)return false;
 if(toDistance-fromDistance<1e-6)return true;
 return residentRouteAheadClear(route,fromDistance,walk,toDistance-fromDistance);
}
