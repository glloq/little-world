import {waterSections} from './profile.ts';
import type {CompiledWater} from './profile.ts';
/** Joined cross-sections: one height across each river width, no gaps at bends. Explicit
 * waterfalls appear as a near-vertical sheet between their high and low points. Lakes: one
 * flat surface over their outline (ear clipping, no library). */
export function waterRibbonData(water:CompiledWater){
 if(water.kind==='lake')return lakeSurfaceData(water);
 const positions:number[]=[],indices:number[]=[];
 const sections=waterSections(water);
 for(let i=0;i<sections.length;i++){
  for(const v of [sections[i].left,sections[i].right])positions.push(v.x,v.level+.04,v.z);
  if(i){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
 }
 return {positions,indices};
}
export function lakeSurfaceData(water:CompiledWater){
 const poly=water.polygon!,level=water.points[0].level+.04,positions:number[]=[],indices:number[]=[];
 for(const p of poly)positions.push(p.x,level,p.z);
 // Counter-clockwise (seen from above, +Y up: x right, z down the screen) for upward faces.
 let area=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];area+=a.x*b.z-b.x*a.z;}
 const order=poly.map((_,i)=>i);if(area<0)order.reverse();
 const cross=(a:number,b:number,c:number)=>(poly[b].x-poly[a].x)*(poly[c].z-poly[a].z)-(poly[b].z-poly[a].z)*(poly[c].x-poly[a].x);
 const inside=(p:number,a:number,b:number,c:number)=>{const s1=(poly[b].x-poly[a].x)*(poly[p].z-poly[a].z)-(poly[b].z-poly[a].z)*(poly[p].x-poly[a].x),s2=(poly[c].x-poly[b].x)*(poly[p].z-poly[b].z)-(poly[c].z-poly[b].z)*(poly[p].x-poly[b].x),s3=(poly[a].x-poly[c].x)*(poly[p].z-poly[c].z)-(poly[a].z-poly[c].z)*(poly[p].x-poly[c].x);return s1>0&&s2>0&&s3>0;};
 let guard=0;
 while(order.length>3&&guard++<10000){
  let clipped=false;
  for(let i=0;i<order.length;i++){const a=order[(i+order.length-1)%order.length],b=order[i],c=order[(i+1)%order.length];
   if(cross(a,b,c)<=0)continue;if(order.some(p=>p!==a&&p!==b&&p!==c&&inside(p,a,b,c)))continue;
   indices.push(a,c,b);order.splice(i,1);clipped=true;break;}
  if(!clipped)break;
 }
 if(order.length===3)indices.push(order[0],order[2],order[1]);
 return {positions,indices};
}
