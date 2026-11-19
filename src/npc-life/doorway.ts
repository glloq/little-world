/** Minimal exterior-door contract for daily residents. Rooms and stairs stay out
 * of scope: a resident is concealed only when physically at a qualified home
 * entrance, and remains a regular source NPC for dialogue/quests/saves.
 */
import {residentDutyShift,type ResidentPose,type ResidentPoint,type ResidentRoutineV1} from './schedule.ts';

export interface ResidentDoorwayState {inside:boolean;requestOpen:boolean}
export function residentDoorwayState(
 routine:ResidentRoutineV1,pose:ResidentPose,actual:ResidentPoint,
 dayLengthSeconds:number,speed=1.1,
):ResidentDoorwayState{
 if(!routine.homeAnchorId||!Number.isFinite(actual.x)||!Number.isFinite(actual.z)||
  !Number.isFinite(dayLengthSeconds)||dayLengthSeconds<=0||!Number.isFinite(speed)||speed<=0)
  return {inside:false,requestOpen:false};
 const distance=Math.hypot(actual.x-routine.home.x,actual.z-routine.home.z);
 if(distance>2.5)return {inside:false,requestOpen:false};
 const [start,end]=residentDutyShift(routine);
 // The home-bound part of a shift is measured from the logical schedule.
 // The actual collider check guarantees there is no phantom doorway at distance.
 const atDoor=distance<=1.6;
 const windowHours=Math.min(.18,Math.max(.045,dayLengthSeconds>0?24*2/dayLengthSeconds:0));
 const nearWake=pose.hour>=start-windowHours&&pose.hour<=start+windowHours;
 const nearReturn=pose.hour>=end&&pose.hour<=end+windowHours;
 const entering=pose.phase==='to-home'||pose.phase==='home'&&nearReturn;
 const leaving=pose.phase==='to-work'||pose.phase==='home'&&nearWake;
 return {inside:atDoor&&pose.phase==='home'&&!nearWake&&!nearReturn,
   requestOpen:atDoor&&(entering||leaving)};
}
