/** Springs feed the main WATER river, with explicit graph links and real confluences.
 * Candidate corridors follow downstream station order and are accepted only by WATER. */
import type {WaterBody} from '../world-data.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {compileWaterNetwork} from '../water/profile.ts';
import {polylineDistance} from '../geography/archipelago.ts';
export function proposeComposedTributaries(main:WaterBody,existing:WaterBody[],height:(x:number,z:number)=>number,
 bounds:{minX:number;maxX:number;minZ:number;maxZ:number},count:number):WaterBody[]{
 const accepted:WaterBody[]=[],axis=main.points,minor=Math.min(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
 for(const side of [-1,1,-1,1,-1,1]){
  if(accepted.length>=count)break;
  let found=false;
  for(const startFraction of [.08,.16,.25,.34]){
   if(found)break;
   const start=Math.max(1,Math.floor(axis.length*startFraction));
   for(const span of [.36,.48,.25]){
    if(found)break;
    const end=Math.min(axis.length-5,start+Math.floor(axis.length*span));if(end<=start+3)continue;
    for(const width of [.08,.12,.05,.025]){
     const points:PointXZ[]=[];
     for(let i=0;i<=18;i++){
      const t=i/18,s=start+(end-start)*t,index=Math.floor(s),a=axis[index],b=axis[Math.min(axis.length-1,index+1)],f=s-index,
       dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz)||1,offset=side*minor*width*Math.pow(1-t,1.25);
      points.push({x:a.x+(b.x-a.x)*f-dz/d*offset,z:a.z+(b.z-a.z)*f+dx/d*offset});
     }
     points[points.length-1]={...axis[end]};
     if(points.some(p=>p.x<bounds.minX||p.x>bounds.maxX||p.z<bounds.minZ||p.z>bounds.maxZ))continue;
     if(accepted.some(w=>polylineDistance(w.points,points[0].x,points[0].z)<Math.max(50,minor*.04)))continue;
     const water:WaterBody={id:'composition-tributary-'+accepted.length,kind:'river',points,width:Math.max(2,main.width*.3),depth:1.2,level:height(points[0].x,points[0].z)-.35,profile:{mode:'terrain',offset:-.35},to:{kind:'river',id:main.id}};
     const compiled=compileWaterNetwork([...existing,...accepted,water],height,0);
     if(compiled.some(w=>w.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE')))continue;
     const c=compiled.at(-1)!;
     if(c.points[0].level-c.points.at(-1)!.level<2)continue;
     accepted.push(water);found=true;break;
    }
   }
  }
 }
 return accepted;
}
