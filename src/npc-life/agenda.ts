/** Multistop resident agenda sampled analytically from the world clock.
 * All route legs are verified at initialization, never searched during frames.
 */
import {residentDutyShift,residentHour,positionOnResidentRoute,type ResidentRoutineV1,type ResidentRoute,type ResidentPose,type ResidentActivityKind} from './schedule.ts';
export interface ResidentActivityLegs {to:ResidentRoute;back:ResidentRoute}
export interface ResidentDailyRoutes {work:ResidentRoute;activities:ResidentActivityLegs[]}
export type ResidentAgendaPose=ResidentPose&{activityKind?:ResidentActivityKind};
function sample(route:ResidentRoute,d:number,reverse=false){
 const position=positionOnResidentRoute(route,d),next=positionOnResidentRoute(route,Math.min(route.length,d+.05)),
 prev=positionOnResidentRoute(route,Math.max(0,d-.05));
 const dx=reverse?prev.x-next.x:next.x-prev.x,dz=reverse?prev.z-next.z:next.z-prev.z;
 return {position,heading:Math.hypot(dx,dz)>.0001?Math.atan2(dx,dz):0};
}
/** Shared authoring/runtime preflight: no impossible visit may reach the frame loop.
 * All routes are already compiled; this is O(number of stops), not pathfinding.
 */
export function validateResidentAgendaRoutes(
 routine:ResidentRoutineV1,routes:ResidentDailyRoutes,dayLengthSeconds:number,speed=1.1,
):string|null{
 const stops=routine.activities??[],[start,end]=residentDutyShift(routine);
 if(stops.length!==routes.activities.length||!Number.isFinite(speed)||speed<=0||
    !Number.isFinite(dayLengthSeconds)||dayLengthSeconds<=0)return 'Agenda résident incomplet';
 const hours=(r:ResidentRoute)=>r.length/speed/dayLengthSeconds*24;
 const commute=hours(routes.work);
 if(!Number.isFinite(commute)||commute>(end-start)/2)return 'Trajet professionnel trop long';
 let available=start+commute;
 for(let i=0;i<stops.length;i++){
  const stop=stops[i],legs=routes.activities[i];
  const depart=stop.startHour-hours(legs.to),returnAt=stop.endHour+hours(legs.back);
  if(!Number.isFinite(depart)||!Number.isFinite(returnAt)||
     depart<available-.001||returnAt>end-.001)return 'Pause inaccessible dans les horaires';
  available=returnAt;
 }
 return null;
}
export function residentAgendaPoseAt(routine:ResidentRoutineV1,routes:ResidentDailyRoutes,time:number,dayLengthSeconds:number,initialDayPhase:number,speed=1.1):ResidentAgendaPose{
 const stops=routine.activities??[],[start,end]=residentDutyShift(routine);
 const invalid=validateResidentAgendaRoutes(routine,routes,dayLengthSeconds,speed);
 if(invalid)throw Error(invalid);
 const hour=residentHour(time,dayLengthSeconds,initialDayPhase),hours=(r:ResidentRoute)=>r.length/speed/dayLengthSeconds*24,travel=hours(routes.work);
 const pose=(phase:ResidentPose['phase'],route:ResidentRoute,d:number,nextAtHour:number,kind?:ResidentActivityKind):ResidentAgendaPose=>({phase,...sample(route,d),hour,nextAtHour,...(kind?{activityKind:kind}:{})});
 if(hour<start)return pose('home',routes.work,0,start);
 if(hour<start+travel)return pose('to-work',routes.work,(hour-start)/Math.max(.000001,travel)*routes.work.length,start+travel);
 let available=start+travel;
 for(let i=0;i<stops.length;i++){
  const stop=stops[i],leg=routes.activities[i],toHours=hours(leg.to),backHours=hours(leg.back);
  const depart=stop.startHour-toHours,returnAt=stop.endHour+backHours;
  if(depart<available-.001||returnAt>end-.001)throw Error('Pause inaccessible dans les horaires');
  if(hour<depart)return pose('work',routes.work,routes.work.length,depart);
  if(hour<stop.startHour)return pose('to-activity',leg.to,(hour-depart)/Math.max(.000001,toHours)*leg.to.length,stop.startHour,stop.kind);
  if(hour<stop.endHour)return pose('activity',leg.to,leg.to.length,stop.endHour,stop.kind);
  if(hour<returnAt)return pose('to-activity',leg.back,(hour-stop.endHour)/Math.max(.000001,backHours)*leg.back.length,returnAt,stop.kind);
  available=returnAt;
 }
 if(hour<end)return pose('work',routes.work,routes.work.length,end);
 if(hour<end+travel){
  const d=routes.work.length-(hour-end)/Math.max(.000001,travel)*routes.work.length;
  const p=pose('to-home',routes.work,d,end+travel);p.heading=sample(routes.work,d,true).heading;return p;
 }
 return pose('home',routes.work,0,24+start);
}
