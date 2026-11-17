/** Small convex polygons for native authoring regions, never a second terrain engine. */
import type {PointXZ} from '../geography/archipelago.ts';
export interface GeographicProvince {id:string;polygon:PointXZ[];center:PointXZ;station?:number}
const cross=(a:PointXZ,b:PointXZ,c:PointXZ)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
export function convexOutline(points:PointXZ[]):PointXZ[]{
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.z-b.z),half=(list:PointXZ[])=>{const out:PointXZ[]=[];for(const p of list){while(out.length>1&&cross(out.at(-2)!,out.at(-1)!,p)<=0)out.pop();out.push(p);}return out;};
 const a=half(sorted),b=half([...sorted].reverse());return [...a.slice(0,-1),...b.slice(0,-1)];
}
/** Keep dot(normal,p) <= limit. Intersections are geometric cuts, not coordinate clamps. */
export function cutPolygon(points:PointXZ[],normal:PointXZ,limit:number):PointXZ[]{
 const out:PointXZ[]=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],da=a.x*normal.x+a.z*normal.z-limit,db=b.x*normal.x+b.z*normal.z-limit;
  if(da<=1e-9)out.push(a);
  if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
 }
 return out.filter((p,i)=>Math.hypot(p.x-out[(i+out.length-1)%out.length].x,p.z-out[(i+out.length-1)%out.length].z)>.01);
}
export function polygonArea(points:PointXZ[]):number{return Math.abs(points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p.x*q.z-q.x*p.z;},0))/2;}
export function polygonCenter(points:PointXZ[]):PointXZ{
 let area=0,x=0,z=0;
 for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length],a=p.x*q.z-q.x*p.z;area+=a;x+=(p.x+q.x)*a;z+=(p.z+q.z)*a;}
 return {x:x/(3*area),z:z/(3*area)};
}
/** Complete, nonoverlapping 2D catchment mosaic clipped to the real main land outline. */
export function provinceMosaic(outline:PointXZ[],sites:{point:PointXZ;station?:number}[]):GeographicProvince[]{
 return sites.flatMap((site,i)=>{
  let polygon=outline;
  for(let j=0;j<sites.length&&polygon.length;j++)if(j!==i){const q=sites[j].point,p=site.point;
   polygon=cutPolygon(polygon,{x:q.x-p.x,z:q.z-p.z},(q.x*q.x+q.z*q.z-p.x*p.x-p.z*p.z)/2);
  }
  if(polygon.length<3||polygonArea(polygon)<25)return [];
  return [{id:'province-'+i,polygon,center:polygonCenter(polygon),...(site.station!==undefined?{station:site.station}:{})}];
 });
}
