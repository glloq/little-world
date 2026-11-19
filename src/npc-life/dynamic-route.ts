/** Bounded check of the next metres of a scripted NPC journey.
 * Uses the active collision/terrain callback, not stale A* graph edges.
 * No allocations proportional to world size and no per-frame route searches.
 */
import {positionOnResidentRoute,type ResidentRoute} from './schedule.ts';
import type {ResidentWalkable} from './routes.ts';

export function residentRouteAheadClear(
 route:ResidentRoute,distance:number,walk:ResidentWalkable,horizon=3,
):boolean{
 if(!Number.isFinite(distance)||!Number.isFinite(horizon)||horizon<=0)return false;
 if(!route.points.length||!Number.isFinite(route.length))return false;
 const start=Math.max(0,Math.min(route.length,distance));
 const end=Math.min(route.length,start+Math.min(12,horizon));
 if(end-start<.001)return true;
 let from=positionOnResidentRoute(route,start);
 // Segment checks <=0.5 m and preserve route corners: no shortcuts across walls.
 for(let d=start;d<end-.00001;){
  const next=Math.min(end,d+.5),to=positionOnResidentRoute(route,next);
  if(!walk(to.x,to.z,from.x,from.z))return false;
  from=to;d=next;
 }
 return true;
}
