/** Three optional solo time trials, author-independent. No network or render imports. */
export const FLIGHT_COURSES=['rings','dive','economy'] as const;
export type FlightCourseId=typeof FLIGHT_COURSES[number];
export interface FlightPoint{x:number;y:number;z:number}
export interface FlightCourseSession {
 id:FlightCourseId;elapsed:number;distance:number;usedPulses:number;lastPulseSeq:number;
 nextRing:number;rings:FlightPoint[];lowY:number;diveArmed:boolean;
 status:'running'|'success'|'failed';
}
const dist=(a:FlightPoint,b:FlightPoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Ring courses are generated within a 350 m corridor ahead of the current flight heading. */
export function beginFlightCourse(id:FlightCourseId,position:FlightPoint,heading:number,
 height:(x:number,z:number)=>number,bounds?:{minX:number;maxX:number;minZ:number;maxZ:number},
 initialPulseSeq=0):FlightCourseSession|null {
 if(!FLIGHT_COURSES.includes(id)||!Number.isFinite(heading))return null;
 const rings:FlightPoint[]=[];
 if(id==='rings'){
  const dx=Math.sin(heading),dz=Math.cos(heading),sx=dz,sz=-dx;
  for(let i=0;i<5;i++){
   const forward=70+i*70,side=(i%2===0?1:-1)*15;
   const x=position.x+dx*forward+sx*side,z=position.z+dz*forward+sz*side;
   if(bounds&&(x<bounds.minX+10||x>bounds.maxX-10||z<bounds.minZ+10||z>bounds.maxZ-10))return null;
   rings.push({x,y:Math.max(height(x,z)+18,position.y+(i%3-1)*7),z});
  }
 }
 return {id,elapsed:0,distance:0,usedPulses:0,lastPulseSeq:initialPulseSeq,
   nextRing:0,rings,lowY:position.y,diveArmed:false,status:'running'};
}
/** 0 = unchanged, 1 = ring reached, 2 = success, -1 = failed. */
export function stepFlightCourse(s:FlightCourseSession,step:{
 position:FlightPoint;previous:FlightPoint;velocity:FlightPoint;mode:string;pulseSeq:number;dt:number
}):number{
 if(s.status!=='running')return 0;
 if(step.mode!=='glide'||!Number.isFinite(step.dt)||step.dt<=0){s.status='failed';return -1;}
 s.elapsed+=step.dt;
 if(s.elapsed>60){s.status='failed';return -1;}
 s.distance+=Math.min(8,dist(step.position,step.previous));
 if(step.pulseSeq>s.lastPulseSeq)s.usedPulses+=step.pulseSeq-s.lastPulseSeq;
 s.lastPulseSeq=step.pulseSeq;
 if(s.id==='rings'){
  const ring=s.rings[s.nextRing];
  if(ring&&dist(step.position,ring)<=10){
   s.nextRing++;
   if(s.nextRing>=s.rings.length){s.status='success';return 2;}
   return 1;
  }
 }else if(s.id==='dive'){
  if(Math.hypot(step.velocity.x,step.velocity.y,step.velocity.z)>=40)s.diveArmed=true;
  if(s.diveArmed)s.lowY=Math.min(s.lowY,step.position.y);
  if(s.diveArmed&&step.position.y-s.lowY>=22){s.status='success';return 2;}
 }else if(s.id==='economy'){
  if(s.usedPulses>3){s.status='failed';return -1;}
  if(s.distance>=450){s.status='success';return 2;}
 }
 return 0;
}
export const COURSE_LABELS:Record<FlightCourseId,string>={
 rings:'Parcours des anneaux',dive:'Piqué et remontée',economy:'450 m avec 3 pets maximum'
};
