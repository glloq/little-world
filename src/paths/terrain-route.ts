/** Bounded, deterministic ground routing shared by terrain and settlement access planning.
 * Output is a native PathDefinition; physical bridges/stairs are never invented. */
import {MinHeap} from '../studio-core/depression-fill.ts';
import type {PointXZ} from '../geography/archipelago.ts';
export interface GroundRouteContext {bounds:{minX:number;maxX:number;minZ:number;maxZ:number};height:(x:number,z:number)=>number;wet:(x:number,z:number)=>boolean;seaLevel:number}
export interface RoutePolicy {maxSlope:number;widthM:number;maxCells?:number}
export function inspectGroundSegment(a:PointXZ,b:PointXZ,c:GroundRouteContext,p:RoutePolicy):{valid:boolean;maxSlope:number}{
 const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/5)),dx=(b.x-a.x)/n,dz=(b.z-a.z)/n,half=p.widthM/2,nx=length?-(b.z-a.z)/length:0,nz=length?(b.x-a.x)/length:0;
 let previous=c.height(a.x,a.z),maxSlope=0;
 for(let i=0;i<=n;i++){
  const x=a.x+dx*i,z=a.z+dz*i,h=c.height(x,z);if(!Number.isFinite(h)||h<c.seaLevel+1)return {valid:false,maxSlope:Infinity};
  if(i)maxSlope=Math.max(maxSlope,Math.abs(h-previous)/(length/n||1));previous=h;
  for(const side of [-1,0,1]){
   const sx=x+nx*half*side,sz=z+nz*half*side;
   if(sx<c.bounds.minX||sx>c.bounds.maxX||sz<c.bounds.minZ||sz>c.bounds.maxZ||c.wet(sx,sz)||c.height(sx,sz)<c.seaLevel+1)return {valid:false,maxSlope:Infinity};
   if(side)maxSlope=Math.max(maxSlope,Math.abs(c.height(sx,sz)-h)/(half||1));
  }
  if(maxSlope>p.maxSlope+1e-6)return {valid:false,maxSlope};
 }
 return {valid:true,maxSlope};
}
function routeGrid(start:PointXZ,end:PointXZ,c:GroundRouteContext,p:RoutePolicy,grid:GroundRouteContext['bounds']):{points:PointXZ[];expanded:number;reason?:string}{
 const w=grid.maxX-grid.minX,d=grid.maxZ-grid.minZ,step=Math.max(8,Math.sqrt(w*d/Math.min(16384,Math.max(256,p.maxCells??9216)))),cols=Math.max(2,Math.floor(w/step)),rows=Math.max(2,Math.floor(d/step)),sx=w/cols,sz=d/rows,n=cols*rows,
  point=(i:number)=>({x:grid.minX+(i%cols+.5)*sx,z:grid.minZ+(Math.floor(i/cols)+.5)*sz}),heights=new Float32Array(n),open=new Uint8Array(n),g=new Float64Array(n).fill(Infinity),parent=new Int32Array(n).fill(-1),closed=new Uint8Array(n);
 for(let i=0;i<n;i++){const q=point(i),h=c.height(q.x,q.z);heights[i]=h;open[i]=h>c.seaLevel+1&&!c.wet(q.x,q.z)?1:0;}
 const nearest=(q:PointXZ)=>{
  const x=Math.min(cols-1,Math.max(0,Math.floor((q.x-grid.minX)/sx))),z=Math.min(rows-1,Math.max(0,Math.floor((q.z-grid.minZ)/sz))),options:{id:number;distance:number}[]=[];
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,zz=z+dz;if(xx<0||xx>=cols||zz<0||zz>=rows)continue;const id=zz*cols+xx,t=point(id);if(open[id])options.push({id,distance:Math.hypot(t.x-q.x,t.z-q.z)});}
  options.sort((a,b)=>a.distance-b.distance||a.id-b.id);return options.find(o=>inspectGroundSegment(q,point(o.id),c,p).valid)?.id??-1;
 };
 const first=nearest(start),last=nearest(end);if(first<0||last<0)return {points:[],expanded:0,reason:'Aucun raccord au sol praticable près de l’entrée.'};
 const heap=new MinHeap(),goal=point(last);g[first]=0;heap.push({index:first,level:0});let expanded=0;
 while(heap.length&&expanded<n){
  const i=heap.pop().index;if(closed[i])continue;closed[i]=1;expanded++;if(i===last)break;
  const x=i%cols,z=Math.floor(i/cols),a=point(i);
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const xx=x+dx,zz=z+dz,j=zz*cols+xx;if(xx<0||xx>=cols||zz<0||zz>=rows||!open[j]||closed[j])continue;
   const b=point(j),distance=Math.hypot(dx*sx,dz*sz),slope=Math.abs(heights[i]-heights[j])/distance;if(slope>p.maxSlope)continue;
   const cost=g[i]+distance*(1+slope*3);if(cost>=g[j])continue;
   if(!inspectGroundSegment(a,b,c,p).valid)continue;
   parent[j]=i;g[j]=cost;heap.push({index:j,level:cost+Math.hypot(b.x-goal.x,b.z-goal.z)});
  }
 }
 if(!closed[last])return {points:[],expanded,reason:'Aucun passage sec respectant la pente et la largeur demandées.'};
 const ids:number[]=[];for(let i=last;i>=0;i=parent[i]){ids.push(i);if(i===first)break;}
 const raw=[start,...ids.reverse().map(point),end],out:PointXZ[]=[start];let cursor=0;
 while(cursor<raw.length-1){
  let next=Math.min(raw.length-1,cursor+24);while(next>cursor+1&&!inspectGroundSegment(raw[cursor],raw[next],c,p).valid)next--;
  out.push(raw[next]);cursor=next;if(out.length>100)return {points:[],expanded,reason:'Tracé trop complexe pour le budget natif de points.'};
 }
 return {points:out.filter((q,i)=>!i||Math.hypot(q.x-out[i-1].x,q.z-out[i-1].z)>.01).map(q=>({x:q.x,z:q.z})),expanded};
}

/** Refine around the requested connection before falling back to the full island. */
export function planGroundRoute(start:PointXZ,end:PointXZ,c:GroundRouteContext,p:RoutePolicy):{points:PointXZ[];expanded:number;reason?:string}{
 const distance=Math.hypot(end.x-start.x,end.z-start.z);let expanded=0;
 const boxes=[Math.max(96,distance*.2),Math.max(192,distance*.4)].map(m=>({minX:Math.max(c.bounds.minX,Math.min(start.x,end.x)-m),maxX:Math.min(c.bounds.maxX,Math.max(start.x,end.x)+m),minZ:Math.max(c.bounds.minZ,Math.min(start.z,end.z)-m),maxZ:Math.min(c.bounds.maxZ,Math.max(start.z,end.z)+m)}));boxes.push(c.bounds);
 for(const box of boxes){const result=routeGrid(start,end,c,p,box);expanded+=result.expanded;if(result.points.length)return {...result,expanded};}
 return {points:[],expanded,reason:'Aucun passage sec respectant la pente et la largeur demandées.'};
}
