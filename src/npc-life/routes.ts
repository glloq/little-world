import {residentRoute,type ResidentPoint,type ResidentRoute} from './schedule.ts';
/** A bounded, shared graph of authored pedestrian paths. No full-island navmesh or per-frame A*. */
export interface ResidentPath {points:readonly ResidentPoint[];supportId?:string;}
export interface ResidentRouter {
  route(from:ResidentPoint,to:ResidentPoint):ResidentRoute|null;
  readonly nodes:number;readonly truncated:boolean;
}
export type ResidentWalkable=(x:number,z:number,fromX:number,fromZ:number)=>boolean;
interface Node {point:ResidentPoint;links:{to:number;distance:number}[];}
const dist=(a:ResidentPoint,b:ResidentPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const key=(p:ResidentPoint)=>Math.round(p.x*10)+':'+Math.round(p.z*10);
function safeSegment(a:ResidentPoint,b:ResidentPoint,walk:ResidentWalkable):boolean{
  const distance=dist(a,b),steps=Math.max(1,Math.ceil(distance/1.5));
  if(steps>120)return false;
  let x=a.x,z=a.z;
  for(let i=1;i<=steps;i++){
    const t=i/steps,nx=a.x+(b.x-a.x)*t,nz=a.z+(b.z-a.z)*t;
    if(!walk(nx,nz,x,z))return false;
    x=nx;z=nz;
  }
  return true;
}
/** Only explicit roads are connected; their joint endpoints have the same quantized key.
 * Crossings at different elevations are never connected just because lines overlap in X/Z.
 */
export function createResidentRouter(paths:readonly ResidentPath[],walk:ResidentWalkable,maxNodes=16000):ResidentRouter{
  const nodes:Node[]=[],index=new Map<string,number>();
  let truncated=false;
  function node(p:ResidentPoint):number{
    const k=key(p),known=index.get(k);if(known!==undefined)return known;
    if(nodes.length>=maxNodes){truncated=true;return -1;}
    const id=nodes.length;index.set(k,id);nodes.push({point:{x:p.x,z:p.z},links:[]});return id;
  }
  function edge(a:number,b:number){
    if(a<0||b<0||a===b)return;
    const distance=dist(nodes[a].point,nodes[b].point);
    if(distance<.0001)return;
    if(!nodes[a].links.some(e=>e.to===b))nodes[a].links.push({to:b,distance});
    if(!nodes[b].links.some(e=>e.to===a))nodes[b].links.push({to:a,distance});
  }
  for(const path of paths){
    if(!Array.isArray(path.points)||path.points.length<2)continue;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],length=dist(a,b);
      if(!Number.isFinite(length)||length>2000||!length)continue;
      const steps=Math.max(1,Math.ceil(length/8));let prev=node(a);
      for(let j=1;j<=steps;j++){
        if(truncated)break;
        const t=j/steps,next=node({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
        edge(prev,next);prev=next;
      }
      if(truncated)break;
    }
    if(truncated)break;
  }
  for(const n of nodes)n.links.sort((a,b)=>a.to-b.to);
  // Small binary heap, only used when an NPC is assigned a new home/work route.
  function search(start:number,goal:number):number[]|null{
    const best=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1);
    const heap:{id:number;score:number}[]=[];
    function push(id:number,score:number){let i=heap.length;heap.push({id,score});while(i>0){const p=(i-1)>>1;if(heap[p].score<=score)break;heap[i]=heap[p];i=p;}heap[i]={id,score};}
    function pop(){const head=heap[0],last=heap.pop();if(!heap.length)return head;
      if(last){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;if(last.score<=heap[c].score)break;heap[i]=heap[c];i=c;}heap[i]=last;}return head;}
    best[start]=0;push(start,dist(nodes[start].point,nodes[goal].point));
    let expanded=0;
    while(heap.length&&expanded++<5000){
      const candidate=pop();if(!candidate)break;
      const id=candidate.id;
      if(candidate.score>best[id]+dist(nodes[id].point,nodes[goal].point)+.00001)continue;
      if(id===goal){const output:number[]=[];let cursor=id;
        while(cursor>=0&&output.length<=5000){output.push(cursor);cursor=previous[cursor];}
        return output.reverse();}
      for(const link of nodes[id].links){const d=best[id]+link.distance;if(d+1e-6>=best[link.to])continue;
        best[link.to]=d;previous[link.to]=id;push(link.to,d+dist(nodes[link.to].point,nodes[goal].point));}
    }
    return null;
  }
  function nearest(p:ResidentPoint):number{
    const matches=nodes.map((n,id)=>({id,d:dist(n.point,p)})).filter(x=>x.d<=65).sort((a,b)=>a.d-b.d||a.id-b.id).slice(0,16);
    for(const c of matches)if(safeSegment(p,nodes[c.id].point,walk))return c.id;
    return -1;
  }
  return {
    nodes:nodes.length,get truncated(){return truncated;},
    route(from,to){
      if(dist(from,to)<.05)return residentRoute([from,to]);
      if(dist(from,to)<24&&safeSegment(from,to,walk))return residentRoute([from,to]);
      const a=nearest(from),b=nearest(to);
      if(a<0||b<0)return null;
      const ids=search(a,b);if(!ids)return null;
      const pts=[from,...ids.map(id=>nodes[id].point),to];
      // Validate the final complete route, including connector approaches, against the
      // current local walkability model. No artificial shortcut through a house/water.
      for(let i=1;i<pts.length;i++)if(!safeSegment(pts[i-1],pts[i],walk))return null;
      const route=residentRoute(pts);
      return route.length<=1200?route:null;
    },
  };
}
