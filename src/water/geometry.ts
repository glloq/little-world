
import {waterSections,polygonSignedDistance} from './profile.ts';
import type {CompiledWater} from './profile.ts';
/** Render-only data of one compiled water (doc 108). `flow` holds 4 floats per vertex:
 *  along (m, downstream; down the sheet on a waterfall), across (-1 left bank … 1 right bank;
 *  for a lake: 1 on the shore → 0 three metres inside), rush (0 calm … 1 white water; -1 = lake)
 *  and baked foam (0…1: waterfall lip, sheet, plunge pool). Physics never reads it. */
export interface WaterRenderData {positions:number[];indices:number[];flow:number[]}
/** Rows of a waterfall sheet between its high and low sections (render only). */
export const FALL_SHEET_ROWS=6;
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
/** Joined cross-sections: one height across each river width, no gaps at bends. Explicit
 * waterfalls become a curved sheet (parabolic throw, slight spread) between their high and low
 * points; the pool ribbon starts again at the low section. Lakes: one flat surface over their
 * outline (ear clipping, no library), subdivided so the shore band can be shaded. */
export function waterRibbonData(water:CompiledWater):WaterRenderData{
 if(water.kind==='lake')return lakeRenderData(water);
 const positions:number[]=[],indices:number[]=[],flow:number[]=[];
 const sections=waterSections(water),p=water.points,n=p.length;
 // A waterfall is the pair (i-1, i): same place (≤ 0.2 m apart) and ≥ 0.9 m lower.
 const isFall=(i:number)=>i>0&&p[i-1].level-p[i].level>.9&&p[i].distance-p[i-1].distance<.2;
 const fallBottoms:number[]=[],fallTops:number[]=[],fallDrops:number[]=[];
 for(let i=1;i<n;i++)if(isFall(i)){fallTops.push(p[i-1].distance);fallBottoms.push(p[i].distance);fallDrops.push(p[i-1].level-p[i].level);}
 // Downstream of a fall, `along` also counts the sheet height: streaks stay continuous.
 const alongAt=(d:number)=>{let a=d;for(let k=0;k<fallBottoms.length;k++)if(d>=fallBottoms[k])a+=fallDrops[k]-(fallBottoms[k]-fallTops[k]);return a;};
 // Rush from the local slope of the water line (calm < 1 %, white water from ≈ 12 %).
 const rushAt=(i:number)=>{const a=p[Math.max(0,i-1)],b=p[Math.min(n-1,i+1)];
  if((i>0&&isFall(i))||(i+1<n&&isFall(i+1)))return 1;
  const run=b.distance-a.distance;return run>1e-3?smooth(.01,.12,(a.level-b.level)/run):0;};
 // Baked foam: plunge pool below a fall, accelerating lip above it.
 const pool=Math.max(6,water.width*1.6);
 const foamAt=(i:number)=>{let f=0;const d=p[i].distance;
  for(const b of fallBottoms){const k=d-b;if(k>=0&&k<pool)f=Math.max(f,(1-k/pool)**1.5);}
  for(const t of fallTops){const k=t-d;if(k>=0&&k<3)f=Math.max(f,.35*(1-k/3));}
  return f;};
 let rows=0;
 const row=(l:{x:number;z:number},r:{x:number;z:number},y:number,a:number,rush:number,foam:number,join:boolean)=>{
  positions.push(l.x,y,l.z,r.x,y,r.z);flow.push(a,-1,rush,foam,a,1,rush,foam);
  if(join&&rows){const k=(rows-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  rows++;
 };
 for(let i=0;i<n;i++){
  if(isFall(i)){
   const top=p[i-1],bottom=p[i],drop=top.level-bottom.level,s=sections[i-1];
   const dx=(p[Math.min(n-1,i+1)].x-top.x),dz=(p[Math.min(n-1,i+1)].z-top.z),len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len;
   // Parabolic throw: horizontal offset ∝ √(fallen height), capped; the sheet widens a little.
   const throwM=Math.min(2.5,.3*Math.sqrt(drop));
   const cx=(s.left.x+s.right.x)/2,cz=(s.left.z+s.right.z)/2,hx=(s.left.x-s.right.x)/2,hz=(s.left.z-s.right.z)/2;
   for(let k=1;k<=FALL_SHEET_ROWS;k++){
    const t=k/FALL_SHEET_ROWS,o=throwM*Math.sqrt(t),spread=1+.18*t,x=cx+ux*o,z=cz+uz*o;
    row({x:x+hx*spread,z:z+hz*spread},{x:x-hx*spread,z:z-hz*spread},top.level+.04-drop*t,top.distance+drop*t,1,.45+.4*t,true);
   }
   // The pool starts a new strip at the low section (no fold back under the sheet).
   row(sections[i].left,sections[i].right,bottom.level+.04,alongAt(bottom.distance),rushAt(i),foamAt(i),false);
   continue;
  }
  row(sections[i].left,sections[i].right,p[i].level+.04,alongAt(p[i].distance),rushAt(i),foamAt(i),true);
 }
 return {positions,indices,flow};
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
/** Width (m) of the shaded shore band of a lake. */
export const LAKE_SHORE_BAND=3;
/** Lake surface subdivided on a barycentric grid (flat: T-junctions cannot crack) so that each
 * vertex carries its distance to the shore. ≤ ~24 000 triangles whatever the lake size. */
export function lakeRenderData(water:CompiledWater):WaterRenderData{
 const base=lakeSurfaceData(water),poly=water.polygon!,bp=base.positions,bi=base.indices;
 let area=0;const tri=(t:number)=>[0,1,2].map(k=>bi[t*3+k]*3);
 for(let t=0;t<bi.length/3;t++){const [a,b,c]=tri(t);area+=Math.abs((bp[b]-bp[a])*(bp[c+2]-bp[a+2])-(bp[b+2]-bp[a+2])*(bp[c]-bp[a]))/2;}
 const cell=Math.max(2.5,Math.sqrt(area/12000));
 const positions:number[]=[],indices:number[]=[],flow:number[]=[];
 for(let t=0;t<bi.length/3;t++){
  const [a,b,c]=tri(t),edge=(u:number,v:number)=>Math.hypot(bp[u]-bp[v],bp[u+2]-bp[v+2]);
  const steps=Math.max(1,Math.min(48,Math.ceil(Math.max(edge(a,b),edge(b,c),edge(c,a))/cell))),first=positions.length/3,id=(i:number,j:number)=>first+i*(steps+1)-i*(i-1)/2+j;
  for(let i=0;i<=steps;i++)for(let j=0;j<=steps-i;j++){
   const u=i/steps,v=j/steps,w=1-u-v;
   const x=bp[a]*w+bp[b]*u+bp[c]*v,y=bp[a+1],z=bp[a+2]*w+bp[b+2]*u+bp[c+2]*v;
   const inward=Math.max(0,polygonSignedDistance(poly,x,z));
   positions.push(x,y,z);flow.push(0,1-smooth(0,LAKE_SHORE_BAND,inward),-1,0);
  }
  // Same winding as the source triangle (a, b, c), which already faces up.
  for(let i=0;i<steps;i++)for(let j=0;j<steps-i;j++){
   indices.push(id(i,j),id(i+1,j),id(i,j+1));
   if(j<steps-i-1)indices.push(id(i+1,j),id(i+1,j+1),id(i,j+1));
  }
 }
 return {positions,indices,flow};
}
