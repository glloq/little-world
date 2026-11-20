/**
 * Pure trackers turning fixed-step player state into typed gameplay events
 * (doc 104 §C7, §3). They run on the 30 Hz simulation tick, never on the
 * render frame, and keep only tiny serialisable state, so the same rules can
 * later run on an authoritative server.
 */
import type {GameplayEvent} from './events.ts';
import {DIVE_DEPTH_MARKS} from './events.ts';
import type {DiveSiteV1} from '../water/dive-sites.ts';

export interface DiveTrackerState {diving:boolean;marks:Record<string,number>;found:Record<string,true>}
export function createDiveTracker():DiveTrackerState{return {diving:false,marks:{},found:{}};}
const inside=(poly:readonly {x:number;z:number}[],x:number,z:number)=>{let r=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a.z>z)!==(b.z>z)&&x<a.x+(z-a.z)/(b.z-a.z)*(b.x-a.x))r=!r;}return r;};
/**
 * Depth marks are emitted once per dive and per site (5, 10, 20, 30, 45 m);
 * discoveries once per save (the caller persists `found`). Surfacing resets the marks.
 */
export function stepDiveTracker(s:DiveTrackerState,p:{mode:string;x:number;y:number;z:number;waterLevel:number|null},sites:readonly DiveSiteV1[]):GameplayEvent[]{
 const out:GameplayEvent[]=[];
 if(p.mode!=='dive'||p.waterLevel===null){if(s.diving){s.diving=false;s.marks={};}return out;}
 s.diving=true;const depth=p.waterLevel-p.y;
 for(const site of sites){
  if(!inside(site.polygon,p.x,p.z))continue;
  const reached=DIVE_DEPTH_MARKS.filter(m=>depth>=m).at(-1)??0;
  if(reached>(s.marks[site.id]??0)){s.marks[site.id]=reached;out.push({type:'dive.depth-reached',siteId:site.id,depthM:reached});}
  for(const d of site.discoveries??[]){
   if(s.found[d.id])continue;
   if(Math.hypot(d.x-p.x,d.z-p.z)<=3&&Math.abs((p.waterLevel+d.y)-p.y)<=3.5){s.found[d.id]=true;out.push({type:'underwater.discovered',discoveryId:d.id,siteId:site.id});}
  }
 }
 return out;
}

export interface SurfRideState {zoneId:string|null;startTick:number}
export function createSurfRideTracker():SurfRideState{return {zoneId:null,startTick:0};}
/** A wave counts as ridden after ≥ 5 s standing on the board in a swell zone, emitted when the ride ends. */
export function stepSurfRide(s:SurfRideState,p:{mode:string;tick:number;zoneId:string|null;style?:string},minTicks=150):GameplayEvent[]{
 const riding=p.mode==='surf'&&p.zoneId!==null;
 if(riding&&s.zoneId===null){s.zoneId=p.zoneId;s.startTick=p.tick;return [];}
 if(!riding&&s.zoneId!==null){const zone=s.zoneId,long=p.tick-s.startTick>=minTicks;s.zoneId=null;return long?[{type:'surf.wave-ridden',zoneId:zone,...(p.style?{style:p.style}:{})}]:[];}
 return [];
}

export interface SkiRunState {areaId:string|null;startTick:number;progress:number}
export function createSkiRunTracker():SkiRunState{return {areaId:null,startTick:0,progress:0};}
/**
 * A piste counts as completed when the skier starts in its upper fifth, follows
 * the corridor (snow mode, within the width) and reaches its lower tenth.
 * Leaving the corridor for more than a piste width cancels the run.
 */
export function stepSkiRun(s:SkiRunState,p:{mode:string;tick:number;x:number;z:number},areas:readonly {id:string;points:readonly {x:number;z:number}[];widthM:number;difficulty?:string}[]):GameplayEvent[]{
 const along=(a:{points:readonly {x:number;z:number}[]})=>{let best=Infinity,at=0,acc=0,total=0;const pts=a.points;for(let i=1;i<pts.length;i++)total+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z);
  for(let i=1;i<pts.length;i++){const q=pts[i-1],r=pts[i],dx=r.x-q.x,dz=r.z-q.z,len=Math.hypot(dx,dz)||1,t=Math.max(0,Math.min(1,((p.x-q.x)*dx+(p.z-q.z)*dz)/(len*len))),d=Math.hypot(q.x+dx*t-p.x,q.z+dz*t-p.z);if(d<best){best=d;at=(acc+t*len)/(total||1);}acc+=len;}return {d:best,t:at};};
 if(p.mode!=='snow'){if(s.areaId!==null&&p.mode!=='air'){s.areaId=null;}return [];}
 if(s.areaId===null){for(const a of areas){const r=along(a);if(r.d<=a.widthM&&r.t<=.2){s.areaId=a.id;s.startTick=p.tick;s.progress=r.t;break;}}return [];}
 const area=areas.find(a=>a.id===s.areaId);if(!area){s.areaId=null;return [];}
 const r=along(area);if(r.d>area.widthM*1.5){s.areaId=null;return [];}
 s.progress=Math.max(s.progress,r.t);
 if(s.progress>=.9){const out:GameplayEvent[]=[{type:'ski.piste-completed',areaId:area.id,...(area.difficulty?{difficulty:area.difficulty}:{}),seconds:Math.round((p.tick-s.startTick)/30*10)/10}];s.areaId=null;return out;}
 return [];
}
