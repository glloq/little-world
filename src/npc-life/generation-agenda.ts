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
 // Scale visits to the actual shift: early fishers and late musicians
 // should not inherit a universal 12:00/15:30 timetable. Keep deterministic
 // quarter-hour slots and let route validation reject impossible excursions.
 const shiftHours=end-start;
 const quarter=(h:number)=>Math.round(h*4)/4;
 const windows=[
   {kind:'meal' as const,startHour:quarter(start+shiftHours*.45),duration:.5},
   {kind:'social' as const,startHour:quarter(start+shiftHours*.76),duration:.4},
 ];
 for(const window of windows){
  const endHour=window.startHour+window.duration;
  for(const stop of candidates){
    // No visual pause at an imaginary location or across a blocked route.
    const to=planner.routeBetween(routine.work,stop.point);
    if(!to)continue;
    const back=planner.routeBetween(stop.point,routine.work);
    if(!back)continue;
    const goHours=to.length/speed/dayLengthSeconds*24,backHours=back.length/speed/dayLengthSeconds*24;
    if(window.startHour-goHours<previous+.25||endHour+backHours>end-.25)continue;
    visits.push({kind:window.kind,anchorId:stop.id,point:{...stop.point},
      startHour:window.startHour,endHour});
    previous=endHour+backHours;
    break;
  }
 }
 return visits.length?{...routine,activities:visits}:routine;
}
