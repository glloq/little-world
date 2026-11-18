/** Small, deterministic resident schedules. Uses the existing simulated world clock, not wall time. */
export const RESIDENT_ROLES = ['farmer','fisher','merchant','woodcutter','miner','miller','artisan','innkeeper','child','villager'] as const;
export type ResidentRole = typeof RESIDENT_ROLES[number];
export interface ResidentPoint {x:number;z:number}
export interface ResidentRoutineV1 {
  type:'Resident';version:1;role:ResidentRole;
  home:ResidentPoint;work:ResidentPoint;
  homeAnchorId?:string;workAnchorId?:string;
}
export type ResidentPhase='home'|'to-work'|'work'|'to-home';
export interface ResidentRoute {
  /** Coordinates in author world metres, starting at the home entrance. */
  points:ResidentPoint[];
  /** Cumulative metres of traversable path. */
  distances:number[];
  length:number;
}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const point=(v:unknown):v is ResidentPoint=>!!v&&typeof v==='object'&&!Array.isArray(v)&&finite((v as ResidentPoint).x)&&finite((v as ResidentPoint).z);
const identifier=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
export function validResidentRoutine(value:unknown):value is ResidentRoutineV1{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['type','version','role','home','work','homeAnchorId','workAnchorId'].includes(k)))return false;
  return v.type==='Resident'&&v.version===1&&(RESIDENT_ROLES as readonly string[]).includes(String(v.role))&&
    point(v.home)&&point(v.work)&&Math.abs(v.home.x)<=100000&&Math.abs(v.home.z)<=100000&&
    Math.abs(v.work.x)<=100000&&Math.abs(v.work.z)<=100000&&
    (v.homeAnchorId===undefined||identifier(v.homeAnchorId))&&
    (v.workAnchorId===undefined||identifier(v.workAnchorId));
}
/** Local clock in game hours; the climate provides the same initial day phase as sky/lighting. */
export function residentHour(worldSeconds:number,dayLengthSeconds:number,initialDayPhase:number):number{
  if(!finite(worldSeconds)||worldSeconds<0||!finite(dayLengthSeconds)||dayLengthSeconds<=0||!finite(initialDayPhase))throw Error('Horloge résident invalide');
  return (((worldSeconds/dayLengthSeconds+initialDayPhase)%1)+1)%1*24;
}
const SHIFT:Record<ResidentRole,readonly [number,number]>={
  farmer:[6,17],fisher:[5,15],merchant:[8,18],woodcutter:[7,17],
  miner:[7,16],miller:[7,17],artisan:[8,17],innkeeper:[9,21],
  child:[9,18],villager:[9,17],
};
export function residentShift(role:ResidentRole):readonly [number,number]{return SHIFT[role];}
export function residentRoute(points:readonly ResidentPoint[]):ResidentRoute{
  if(!Array.isArray(points)||points.length<1||points.length>4096||points.some(p=>!point(p)))throw Error('Parcours résident invalide');
  const distances=[0];let length=0;
  for(let i=1;i<points.length;i++){length+=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);distances.push(length);}
  return {points:points.map(p=>({...p})),distances,length};
}
export function positionOnResidentRoute(route:ResidentRoute,distance:number):ResidentPoint{
  const d=Math.max(0,Math.min(route.length,distance));const a=route.points;
  if(!a.length)throw Error('Parcours résident vide');
  if(d<=0||a.length===1)return {...a[0]};
  for(let i=1;i<a.length;i++){
    if(d>route.distances[i]&&i<a.length-1)continue;
    const span=route.distances[i]-route.distances[i-1],t=span>0?(d-route.distances[i-1])/span:1;
    return {x:a[i-1].x+(a[i].x-a[i-1].x)*t,z:a[i-1].z+(a[i].z-a[i-1].z)*t};
  }
  return {...a[a.length-1]};
}
export interface ResidentPose {phase:ResidentPhase;position:ResidentPoint;hour:number;heading:number;nextAtHour:number;}
/** Constant-time daily planning (linear in a short route for interpolation).
 * No missed ticks to catch up after 5 days of absence, no per-frame random draws.
 */
export function residentPoseAt(routine:ResidentRoutineV1,route:ResidentRoute,time:number,dayLengthSeconds:number,initialDayPhase:number,speed=1.1):ResidentPose{
  if(!validResidentRoutine(routine)||!finite(speed)||speed<=0||speed>5)throw Error('Routine résident invalide');
  const hour=residentHour(time,dayLengthSeconds,initialDayPhase),[depart,returnAt]=residentShift(routine.role);
  const travelHours=route.length/speed/dayLengthSeconds*24;
  if(!finite(travelHours)||travelHours>Math.max(.01,(returnAt-depart)/2))throw Error('Trajet professionnel trop long pour le service');
  let phase:ResidentPhase,travelDistance=0,nextAtHour:number;
  if(hour<depart){phase='home';nextAtHour=depart;}
  else if(hour<depart+travelHours){phase='to-work';travelDistance=(hour-depart)/travelHours*route.length;nextAtHour=depart+travelHours;}
  else if(hour<returnAt){phase='work';travelDistance=route.length;nextAtHour=returnAt;}
  else if(hour<returnAt+travelHours){phase='to-home';travelDistance=route.length-(hour-returnAt)/travelHours*route.length;nextAtHour=returnAt+travelHours;}
  else {phase='home';nextAtHour=24+depart;}
  const position=positionOnResidentRoute(route,travelDistance);
  const ahead=positionOnResidentRoute(route,Math.min(route.length,travelDistance+.05));
  const behind=positionOnResidentRoute(route,Math.max(0,travelDistance-.05));
  const dirX=phase==='to-home'?behind.x-ahead.x:ahead.x-behind.x;
  const dirZ=phase==='to-home'?behind.z-ahead.z:ahead.z-behind.z;
  const heading=Math.hypot(dirX,dirZ)>.0001?Math.atan2(dirX,dirZ):0;
  return {phase,position,hour,heading,nextAtHour};
}
