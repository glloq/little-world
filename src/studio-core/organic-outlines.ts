/** Rounded native polygons. No new terrain primitive or dense persistent grid. */
import type {PointXZ} from '../geography/archipelago.ts';
import {cutPolygon} from './world-provinces.ts';
export function roundOutline(input:PointXZ[],count=64):PointXZ[]{
 let points=input.map(p=>({...p}));
 const lengths=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%points.length].x,p.z-points[(i+1)%points.length].z)),total=lengths.reduce((a,b)=>a+b,0),out:PointXZ[]=[];
 let edge=0,offset=0;
 for(let i=0;i<count;i++){
  const distance=total*i/count;while(edge<lengths.length-1&&offset+lengths[edge]<distance)offset+=lengths[edge++];
  const a=points[edge],b=points[(edge+1)%points.length],t=(distance-offset)/(lengths[edge]||1);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
 }
 points=out;
 // Smooth at a scale larger than one native polygon segment, including clipped tips.
 for(let pass=0;pass<20;pass++)points=points.map((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return {x:a.x*.25+p.x*.5+b.x*.25,z:a.z*.25+p.z*.5+b.z*.25};});
 return points;
}
export function intersectOutline(subject:PointXZ[],boundary:PointXZ[]):PointXZ[]{
 let points=subject;
 for(let i=0;i<boundary.length&&points.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],normal={x:b.z-a.z,z:a.x-b.x};
  points=cutPolygon(points,normal,normal.x*a.x+normal.z*a.z);
 }
 if(points.length<3)throw Error('Contour de plateau vide : composition incompatible');
 return roundOutline(points);
}
export function curvedLine(input:PointXZ[],count=24):PointXZ[]{
 const out:PointXZ[]=[];
 for(let i=0;i<count;i++){
  const s=i/(count-1)*(input.length-1),j=Math.min(input.length-2,Math.floor(s)),t=s-j,
   a=input[Math.max(0,j-1)],b=input[j],c=input[j+1],d=input[Math.min(input.length-1,j+2)];
  const value=(key:'x'|'z')=>.5*((2*b[key])+(-a[key]+c[key])*t+(2*a[key]-5*b[key]+4*c[key]-d[key])*t*t+(-a[key]+3*b[key]-3*c[key]+d[key])*t*t*t);
  out.push({x:value('x'),z:value('z')});
 }
 return out;
}
