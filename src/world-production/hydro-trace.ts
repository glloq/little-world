/** World Production V1 — downhill tracing of generated watercourses (WP-3/WP-4).
 * A preset never draws a river "by eye": from a source it follows the steepest descent of the
 * real relief (author edits and landscape shapes included) until the sea, an existing water body,
 * a pit, or a maximum length. The result is then validated by the WATER compilation like any
 * authored river. Pure and deterministic (no randomness: same relief = same course). */
import type {PointXZ} from '../geography/archipelago.ts';

export interface TraceOptions {
  height(x:number,z:number):number;seaLevel:number;
  /** Water surface at a point (lakes/rivers) or null; reaching one ends the course. */
  water?(x:number,z:number):number|null;
  inWorld(x:number,z:number):boolean;
  stepM?:number;maxLengthM?:number;
  /** Output spacing (m) and maximum number of points (WATER contract: ≤ 100). */
  spacingM?:number;maxPoints?:number;
  /** Initial heading (rad, atan2(dz,dx)) to break ties on flat ground. */
  heading?:number;
  /** Rise (m) tolerated above the lowest level reached, to cross small bumps of the relief
   * (the WATER profile lowers them locally); beyond it the course ends in a pit. */
  climbM?:number;
  /** Keep the course inside a corridor around an axis (valley floors drawn by a preset). */
  corridor?:{axis:PointXZ[];halfWidthM:number};
}
export interface TraceResult {points:PointXZ[];end:'sea'|'water'|'pit'|'length'|'border';lengthM:number;drop:number}
export function traceDownhill(start:PointXZ,o:TraceOptions):TraceResult{
  const step=o.stepM??12,max=o.maxLengthM??3000,spacing=o.spacingM??24,maxPoints=o.maxPoints??90;
  const path:PointXZ[]=[{...start}];let x=start.x,z=start.z,h=o.height(x,z),heading=o.heading??0,length=0,end:TraceResult['end']='length';const h0=h;
  while(length<max){
    let best:{x:number;z:number;h:number;a:number}|null=null;
    // 13 candidate headings within ±90° of the current one (prefers smooth courses).
    for(let k=-6;k<=6;k++){const a=heading+k*Math.PI/12,nx=x+Math.cos(a)*step,nz=z+Math.sin(a)*step;if(!o.inWorld(nx,nz))continue;
      if(o.corridor&&distanceToLine(o.corridor.axis,nx,nz)>o.corridor.halfWidthM)continue;
      // Never loop back onto the course already drawn (WATER rejects self-crossing rivers).
      let back=false;for(let i=0;i<path.length-3;i++)if(Math.hypot(path[i].x-nx,path[i].z-nz)<step*1.5){back=true;break;}if(back)continue;
      const nh=o.height(nx,nz)+Math.abs(k)*.004*step;if(!best||nh<best.h)best={x:nx,z:nz,h:nh,a};}
    if(!best){end='border';break;}
    const realH=o.height(best.x,best.z);
    if(realH>h+(o.climbM??5)){end='pit';break;}
    x=best.x;z=best.z;heading=best.a;length+=step;h=Math.min(h,realH);path.push({x,z});
    if(realH<o.seaLevel-.6){end='sea';break;}
    const w=o.water?.(x,z);if(w!==null&&w!==undefined&&w>realH+.2){end='water';break;}
  }
  // A course ending in a pit never ends with a climb: cut it at its lowest point.
  if(end==='pit'||end==='length'||end==='border'){let low=0,lowH=Infinity;for(let i=0;i<path.length;i++){const y=o.height(path[i].x,path[i].z);if(y<=lowH){lowH=y;low=i;}}path.splice(low+1);length=Math.min(length,low*step);}
  // Resample at `spacing` (keeping both ends), bounded number of points.
  const out:PointXZ[]=[path[0]];let acc=0;
  for(let i=1;i<path.length;i++){acc+=Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z);if(acc>=spacing||i===path.length-1){out.push({x:Math.round(path[i].x*10)/10,z:Math.round(path[i].z*10)/10});acc=0;}}
  while(out.length>maxPoints)for(let i=out.length-2;i>0&&out.length>maxPoints;i-=2)out.splice(i,1);
  return {points:out,end,lengthM:length,drop:h0-h};
}
function distanceToLine(pts:PointXZ[],x:number,z:number):number{
  let best=Infinity;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}return best;
}
