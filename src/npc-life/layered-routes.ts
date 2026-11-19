/** Surface-aware pedestrian routing for authored bridges and elevated paths.
 * Links require both X/Z proximity and compatible physical height. Never
 * convert a crossing in plan view into an unqualified 3D junction.
 */
import {residentRoute,type ResidentPoint,type ResidentRoute} from './schedule.ts';
import type {ResidentPath,ResidentRouter,ResidentWalkable} from './routes.ts';
export interface ResidentSurfaces {
 groundHeight:(x:number,z:number)=>number;
 /** Valid only inside an authored bridge/stair/support footprint; null outside. */
 supportHeight:(supportId:string,x:number,z:number)=>number|null;
}
interface Node {p:ResidentPoint;supportId:string|null;links:{to:number;cost:number}[]}
const distance=(a:ResidentPoint,b:ResidentPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
function walkSegment(a:ResidentPoint,b:ResidentPoint,walk:ResidentWalkable){
 const steps=Math.max(1,Math.ceil(distance(a,b)/1.3));
 if(steps>180)return false;
 let last=a;
 for(let i=1;i<=steps;i++){
  const t=i/steps,next={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  if(!walk(next.x,next.z,last.x,last.z))return false;
  last=next;
 }return true;
}
export function createResidentLayeredRouter(
 paths:readonly ResidentPath[],walk:ResidentWalkable,surface:ResidentSurfaces,maxNodes=16000,
):ResidentRouter{
 const nodes:Node[]=[],index=new Map<string,number>(),cells=new Map<string,number[]>(),CELL=32;
 const cell=(x:number,z:number)=>Math.floor(x/CELL)+':'+Math.floor(z/CELL);
 let truncated=false;
 const height=(path:ResidentPath,x:number,z:number):number|null=>{
  const y=path.supportId?surface.supportHeight(path.supportId,x,z):surface.groundHeight(x,z);
  return typeof y==='number'&&Number.isFinite(y)?y:null;
 };
 function node(path:ResidentPath,x:number,z:number):number{
  const y=height(path,x,z);if(y===null)return -1;
  const key=Math.round(x*20)+':'+Math.round(y*10)+':'+Math.round(z*20);
  const known=index.get(key);if(known!==undefined)return known;
  if(nodes.length>=maxNodes){truncated=true;return -1;}
  const id=nodes.length,point={x,z,y},bucket=cells.get(cell(x,z))??[];
  nodes.push({p:point,supportId:path.supportId??null,links:[]});
  index.set(key,id);bucket.push(id);cells.set(cell(x,z),bucket);
  return id;
 }
 function edge(a:number,b:number){
  if(a<0||b<0||a===b)return;
  const u=nodes[a].p,v=nodes[b].p,distanceXZ=distance(u,v),vertical=Math.abs((u.y??0)-(v.y??0));
  if(distanceXZ<.001||vertical/distanceXZ>.46)return;
  const cost=Math.hypot(distanceXZ,vertical);
  if(!nodes[a].links.some(e=>e.to===b))nodes[a].links.push({to:b,cost});
  if(!nodes[b].links.some(e=>e.to===a))nodes[b].links.push({to:a,cost});
 }
 function safeEdge(a:number,b:number,supportId:string|null):boolean{
  if(a<0||b<0)return false;
  const p=nodes[a].p,q=nodes[b].p;
  if(!supportId)return walkSegment(p,q,walk);
  const steps=Math.max(1,Math.ceil(distance(p,q)/1.25));
  let previous=p.y!;
  for(let i=1;i<=steps;i++){
   const t=i/steps,x=p.x+(q.x-p.x)*t,z=p.z+(q.z-p.z)*t;
   const y=surface.supportHeight(supportId,x,z);
   if(y===null||!Number.isFinite(y)||Math.abs(y-previous)>1.25*.46)return false;
   previous=y;
  }return true;
 }
 for(const path of paths){
  if(!Array.isArray(path.points)||path.points.length<2)continue;
  for(let i=1;i<path.points.length;i++){
   const from=path.points[i-1],to=path.points[i],length=distance(from,to);
   if(!Number.isFinite(length)||length<.001||length>2000)continue;
   const steps=Math.ceil(length/2);let prev=node(path,from.x,from.z);
   for(let k=1;k<=steps;k++){
    if(truncated)break;
    const t=k/steps,id=node(path,from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t);
    if(prev>=0&&id>=0&&safeEdge(prev,id,path.supportId??null))edge(prev,id);
    prev=id;
   }
   if(truncated)break;
  }
  if(truncated)break;
 }
 // Join T junctions and bridge landings only when the physical surfaces agree.
 const jc=new Map<string,number[]>(),J=1.5,jkey=(x:number,z:number)=>Math.floor(x/J)+':'+Math.floor(z/J);
 for(let id=0;id<nodes.length;id++){
  const a=nodes[id],cx=Math.floor(a.p.x/J),cz=Math.floor(a.p.z/J);
  for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const otherId of jc.get(x+':'+z)??[]){
   const b=nodes[otherId];
   if(distance(a.p,b.p)>1.45||Math.abs(a.p.y!-b.p.y!)>.22)continue;
   if(a.supportId&&b.supportId&&a.supportId!==b.supportId)continue;
   // A landing must actually be accessible from the adjacent ground.
   const grounded=!a.supportId?a:b.supportId?null:b;
   if(grounded&&!walk(grounded.p.x,grounded.p.z,grounded.p.x,grounded.p.z))continue;
   if(!a.supportId&&!b.supportId&&!walkSegment(a.p,b.p,walk))continue;
   edge(id,otherId);
  }
  const key=jkey(a.p.x,a.p.z),bucket=jc.get(key)??[];bucket.push(id);jc.set(key,bucket);
 }
 for(const n of nodes)n.links.sort((a,b)=>a.to-b.to);
 function nearest(p:ResidentPoint):number{
  const y=surface.groundHeight(p.x,p.z);
  if(!Number.isFinite(y))return -1;
  const candidates:{id:number;d:number}[]=[],cx=Math.floor(p.x/CELL),cz=Math.floor(p.z/CELL);
  for(let x=cx-3;x<=cx+3;x++)for(let z=cz-3;z<=cz+3;z++)
   for(const id of cells.get(x+':'+z)??[]){
    const n=nodes[id],d=distance(p,n.p);
    // A connector is a short entrance/exit segment, not an off-path shortcut.
    if(d<=8&&Math.abs(n.p.y!-y)<.3)candidates.push({id,d});
   }
  candidates.sort((a,b)=>a.d-b.d||a.id-b.id);
  return candidates.slice(0,16).find(c=>walkSegment(p,nodes[c.id].p,walk))?.id??-1;
 }
 function search(start:number,goal:number):number[]|null{
  const g=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1);
  const heap:{id:number;f:number}[]=[];
  function push(id:number,f:number){let i=heap.length;heap.push({id,f});while(i>0){const j=(i-1)>>1;if(heap[j].f<=f)break;heap[i]=heap[j];i=j;}heap[i]={id,f};}
  function pop(){const top=heap[0],last=heap.pop();if(!heap.length)return top;if(last){let i=0;while(true){let k=i*2+1;if(k>=heap.length)break;if(k+1<heap.length&&heap[k+1].f<heap[k].f)k++;if(last.f<=heap[k].f)break;heap[i]=heap[k];i=k;}heap[i]=last;}return top;}
  g[start]=0;push(start,distance(nodes[start].p,nodes[goal].p));
  let expanded=0;
  while(heap.length&&expanded++<5000){
   const hit=pop();if(!hit)break;
   const id=hit.id;
   if(hit.f>g[id]+distance(nodes[id].p,nodes[goal].p)+.0001)continue;
   if(id===goal){const ids:number[]=[];let cursor=id;while(cursor>=0&&ids.length<=4090){ids.push(cursor);cursor=previous[cursor];}return ids.reverse();}
   for(const e of nodes[id].links){const next=g[id]+e.cost;if(next+1e-6>=g[e.to])continue;g[e.to]=next;previous[e.to]=id;push(e.to,next+distance(nodes[e.to].p,nodes[goal].p));}
  }return null;
 }
 return {nodes:nodes.length,get truncated(){return truncated;},route(from,to):ResidentRoute|null{
  if(distance(from,to)<.05)return residentRoute([from,to]);
  if(distance(from,to)<24&&walkSegment(from,to,walk))return residentRoute([from,to]);
  const a=nearest(from),b=nearest(to);if(a<0||b<0)return null;
  const ids=search(a,b);if(!ids)return null;
  const first={...from,y:surface.groundHeight(from.x,from.z)},last={...to,y:surface.groundHeight(to.x,to.z)};
  if(!walkSegment(from,nodes[a].p,walk)||!walkSegment(nodes[b].p,to,walk))return null;
  const route=residentRoute([first,...ids.map(id=>nodes[id].p),last]);
  return route.length<=1200?route:null;
 }};
}
