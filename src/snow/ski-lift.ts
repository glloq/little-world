/** Deterministic, route-based chairlift. No rigid-body seat physics or network scheduler. */
export interface LiftPoint {x:number;y:number;z:number}
export interface SkiLift {
  id:string; path:readonly LiftPoint[]; speed:number; seatSpacing:number; capacity:number;
}
export interface LiftRide {
  seatIndex:number; boardAt:number; phase:'waiting'|'riding'|'finished';
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const point=(a:LiftPoint,b:LiftPoint,t:number):LiftPoint=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)});
export function liftLength(lift:SkiLift):number{
  let d=0;for(let i=1;i<lift.path.length;i++){const a=lift.path[i-1],b=lift.path[i];d+=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);}return d;
}
export function validateLift(lift:SkiLift):void{
  if(!lift||!lift.id||lift.path.length<2||lift.path.length>300||!Number.isFinite(lift.speed)||lift.speed<.5||lift.speed>12||
    !Number.isFinite(lift.seatSpacing)||lift.seatSpacing<4||lift.seatSpacing>80||
    !Number.isInteger(lift.capacity)||lift.capacity<1||lift.capacity>8||
    lift.path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z))||
    liftLength(lift)<20||liftLength(lift)>6000)throw Error('Remontée mécanique invalide');
}
function sampleAscending(lift:SkiLift,along:number):LiftPoint{
  let remaining=clamp(along,0,liftLength(lift));
  for(let i=1;i<lift.path.length;i++){
    const a=lift.path[i-1],b=lift.path[i],d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    if(remaining<=d)return point(a,b,d>0?remaining/d:0);
    remaining-=d;
  }
  return {...lift.path[lift.path.length-1]};
}
/** 2-way cable, seats distributed around a closed loop. Return trip uses a separate lateral offset. */
export function seatPosition(lift:SkiLift,time:number,seatIndex:number):LiftPoint{
  const length=liftLength(lift),circuit=length*2,phase=((time*lift.speed+seatIndex*lift.seatSpacing)%circuit+circuit)%circuit;
  const ascending=phase<=length,p=sampleAscending(lift,ascending?phase:circuit-phase);
  // Small offset separates ascending and return chairs. Seat is below cable.
  const tangent=lift.path[lift.path.length-1],start=lift.path[0];
  const dx=tangent.x-start.x,dz=tangent.z-start.z,l=Math.hypot(dx,dz)||1;
  return {x:p.x+(ascending?-.7:.7)*(-dz/l),y:p.y-1.1,z:p.z+(ascending?-.7:.7)*dx/l};
}
export function seatCount(lift:SkiLift):number{return Math.max(2,Math.ceil(liftLength(lift)*2/lift.seatSpacing));}
export function boardLift(lift:SkiLift,position:LiftPoint,time:number,maxRange=4):LiftRide|null{
  validateLift(lift);const base=lift.path[0];
  if(Math.hypot(position.x-base.x,position.z-base.z)>maxRange||Math.abs(position.y-base.y)>4)return null;
  const count=seatCount(lift),loop=2*liftLength(lift);
  let seatIndex=0,wait=Infinity;
  for(let i=0;i<count;i++){const offset=((time*lift.speed+i*lift.seatSpacing)%loop+loop)%loop;
    const seconds=(loop-offset)%loop/lift.speed;if(seconds<wait){wait=seconds;seatIndex=i;}}
  return {seatIndex,boardAt:time+wait,phase:'waiting'};
}
export function liftRideStep(lift:SkiLift,ride:LiftRide,time:number):{pose:LiftPoint|null;finished:boolean}{
  if(ride.phase==='finished')return {pose:null,finished:true};
  if(time<ride.boardAt){ride.phase='waiting';return {pose:null,finished:false};}
  const length=liftLength(lift),elapsed=time-ride.boardAt;
  if(elapsed*lift.speed>=length){
    ride.phase='finished';const p=lift.path[lift.path.length-1];
    return {pose:{x:p.x,y:p.y,z:p.z},finished:true};
  }
  ride.phase='riding';
  const p=sampleAscending(lift,elapsed*lift.speed);
  return {pose:{x:p.x,y:p.y-1.1,z:p.z},finished:false};
}
