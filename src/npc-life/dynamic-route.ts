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

/** Near-camera daily routines must never jump across a changed collision map.
 * Far-away citizens remain analytical and cost no continuous movement budget.
 */
export function residentRoutineStepClear(
 from:{x:number;z:number},to:{x:number;z:number},walk:ResidentWalkable,maxStep=2,
):boolean{
 if(!Number.isFinite(from.x)||!Number.isFinite(from.z)||
    !Number.isFinite(to.x)||!Number.isFinite(to.z)||
    !Number.isFinite(maxStep)||maxStep<=0)return false;
 const distance=Math.hypot(to.x-from.x,to.z-from.z);
 if(distance>Math.min(maxStep,3)+1e-6)return false;
 if(distance<1e-5)return true;
 const steps=Math.max(1,Math.ceil(distance/.4));
 let previous=from;
 for(let i=1;i<=steps;i++){
  const t=i/steps,next={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t};
  if(!walk(next.x,next.z,previous.x,previous.z))return false;
  previous=next;
 }
 return true;
}

/** A recovery itinerary targets the current *world-clock* agenda, not the
 * snapshot from its creation. Re-target only on a bounded cadence and only
 * when the destination has actually moved, avoiding perpetual A* churn.
 */
export function residentRecoveryNeedsRetarget(
 oldGoal:{x:number;z:number},newGoal:{x:number;z:number},
 now:number,lastCheck:number,threshold=2,period=2,
):boolean{
 if(![oldGoal.x,oldGoal.z,newGoal.x,newGoal.z,now,lastCheck,threshold,period].every(Number.isFinite)||
   threshold<=0||period<=0)return false;
 return (now<lastCheck||now-lastCheck>=period)&&
   Math.hypot(newGoal.x-oldGoal.x,newGoal.z-oldGoal.z)>threshold;
}
