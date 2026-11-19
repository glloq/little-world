/** Small, deterministic resident schedules. Uses the existing simulated world clock, not wall time. */
export const RESIDENT_ROLES = ['farmer','fisher','merchant','woodcutter','miner','miller','artisan','innkeeper','child','villager','dockworker','sailor','courier','guard','musician','gatherer','blacksmith','traveler','instructor'] as const;
export type ResidentRole = typeof RESIDENT_ROLES[number];
export interface ResidentPoint {x:number;z:number;y?:number}
export type ResidentActivityKind='meal'|'social'|'rest'|'play'|'errand';
export interface ResidentActivityStop {kind:ResidentActivityKind;anchorId:string;point:ResidentPoint;startHour:number;endHour:number;}
export interface ResidentRoutineV1 {
  type:'Resident';version:1;role:ResidentRole;
  home:ResidentPoint;work:ResidentPoint;
  homeAnchorId?:string;workAnchorId?:string;
  /** Optional author hours in the in-game 24h cycle. Missing = role preset. */
  workStartHour?:number;workEndHour?:number;
  /** Real route-qualified midday/afternoon visits, not a second simulation. */
  activities?:ResidentActivityStop[];
}
export type ResidentPhase='home'|'to-work'|'work'|'to-home'|'to-activity'|'activity';
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
  if(Object.keys(v).some(k=>!['type','version','role','home','work','homeAnchorId','workAnchorId','workStartHour','workEndHour','activities'].includes(k)))return false;
  if((v.workStartHour===undefined)!==(v.workEndHour===undefined))return false;
  if(v.workStartHour!==undefined&&(!finite(v.workStartHour)||!finite(v.workEndHour)||v.workStartHour<0||v.workEndHour>24||v.workEndHour-v.workStartHour<2))return false;
  if(v.activities!==undefined){
    if(!Array.isArray(v.activities)||v.activities.length>3)return false;
    const role=String(v.role) as ResidentRole,shift=(RESIDENT_ROLES as readonly string[]).includes(role)?SHIFT[role]:[0,0];
    const begin=finite(v.workStartHour)?v.workStartHour:shift[0],end=finite(v.workEndHour)?v.workEndHour:shift[1];
    let previous=begin;
    for(const raw of v.activities){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
      const a=raw as Record<string,unknown>;
      if(Object.keys(a).some(k=>!['kind','anchorId','point','startHour','endHour'].includes(k))||
        !['meal','social','rest','play','errand'].includes(String(a.kind))||
        !identifier(a.anchorId)||!point(a.point)||
        Math.abs(a.point.x)>100000||Math.abs(a.point.z)>100000||
        !finite(a.startHour)||!finite(a.endHour)||
        a.startHour<previous+.25||a.endHour>end-.25||a.endHour-a.startHour<.25)return false;
      previous=a.endHour;
    }
  }
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
  child:[9,18],villager:[9,17],dockworker:[7,18],sailor:[6,17],courier:[8,17],guard:[8,19],musician:[11,20],gatherer:[7,16],blacksmith:[7,17],traveler:[10,18],instructor:[9,17],
};
export function residentShift(role:ResidentRole):readonly [number,number]{return SHIFT[role];}
export function residentDutyShift(routine:ResidentRoutineV1):readonly [number,number]{return routine.workStartHour===undefined?residentShift(routine.role):[routine.workStartHour,routine.workEndHour!];}
export function residentRoute(points:readonly ResidentPoint[]):ResidentRoute{
  if(!Array.isArray(points)||points.length<1||points.length>4096||points.some(p=>!point(p)||(p.y!==undefined&&!finite(p.y))))throw Error('Parcours résident invalide');
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
    const from=a[i-1],to=a[i],y0=from.y,y1=to.y;
    return {x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,
      ...(y0!==undefined&&y1!==undefined?{y:y0+(y1-y0)*t}:{})};
  }
  return {...a[a.length-1]};
}
export interface ResidentPose {phase:ResidentPhase;position:ResidentPoint;hour:number;heading:number;nextAtHour:number;}
/** Constant-time daily planning (linear in a short route for interpolation).
 * No missed ticks to catch up after 5 days of absence, no per-frame random draws.
 */
export function residentPoseAt(routine:ResidentRoutineV1,route:ResidentRoute,time:number,dayLengthSeconds:number,initialDayPhase:number,speed=1.1):ResidentPose{
  if(!validResidentRoutine(routine)||!finite(speed)||speed<=0||speed>5)throw Error('Routine résident invalide');
  const hour=residentHour(time,dayLengthSeconds,initialDayPhase),[depart,returnAt]=residentDutyShift(routine);
  const travelHours=route.length/speed/dayLengthSeconds*24;
  if(!finite(travelHours)||travelHours>Math.max(.01,(returnAt-depart)/2))throw Error('Trajet professionnel trop long pour le service');
  let phase:ResidentPhase,travelDistance=0,nextAtHour:number,reverseDirection=false;
  if(hour<depart){phase='home';nextAtHour=depart;}
  else if(hour<depart+travelHours){phase='to-work';travelDistance=(hour-depart)/travelHours*route.length;nextAtHour=depart+travelHours;}
  else if(hour<returnAt){
    phase='work';travelDistance=route.length;nextAtHour=returnAt;
    // Children's daytime games reuse the last eight metres of their *validated*
    // house-to-square footpath. No random wandering into ponds or buildings.
    if(routine.role==='child'&&route.length>=4){
      const span=Math.min(8,route.length),elapsed=(hour-depart-travelHours)*dayLengthSeconds/24;
      const cycle=(elapsed*Math.min(1.6,speed*1.4))%(2*span);
      const offset=cycle<=span?cycle:2*span-cycle;
      travelDistance=route.length-offset;reverseDirection=cycle<span;
    }
  }
  else if(hour<returnAt+travelHours){phase='to-home';travelDistance=route.length-(hour-returnAt)/travelHours*route.length;nextAtHour=returnAt+travelHours;reverseDirection=true;}
  else {phase='home';nextAtHour=24+depart;}
  const position=positionOnResidentRoute(route,travelDistance);
  const ahead=positionOnResidentRoute(route,Math.min(route.length,travelDistance+.05));
  const behind=positionOnResidentRoute(route,Math.max(0,travelDistance-.05));
  const dirX=reverseDirection?behind.x-ahead.x:ahead.x-behind.x;
  const dirZ=reverseDirection?behind.z-ahead.z:ahead.z-behind.z;
  const heading=Math.hypot(dirX,dirZ)>.0001?Math.atan2(dirX,dirZ):0;
  return {phase,position,hour,heading,nextAtHour};
}
