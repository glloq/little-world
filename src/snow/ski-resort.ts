/** Runtime lifts of an authored ski domain: one deterministic SkiLift per authored lift line,
 * with a terrain-following cable. No physics, colliders or network state. */
import {liftCablePath,LIFT_LABELS,type LiftKind} from './resort-planner.ts';
import {boardLift,liftRideStep,validateLift,type LiftPoint,type LiftRide,type SkiLift} from './ski-lift.ts';
import type {SkiAreaV1} from './ski-area.ts';

export interface ResortLift {id:string;name:string;kind:LiftKind;areaId:string;lift:SkiLift}
const SETTINGS:Record<LiftKind,{speed:number;seatSpacing:number;capacity:number}>={
  gondola:{speed:5.5,seatSpacing:30,capacity:6},
  chairlift:{speed:4.2,seatSpacing:15,capacity:2},
  draglift:{speed:3.2,seatSpacing:12,capacity:1},
};
/** Lifts of every run with `lift` (explicit line, or the historical lift along the run). */
export function resortLifts(areas:readonly SkiAreaV1[],height:(x:number,z:number)=>number):ResortLift[]{
  const out:ResortLift[]=[];
  for(const area of areas){
    if(!area.lift)continue;
    const kind=area.liftKind??'chairlift',settings=SETTINGS[area.liftPath?kind:'chairlift'];
    const path:LiftPoint[]=area.liftPath?liftCablePath(kind,area.liftPath,height):
      // Historical prototype: chairs follow the run upward, 3.5 m above the snow.
      area.points.slice().reverse().filter((_,i)=>i%4===0||i===area.points.length-1).map(p=>({x:p.x,y:height(p.x,p.z)+3.5,z:p.z}));
    const lift:SkiLift={id:'lift:'+area.id,path,...settings};
    try{validateLift(lift);}catch{continue;}
    out.push({id:lift.id,name:area.liftName??LIFT_LABELS[kind]+' · '+area.name,kind:area.liftPath?kind:'chairlift',areaId:area.id,lift});
  }
  return out;
}
/** Ground point where riders queue (base) or are dropped (top). */
export function liftStation(lift:SkiLift,end:'base'|'top'){const p=end==='base'?lift.path[0]:lift.path[lift.path.length-1];return {x:p.x,z:p.z};}
export function nearestLiftBase(lifts:readonly ResortLift[],x:number,z:number,range=4.5):ResortLift|null{
  let best:ResortLift|null=null,distance=range;
  for(const l of lifts){const b=l.lift.path[0],d=Math.hypot(x-b.x,z-b.z);if(d<=distance){best=l;distance=d;}}
  return best;
}
export interface ActiveRide {lift:ResortLift;ride:LiftRide}
/** Reserve the next seat of the lift whose boarding area the rider stands on. */
export function boardResortLift(lifts:readonly ResortLift[],position:LiftPoint,groundY:number,time:number):ActiveRide|null{
  const near=nearestLiftBase(lifts,position.x,position.z);if(!near)return null;
  // Cable stations sit above the snow: compare with the boarding height, not the ground.
  const base=near.lift.path[0],ride=boardLift(near.lift,{x:position.x,y:base.y+(position.y-groundY),z:position.z},time,4.5);
  return ride?{lift:near,ride}:null;
}
export type RideStep={kind:'waiting'}|{kind:'riding';pose:LiftPoint}|{kind:'arrived';top:{x:number;z:number}};
/** One fixed step of a ride: the rider always follows the very seat drawn by the view. */
export function stepResortRide(active:ActiveRide,time:number):RideStep{
  const step=liftRideStep(active.lift.lift,active.ride,time);
  if(step.finished)return {kind:'arrived',top:liftStation(active.lift.lift,'top')};
  if(step.pose)return {kind:'riding',pose:step.pose};
  return {kind:'waiting'};
}
