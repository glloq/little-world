/** Bounded check of the next metres of a scripted NPC journey.
 * Uses the active collision/terrain callback, not stale A* graph edges.
 * No allocations proportional to world size and no per-frame route searches.
 */
import {positionOnResidentRoute,type ResidentRoute} from './schedule.ts';
import type {ResidentWalkable} from './routes.ts';

/** Walk each actual polyline edge; sampling across a corner would illegally
 * cut the corner and may miss a wall. Caps apply to the complete requested span.
 */
export interface ResidentRouteClearance {
 /** Whether the requested bounded lookahead is free of current collisions. */
 clear:boolean;
 /** Furthest distance certified safe on the ORIGINAL polyline, never a corner chord. */
 safeDistance:number;
}

/** Check every real path edge and return the last physically safe progress.
 * This is deliberately read-only: the caller owns replan cadence and movement.
 * A blocked step is never accepted in full merely because its endpoint is safe.
 */
export function residentRouteClearance(
 route:ResidentRoute,distance:number,walk:ResidentWalkable,horizon=3,
):ResidentRouteClearance{
 const invalid={clear:false,safeDistance:0};
 if(!Number.isFinite(distance)||distance<0||!Number.isFinite(horizon)||horizon<=0||
    !Number.isFinite(route.length)||route.length<0||!route.points.length||
    route.distances.length!==route.points.length||distance>route.length+1e-6)return invalid;
 // Defensive validation also covers routes constructed outside residentRoute().
 if(route.distances[0]!==0||Math.abs(route.distances[route.distances.length-1]-route.length)>1e-5)return invalid;
 for(let i=0;i<route.points.length;i++){
  const p=route.points[i],d=route.distances[i];
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||!Number.isFinite(d)||
     (i>0&&d<route.distances[i-1]))return invalid;
 }
 const start=Math.min(route.length,distance),end=Math.min(route.length,start+Math.min(12,horizon));
 if(end-start<1e-6)return {clear:true,safeDistance:start};
 let previous=positionOnResidentRoute(route,start),safeDistance=start;
 // Walk each original edge separately: a chord around a sharp corner is unsafe.
 for(let i=1;i<route.distances.length;i++){
  const lo=Math.max(start,route.distances[i-1]),hi=Math.min(end,route.distances[i]);
  if(hi<=lo)continue;
  const atLo=positionOnResidentRoute(route,lo);
  if(Math.hypot(previous.x-atLo.x,previous.z-atLo.z)>1e-5)
   return {clear:false,safeDistance};
  for(let d=lo;d<hi-1e-6;){
   const next=Math.min(hi,d+.5),to=positionOnResidentRoute(route,next);
   if(!walk(to.x,to.z,previous.x,previous.z))
    return {clear:false,safeDistance};
   previous=to;safeDistance=next;d=next;
  }
 }
 return {clear:true,safeDistance:end};
}

/** Compatibility predicate for current scripted and routine callers. */
export function residentRouteAheadClear(
 route:ResidentRoute,distance:number,walk:ResidentWalkable,horizon=3,
):boolean{
 return residentRouteClearance(route,distance,walk,horizon).clear;
}

/** Decide how far a scripted actor may safely advance this update.
 * Reject browser-suspension leaps, but preserve partial progress to the final
 * certified point before an obstacle so a caller can replan from reality.
 */
export function residentScriptedAdvance(
 route:ResidentRoute,previousDistance:number,targetDistance:number,walk:ResidentWalkable,
):ResidentRouteClearance{
 if(!Number.isFinite(previousDistance)||!Number.isFinite(targetDistance)||
    previousDistance<0||targetDistance<previousDistance||
    targetDistance-previousDistance>12+1e-6)
  return {clear:false,safeDistance:Number.isFinite(previousDistance)?Math.max(0,Math.min(route.length,previousDistance)):0};
 if(targetDistance-previousDistance<1e-6)
  return {clear:true,safeDistance:previousDistance};
 return residentRouteClearance(route,previousDistance,walk,targetDistance-previousDistance);
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

/** Recover a moving schedule without chasing it forever at exactly its speed.
 * Keeps the catch-up bonus small and clamps bad authored speeds.
 */
export function residentRecoverySpeed(speed:number):number{
 if(!Number.isFinite(speed)||speed<=0)return 0.27;
 return Math.min(3,Math.max(.27,speed*1.35));
}

/** Replan only after a topology/collision revision or the bounded retry cadence.
 * World revisions are supplied by the host when roads, doors or terrain change;
 * collision sampling still protects movement even without a revision signal.
 */
export function residentReplanDue(
 now:number,lastAttempt:number,revision:number,plannedRevision:number,period=1,
):boolean{
 if(![now,revision,plannedRevision,period].every(Number.isFinite)||
    !(Number.isFinite(lastAttempt)||lastAttempt===-Infinity)||period<=0)return false;
 return lastAttempt===-Infinity||now<lastAttempt||now-lastAttempt>=period||revision!==plannedRevision;
}
