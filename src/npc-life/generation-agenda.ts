/** Compile optional social and meal visits only from real, reachable civic anchors.
 * All visits are deterministic and persist as V1 Resident source metadata.
 */
import {residentDutyShift,type ResidentRoutineV1,type ResidentActivityStop,type ResidentRoute} from './schedule.ts';
import type {LifeJob} from './capabilities.ts';
import type {ResidentAssignmentPlanner} from './assignments.ts';

export function withVillageActivities(
 routine:ResidentRoutineV1,publicPlaces:readonly LifeJob[],
 planner:Pick<ResidentAssignmentPlanner,'routeBetween'>,commute:ResidentRoute,
 dayLengthSeconds=1200,speed=1.1,
):ResidentRoutineV1{
 if(routine.role==='child'||routine.role==='traveler'||routine.role==='sailor'||!publicPlaces.length)return routine;
 const [start,end]=residentDutyShift(routine),travelHours=commute.length/speed/dayLengthSeconds*24;
 const candidates=[...publicPlaces].sort((a,b)=>a.id.localeCompare(b.id));
 const visits:ResidentActivityStop[]=[];
 let previous=start+travelHours;
 for(const window of [{kind:'meal' as const,startHour:12,endHour:12.8},
                      {kind:'social' as const,startHour:15.3,endHour:15.9}]){
  for(const stop of candidates){
    // No visual pause at an imaginary location or across a blocked route.
    const to=planner.routeBetween(routine.work,stop.point);
    if(!to)continue;
    const back=planner.routeBetween(stop.point,routine.work);
    if(!back)continue;
    const goHours=to.length/speed/dayLengthSeconds*24,backHours=back.length/speed/dayLengthSeconds*24;
    if(window.startHour-goHours<previous+.25||window.endHour+backHours>end-.25)continue;
    visits.push({kind:window.kind,anchorId:stop.id,point:{...stop.point},
      startHour:window.startHour,endHour:window.endHour});
    previous=window.endHour+backHours;
    break;
  }
 }
 return visits.length?{...routine,activities:visits}:routine;
}
