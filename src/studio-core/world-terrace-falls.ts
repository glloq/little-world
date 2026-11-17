/** Explicit short waterfalls placed on an actually descending terrace face.
 * Terrain profiles remain active: no manual-profile escape from WATER validation. */
import type {WaterBody} from '../world-data.ts';
import {compileWaterNetwork} from '../water/profile.ts';
export function planTerraceFalls(waters:WaterBody[],height:(x:number,z:number)=>number,maxFalls=6):WaterBody[]{
 const current=waters.map(w=>structuredClone(w));let remaining=maxFalls;
 for(let wi=0;wi<current.length&&remaining>0;wi++){
  const w=current[wi];if(w.kind==='lake'||w.profile?.mode!=='terrain')continue;
  const body=compileWaterNetwork(current,height,0)[wi],candidates=body.points.slice(1,-2).flatMap((p,i)=>{
   const next=body.points[i+2],d=next.distance-p.distance;
   return d>0&&p.level-next.level>=2?[{p,next,drop:p.level-next.level}]:[];
  }).sort((a,b)=>b.drop-a.drop);
  const positions:{x:number;z:number}[]=[];
  for(const candidate of candidates.slice(0,80)){
   if(!remaining||(w.falls?.length??0)>=8||w.points.length>=100)break;
   const p=candidate.p;if(positions.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<50))continue;
   let segment=-1;
   for(let i=1;i<w.points.length;i++){
    const a=w.points[i-1],b=w.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(Math.abs(Math.hypot(p.x-a.x,p.z-a.z)+Math.hypot(p.x-b.x,p.z-b.z)-length)<1e-5&&Math.hypot(p.x-a.x,p.z-a.z)>1&&Math.hypot(p.x-b.x,p.z-b.z)>1){segment=i;break;}
   }
   if(segment<1)continue;
   const next=candidate.next,d=Math.hypot(next.x-p.x,next.z-p.z),t=Math.min(1,1.5/d),top=Math.floor(p.level*100)/100,
    bottom=Math.max(0,Math.ceil((height(p.x+(next.x-p.x)*t,p.z+(next.z-p.z)*t)-.35)*100)/100);
   if(top-bottom<1)continue;
   const updated=structuredClone(w);updated.points.splice(segment,0,{x:p.x,z:p.z});
   updated.falls=[...(updated.falls??[]).map(f=>({...f,at:f.at>=segment?f.at+1:f.at})),{at:segment,top,bottom}].sort((a,b)=>a.at-b.at);
   const proposed=current.map((q,i)=>i===wi?updated:q),compiled=compileWaterNetwork(proposed,height,0);
   if(compiled.some(q=>q.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE')))continue;
   Object.assign(w,updated);positions.push(p);remaining--;
  }
 }
 return current;
}
