/** Road audit: what a player actually sees along the drawn centre line of every path —
 * metres under water, grades beyond the profile, side tilt, and how each stream is crossed
 * (bridge present, aligned with the road, square to the river). Pure and derived: no Three.js,
 * nothing stored. Thresholds are visual comfort knobs, not gameplay rules. */
import type {PathDefinition} from '../world-data.ts';
import {centerline,kindOf,PATH_PROFILES,type Sample} from './path-geometry.ts';

export interface RoadWaterHit {id:string;level:number;lake:boolean;flowX:number;flowZ:number}
export interface RoadBridge {id:string;x:number;z:number;axisX:number;axisZ:number;lengthM:number}
export interface RoadAuditEnv {height(x:number,z:number):number;seaLevel:number;
 /** Water bodies covering the point (surface above the bed), empty on dry ground. */
 water(x:number,z:number):readonly RoadWaterHit[];bridges:readonly RoadBridge[]}
export interface RoadCrossing {pathId:string;waterId:string;x:number;z:number;wetM:number;
 /** 0° = road square to the stream, 90° = road running along it. */skewDeg:number;
 bridgeId:string|null;/** Angle between the bridge deck and the road (0° = aligned). */bridgeYawErrorDeg:number|null;bridgeOffsetM:number|null}
export interface RoadPathAudit {pathId:string;kind:string;lengthM:number;
 /** Metres of walking surface under a lake, the sea or a stream without any deck. */underwaterM:number;
 steepM:number;maxGrade:number;maxGradeAt:{x:number;z:number};
 /** Metres where the ground falls sideways by more than `ROAD_AUDIT.tilt` across the surface. */tiltedM:number;maxTilt:number;
 /** Metres climbing a steep slope straight up the fall line (no traverse, no hairpin). */fallLineM:number}
export interface RoadAudit {paths:RoadPathAudit[];crossings:RoadCrossing[];
 totals:{lengthM:number;underwaterM:number;steepM:number;tiltedM:number;fallLineM:number;crossings:number;unbridged:number;skewedCrossings:number;misalignedBridges:number;/** Bridges no path arrives on. */orphanBridges:number}}

export const ROAD_AUDIT={gradeWindowM:8,tilt:.22,skewDeg:25,bridgeYawDeg:15,bridgeReachM:6,fallLineGrade:.3,fallLineCos:.85,shoreM:.15,crossingStepM:.6} as const;
const deg=(r:number)=>r*180/Math.PI,acute=(dx:number,dz:number,ex:number,ez:number)=>{const l=Math.hypot(dx,dz)*Math.hypot(ex,ez)||1;return deg(Math.acos(Math.min(1,Math.abs(dx*ex+dz*ez)/l)));};

function supported(path:PathDefinition){return !!path.supportId||kindOf(path)==='wood';}
/** One path: grades over a sliding window (the eye reads a slope over several metres, not per sample). */
function auditPath(path:PathDefinition,line:Sample[],env:RoadAuditEnv):{audit:RoadPathAudit;wet:boolean[]}{
 const profile=PATH_PROFILES[kindOf(path)],half=path.width/2,h=line.map(s=>env.height(s.x,s.z)),deck=supported(path);
 const wet=line.map((s,i)=>!deck&&(h[i]<env.seaLevel-ROAD_AUDIT.shoreM||env.water(s.x,s.z).some(w=>w.level>h[i]+ROAD_AUDIT.shoreM)));
 let underwaterM=0,steepM=0,tiltedM=0,fallLineM=0,maxGrade=0,maxTilt=0,at=line[0],j=0;
 for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],seg=b.d-a.d;if(seg<=0)continue;
  if(wet[i]||wet[i-1]){underwaterM+=seg;continue;}
  while(line[i].d-line[j].d>ROAD_AUDIT.gradeWindowM)j++;
  const run=line[i].d-line[j].d,grade=run>1?Math.abs(h[i]-h[j])/run:0;
  if(grade>maxGrade){maxGrade=grade;at=b;}
  if(deck)continue;
  if(grade>profile.maxSlope)steepM+=seg;
  const ux=(b.x-a.x)/seg,uz=(b.z-a.z)/seg,tilt=Math.abs(env.height(b.x-uz*half,b.z+ux*half)-env.height(b.x+uz*half,b.z-ux*half))/(path.width||1);
  if(tilt>maxTilt)maxTilt=tilt;if(tilt>ROAD_AUDIT.tilt)tiltedM+=seg;
  // Fall line: local terrain gradient nearly parallel to the road while the ground is steep.
  const gx=(env.height(b.x+2,b.z)-env.height(b.x-2,b.z))/4,gz=(env.height(b.x,b.z+2)-env.height(b.x,b.z-2))/4,g=Math.hypot(gx,gz);
  if(g>ROAD_AUDIT.fallLineGrade&&Math.abs(gx*ux+gz*uz)/g>ROAD_AUDIT.fallLineCos)fallLineM+=seg;
 }
 const r=(v:number)=>Math.round(v*10)/10;
 return {wet,audit:{pathId:path.id,kind:kindOf(path),lengthM:r(line.at(-1)?.d??0),underwaterM:r(underwaterM),steepM:r(steepM),maxGrade:Math.round(maxGrade*1000)/1000,maxGradeAt:{x:Math.round(at.x),z:Math.round(at.z)},tiltedM:r(tiltedM),maxTilt:Math.round(maxTilt*1000)/1000,fallLineM:r(fallLineM)}};
}
/** Stream crossings of one path: every run of samples lying over a river (lakes and sea are not crossings). */
function crossingsOf(path:PathDefinition,coarse:Sample[],env:RoadAuditEnv):RoadCrossing[]{
 // A brook is narrower than the drawing step: resample finely so none slips between two samples.
 const line:Sample[]=[];for(let i=0;i<coarse.length;i++){const b=coarse[i];if(i){const a=coarse[i-1],n=Math.ceil((b.d-a.d)/ROAD_AUDIT.crossingStepM);for(let k=1;k<n;k++)line.push({x:a.x+(b.x-a.x)*k/n,z:a.z+(b.z-a.z)*k/n,d:a.d+(b.d-a.d)*k/n});}line.push(b);}
 const out:RoadCrossing[]=[],river=(s:Sample)=>{const g=env.height(s.x,s.z);return env.water(s.x,s.z).find(w=>!w.lake&&w.level>g-.05)??null;};
 for(let i=0;i<line.length;i++){
  const first=river(line[i]);if(!first)continue;
  let k=i;while(k+1<line.length&&river(line[k+1])?.id===first.id)k++;
  const a=line[Math.max(0,i-4)],b=line[Math.min(line.length-1,k+4)],m=line[(i+k)>>1],mid=river(m)??first,dx=b.x-a.x,dz=b.z-a.z;
  // Skew: 90° minus the angle between the road and the flow.
  const skewDeg=Math.hypot(mid.flowX,mid.flowZ)>1e-6?90-acute(dx,dz,mid.flowX,mid.flowZ):0;
  let bridge:RoadBridge|null=null,offset=Infinity;
  for(const br of env.bridges){const d=Math.hypot(br.x-m.x,br.z-m.z);if(d<=Math.max(ROAD_AUDIT.bridgeReachM,br.lengthM/2)&&d<offset){bridge=br;offset=d;}}
  out.push({pathId:path.id,waterId:first.id,x:Math.round(m.x*10)/10,z:Math.round(m.z*10)/10,wetM:Math.round((b.d-a.d)*10)/10,skewDeg:Math.round(skewDeg),
   bridgeId:bridge?.id??null,bridgeYawErrorDeg:bridge?Math.round(acute(dx,dz,bridge.axisX,bridge.axisZ)):null,bridgeOffsetM:bridge?Math.round(offset*10)/10:null});
  i=k;
 }
 return out;
}
export function auditRoads(paths:readonly PathDefinition[],env:RoadAuditEnv):RoadAudit{
 const audits:RoadPathAudit[]=[],crossings:RoadCrossing[]=[],ends=paths.flatMap(p=>[p.points[0],p.points.at(-1)!]);
 for(const path of [...paths].sort((a,b)=>a.id.localeCompare(b.id))){
  const line=centerline(path);if(line.length<2)continue;
  audits.push(auditPath(path,line,env).audit);crossings.push(...crossingsOf(path,line,env));
 }
 const sum=(f:(a:RoadPathAudit)=>number)=>Math.round(audits.reduce((n,a)=>n+f(a),0));
 return {paths:audits,crossings,totals:{lengthM:sum(a=>a.lengthM),underwaterM:sum(a=>a.underwaterM),steepM:sum(a=>a.steepM),tiltedM:sum(a=>a.tiltedM),fallLineM:sum(a=>a.fallLineM),
  crossings:crossings.length,unbridged:crossings.filter(c=>!c.bridgeId).length,skewedCrossings:crossings.filter(c=>c.skewDeg>ROAD_AUDIT.skewDeg).length,
  misalignedBridges:crossings.filter(c=>c.bridgeYawErrorDeg!==null&&c.bridgeYawErrorDeg>ROAD_AUDIT.bridgeYawDeg).length,
  orphanBridges:env.bridges.filter(b=>!crossings.some(c=>c.bridgeId===b.id)&&!ends.some(q=>Math.hypot(q.x-b.x,q.z-b.z)<=b.lengthM/2+ROAD_AUDIT.bridgeReachM)).length}};
}
