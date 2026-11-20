/**
 * Circulation graph (doc 104 §C5): one walkable network for the whole island,
 * built from every native path (village streets, accesses, port approach,
 * terrain-site links, hand-drawn routes). Destinations — port, settlements,
 * shops, activity starts, mines, fields, terrain sites — are attached to it so
 * the generator and the Studio can answer "can the player walk from the port
 * to this activity?" and add the missing links with the native ground router.
 *
 * Pure and derived: the graph is never stored; links are ordinary paths.
 */
import type {ProjectDocument} from './types.ts';
import type {PathDefinition} from '../world-data.ts';
import {settlementFootprint,type PointXZ} from '../settlements/footprint.ts';
import {planGroundRoute,type GroundRouteContext} from '../paths/terrain-route.ts';

export type DestinationKind='port'|'settlement'|'shop'|'race'|'piste'|'lift'|'surf'|'mine'|'farm'|'site'|'dive';
export interface Destination {id:string;kind:DestinationKind;name:string;x:number;z:number;sourceId:string;
 /** Largest distance (m) to the network still considered reachable (open ground, shore, water). */
 attachM:number;footprint?:PointXZ[]}
export interface CirculationEdge {a:number;b:number;lengthM:number;pathId:string}
export interface AttachedDestination extends Destination {node:number|null;gapM:number;component:number|null}
export interface CirculationGraph {nodes:PointXZ[];edges:CirculationEdge[];adjacency:number[][];component:number[];componentCount:number;destinations:AttachedDestination[];hub:AttachedDestination|null}

const SNAP_M=3,CELL=32;
class NodeIndex {
 readonly nodes:PointXZ[]=[];private readonly cells=new Map<string,number[]>();
 private key(x:number,z:number){return Math.floor(x/CELL)+':'+Math.floor(z/CELL);}
 near(x:number,z:number,r:number):number[]{const out:number[]=[];for(let cz=Math.floor((z-r)/CELL);cz<=Math.floor((z+r)/CELL);cz++)for(let cx=Math.floor((x-r)/CELL);cx<=Math.floor((x+r)/CELL);cx++)for(const i of this.cells.get(cx+':'+cz)??[])if(Math.hypot(this.nodes[i].x-x,this.nodes[i].z-z)<=r)out.push(i);return out;}
 nearest(x:number,z:number,r:number):{node:number;d:number}|null{let best:{node:number;d:number}|null=null;for(const i of this.near(x,z,r)){const d=Math.hypot(this.nodes[i].x-x,this.nodes[i].z-z);if(!best||d<best.d)best={node:i,d};}return best;}
 add(x:number,z:number):number{const hit=this.nearest(x,z,SNAP_M);if(hit)return hit.node;const i=this.nodes.length;this.nodes.push({x,z});const k=this.key(x,z);let l=this.cells.get(k);if(!l)this.cells.set(k,l=[]);l.push(i);return i;}
}

const centroid=(pts:readonly PointXZ[])=>({x:pts.reduce((n,q)=>n+q.x,0)/pts.length,z:pts.reduce((n,q)=>n+q.z,0)/pts.length});
/** Every place a player is expected to reach on foot (or by swimming close to the shore). */
export function collectDestinations(p:ProjectDocument):Destination[]{
 const out:Destination[]=[],L=p.libraries;
 for(const c of Object.values(p.chunks))for(const e of Object.values(c.entities)){
  const q=e.components.Transform?.position;if(!q)continue;
  if(e.components.State?.initial.portN1Authored===true)out.push({id:'port:'+e.id,kind:'port',name:e.name,x:q.x,z:q.z,sourceId:e.id,attachM:40});
  else if(typeof e.components.State?.initial.shop==='string')out.push({id:'shop:'+e.id,kind:'shop',name:e.name,x:q.x,z:q.z,sourceId:e.id,attachM:25});
 }
 for(const s of Object.values(L.settlements??{})){const f=settlementFootprint(s);if(f)out.push({id:'settlement:'+s.id,kind:'settlement',name:s.recipe.name,...centroid(f),sourceId:s.id,attachM:30,footprint:f});}
 for(const r of Object.values(L.races??{})){
  const start=r.track?.points[0]??r.gates[0]?.center;if(!start)continue;
  // Surf and ski races start on their own surface (sea, piste): that surface's destination covers access.
  if(r.kind==='surf'||r.kind==='ski')continue;
  out.push({id:'race:'+r.id,kind:'race',name:r.name,x:start.x,z:start.z,sourceId:r.id,attachM:r.kind==='flight'?80:40});
 }
 for(const a of Object.values(L.alpine??{})){
  const base=a.liftPath?.[0]??a.points[a.points.length-1];
  out.push({id:'piste:'+a.id,kind:a.lift?'lift':'piste',name:a.name,x:base.x,z:base.z,sourceId:a.id,attachM:60});
 }
 // Surf breaks are reached from the beach: a path within 200 m of the zone serves it.
 for(const z of Object.values(L.surfZones??{}))out.push({id:'surf:'+z.id,kind:'surf',name:z.id,x:(z.minX+z.maxX)/2,z:(z.minZ+z.maxZ)/2,sourceId:z.id,attachM:200,footprint:[{x:z.minX,z:z.minZ},{x:z.maxX,z:z.minZ},{x:z.maxX,z:z.maxZ},{x:z.minX,z:z.maxZ}]});
 for(const z of Object.values(L.zones??{}))if(z.polygon.length>=3){const kind=z.kind==='mine'?'mine':'farm';out.push({id:kind+':'+z.id,kind,name:z.name,...centroid(z.polygon),sourceId:z.id,attachM:kind==='mine'?30:40,footprint:z.polygon});}
 // Dive sites are reached from a beach (shore entry) or by boat from the port: 250 m of open water at most.
 for(const d of Object.values(L.diveSites??{}))out.push({id:'dive:'+d.id,kind:'dive',name:d.name,x:d.entry.x,z:d.entry.z,sourceId:d.id,attachM:250,footprint:d.polygon});
 for(const plan of Object.values(L.terrainPlans??{}))for(const s of plan.sites)out.push({id:'site:'+s.id,kind:'site',name:s.name,x:s.entry.x,z:s.entry.z,sourceId:s.id,attachM:30});
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}

export function buildCirculationGraph(p:ProjectDocument,paths:readonly PathDefinition[]=Object.values(p.libraries.paths) as PathDefinition[]):CirculationGraph{
 const index=new NodeIndex(),edges:CirculationEdge[]=[],polylines:{pathId:string;nodes:number[]}[]=[];
 for(const path of [...paths].sort((a,b)=>a.id.localeCompare(b.id))){
  const nodes=path.points.map(q=>index.add(q.x,q.z));polylines.push({pathId:path.id,nodes});
  for(let i=1;i<nodes.length;i++)if(nodes[i]!==nodes[i-1])edges.push({a:nodes[i-1],b:nodes[i],lengthM:Math.hypot(index.nodes[nodes[i]].x-index.nodes[nodes[i-1]].x,index.nodes[nodes[i]].z-index.nodes[nodes[i-1]].z),pathId:path.id});
 }
 // T-junctions: a path end lying on another path's segment joins it.
 for(const pl of polylines)for(const end of [pl.nodes[0],pl.nodes[pl.nodes.length-1]]){
  const e=index.nodes[end];if(!e)continue;
  for(const other of polylines){if(other===pl)continue;
   for(let i=1;i<other.nodes.length;i++){const a=index.nodes[other.nodes[i-1]],b=index.nodes[other.nodes[i]],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    if(Math.hypot(a.x+dx*t-e.x,a.z+dz*t-e.z)<=SNAP_M&&end!==other.nodes[i-1]&&end!==other.nodes[i]){
     for(const k of [other.nodes[i-1],other.nodes[i]])edges.push({a:end,b:k,lengthM:Math.hypot(index.nodes[k].x-e.x,index.nodes[k].z-e.z),pathId:other.pathId});
    }}
  }
 }
 // X-crossings between different paths (hand-drawn routes rarely share vertices).
 const segs:{a:number;b:number;pathId:string;k:number}[]=[];polylines.forEach((pl,k)=>{for(let i=1;i<pl.nodes.length;i++)if(pl.nodes[i]!==pl.nodes[i-1])segs.push({a:pl.nodes[i-1],b:pl.nodes[i],pathId:pl.pathId,k});});
 const grid=new Map<string,number[]>();
 segs.forEach((s,i)=>{const A=index.nodes[s.a],B=index.nodes[s.b];for(let cz=Math.floor(Math.min(A.z,B.z)/CELL);cz<=Math.floor(Math.max(A.z,B.z)/CELL);cz++)for(let cx=Math.floor(Math.min(A.x,B.x)/CELL);cx<=Math.floor(Math.max(A.x,B.x)/CELL);cx++){const key=cx+':'+cz;let l=grid.get(key);if(!l)grid.set(key,l=[]);l.push(i);}});
 const seen=new Set<string>();
 for(const list of grid.values())for(let x=0;x<list.length;x++)for(let y=x+1;y<list.length;y++){
  const i=list[x],j=list[y],s=segs[i],t=segs[j];if(s.k===t.k)continue;const key=i<j?i+':'+j:j+':'+i;if(seen.has(key))continue;seen.add(key);
  if(s.a===t.a||s.a===t.b||s.b===t.a||s.b===t.b)continue;
  const p1=index.nodes[s.a],p2=index.nodes[s.b],q1=index.nodes[t.a],q2=index.nodes[t.b],rx=p2.x-p1.x,rz=p2.z-p1.z,sx=q2.x-q1.x,sz=q2.z-q1.z,den=rx*sz-rz*sx;if(Math.abs(den)<1e-9)continue;
  const u=((q1.x-p1.x)*sz-(q1.z-p1.z)*sx)/den,v=((q1.x-p1.x)*rz-(q1.z-p1.z)*rx)/den;if(u<0||u>1||v<0||v>1)continue;
  const n=index.add(p1.x+rx*u,p1.z+rz*u),at=index.nodes[n];
  for(const k of [s.a,s.b,t.a,t.b])if(k!==n)edges.push({a:n,b:k,lengthM:Math.hypot(index.nodes[k].x-at.x,index.nodes[k].z-at.z),pathId:k===s.a||k===s.b?s.pathId:t.pathId});
 }
 const adjacency:number[][]=index.nodes.map(()=>[]);edges.forEach((e,i)=>{adjacency[e.a].push(i);adjacency[e.b].push(i);});
 const component=index.nodes.map(()=>-1);let componentCount=0;
 for(let s=0;s<index.nodes.length;s++){if(component[s]>=0)continue;const stack=[s];component[s]=componentCount;while(stack.length){const n=stack.pop()!;for(const ei of adjacency[n]){const e=edges[ei],m=e.a===n?e.b:e.a;if(component[m]<0){component[m]=componentCount;stack.push(m);}}}componentCount++;}
 const polygonGap=(f:readonly PointXZ[],x:number,z:number)=>{let inside=false,best=Infinity;for(let i=0,j=f.length-1;i<f.length;j=i++){const a=f[j],b=f[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(a.x+dx*t-x,a.z+dz*t-z));if((a.z>z)!==(b.z>z)&&x<a.x+(z-a.z)/(b.z-a.z)*(b.x-a.x))inside=!inside;}return inside?0:best;};
 const destinations=collectDestinations(p).map(d=>{
  let hit:{node:number;d:number}|null;
  if(d.footprint){
   // Distance to the footprint, not its centre: a path reaching the edge of a field or village serves it.
   const r=Math.max(...d.footprint.map(q=>Math.hypot(q.x-d.x,q.z-d.z)))+d.attachM;hit=null;
   for(const n of index.near(d.x,d.z,r)){const gap=polygonGap(d.footprint,index.nodes[n].x,index.nodes[n].z);if(gap<=d.attachM&&(!hit||gap<hit.d))hit={node:n,d:gap};}
  }else hit=index.nearest(d.x,d.z,d.attachM);
  const near=hit??index.nearest(d.x,d.z,4000);
  return {...d,node:hit?hit.node:null,gapM:Math.round((hit?.d??near?.d??Infinity)*10)/10,component:hit?component[hit.node]:null};
 });
 const hub=destinations.find(d=>d.kind==='port'&&d.node!==null)??null;
 return {nodes:index.nodes,edges,adjacency,component,componentCount,destinations,hub};
}

/** Walking distance (m) along the network from one node to all others (Dijkstra). */
export function networkDistances(g:CirculationGraph,from:number):Float64Array{
 const dist=new Float64Array(g.nodes.length).fill(Infinity),done=new Uint8Array(g.nodes.length);dist[from]=0;
 const heap:[number,number][]=[[0,from]];
 const push=(d:number,n:number)=>{heap.push([d,n]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
 const pop=()=>{const top=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;for(;;){const l=i*2+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
 while(heap.length){const [d,n]=pop();if(done[n])continue;done[n]=1;for(const ei of g.adjacency[n]){const e=g.edges[ei],m=e.a===n?e.b:e.a,nd=d+e.lengthM;if(nd<dist[m]){dist[m]=nd;push(nd,m);}}}
 return dist;
}

export interface CirculationReport {hubId:string|null;components:number;reachable:number;destinations:{id:string;kind:DestinationKind;name:string;status:'reachable'|'isolated'|'unlinked';walkM:number|null;gapM:number;x:number;z:number}[]}
/** Reachability of every destination from the hub (port, else the most connected component). */
export function circulationReport(g:CirculationGraph):CirculationReport{
 let hubNode=g.hub?.node??null;
 if(hubNode===null){const counts=new Map<number,number>();for(const d of g.destinations)if(d.component!==null)counts.set(d.component,(counts.get(d.component)??0)+1);const best=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];if(best)hubNode=g.destinations.find(d=>d.component===best[0])!.node;}
 const dist=hubNode===null?null:networkDistances(g,hubNode);
 const destinations=g.destinations.map(d=>{
  const walk=d.node!==null&&dist&&Number.isFinite(dist[d.node])?Math.round(dist[d.node]):null;
  const status:'reachable'|'isolated'|'unlinked'=d.node===null?'unlinked':walk===null?'isolated':'reachable';
  return {id:d.id,kind:d.kind,name:d.name,status,walkM:walk,gapM:d.gapM,x:Math.round(d.x),z:Math.round(d.z)};
 });
 return {hubId:g.hub?.id??null,components:g.componentCount,reachable:destinations.filter(d=>d.status==='reachable').length,destinations};
}

export interface CirculationDiagnostic {severity:'ERROR'|'WARNING';code:string;message:string;id?:string;x?:number;z?:number}
const KIND_LABEL:Record<DestinationKind,string>={port:'Port',settlement:'Village',shop:'Commerce',race:'Course',piste:'Piste',lift:'Remontée',surf:'Spot de surf',mine:'Mine',farm:'Parcelle',site:'Zone utile',dive:'Site de plongée'};
export function auditCirculation(p:ProjectDocument,g=buildCirculationGraph(p)):CirculationDiagnostic[]{
 const report=circulationReport(g),out:CirculationDiagnostic[]=[];
 for(const d of report.destinations){
  if(d.status==='unlinked')out.push({severity:'WARNING',code:'CIRC_UNLINKED',id:d.id,x:d.x,z:d.z,message:`${KIND_LABEL[d.kind]} « ${d.name} » : aucun chemin à moins de ${Math.round(g.destinations.find(x=>x.id===d.id)!.attachM)} m (le plus proche à ${Number.isFinite(d.gapM)?Math.round(d.gapM)+' m':'—'}).`});
  else if(d.status==='isolated')out.push({severity:'WARNING',code:'CIRC_ISOLATED',id:d.id,x:d.x,z:d.z,message:`${KIND_LABEL[d.kind]} « ${d.name} » : réseau de chemins séparé du ${report.hubId?'port':'réseau principal'}.`});
 }
 return out;
}

/**
 * Add the missing walkable links: each isolated or unlinked destination is
 * joined to the hub component by the native ground router (slope ≤ policy,
 * dry ground). Returns the new paths (ids `circulation-link-N`) — the caller
 * commits them. Water-side destinations (surf, dive) are never forced.
 */
export function planCirculationLinks(p:ProjectDocument,c:GroundRouteContext,o:{maxLinks?:number;maxSlope?:number;widthM?:number;maxDistanceM?:number}={}):{paths:PathDefinition[];failed:string[]}{
 const maxLinks=o.maxLinks??12,policy={maxSlope:o.maxSlope??.35,widthM:o.widthM??2.2,maxCells:8192},added:PathDefinition[]=[],failed:string[]=[];
 const existing=new Set(Object.keys(p.libraries.paths));let n=0;const nextId=()=>{while(existing.has('circulation-link-'+n))n++;existing.add('circulation-link-'+n);return 'circulation-link-'+n;};
 for(let round=0;round<maxLinks;round++){
  const g=buildCirculationGraph(p,[...Object.values(p.libraries.paths) as PathDefinition[],...added]),report=circulationReport(g);
  const hubComponent=g.hub?.component??(()=>{const r=report.destinations.find(d=>d.status==='reachable');return r?g.destinations.find(d=>d.id===r.id)!.component:null;})();
  if(hubComponent===null||hubComponent===undefined)break;
  const pending=report.destinations.filter(d=>d.status!=='reachable'&&!failed.includes(d.id));
  if(!pending.length)break;
  // Closest pending destination to the hub network first: short links compose into a tree.
  const hubNodes=g.nodes.map((q,i)=>({q,i})).filter(({i})=>g.component[i]===hubComponent);
  const scored=pending.map(d=>{let best={i:-1,dist:Infinity};for(const {q,i}of hubNodes){const dist=Math.hypot(q.x-d.x,q.z-d.z);if(dist<best.dist)best={i,dist};}return {d,best};}).sort((a,b)=>a.best.dist-b.best.dist||a.d.id.localeCompare(b.d.id));
  const {d,best}=scored[0];
  if(best.i<0||best.dist>(o.maxDistanceM??1800)){failed.push(d.id);continue;}
  // Sources: the destination's own network (closest nodes first) or dry points around it.
  const own=g.destinations.find(x=>x.id===d.id)!,targets=hubNodes.map(({q})=>q);
  // Water destinations (surf breaks, dive sites) are served from the nearest beach: dry points around their footprint.
  const shore=(d.kind==='surf'||d.kind==='dive')&&own.footprint?(()=>{const xs=own.footprint.map(q=>q.x),zs=own.footprint.map(q=>q.z),out:PointXZ[]=[];for(let z=Math.min(...zs)-150;z<=Math.max(...zs)+150;z+=20)for(let x=Math.min(...xs)-150;x<=Math.max(...xs)+150;x+=20)out.push({x,z});return out;})():null;
  const sources:PointXZ[]=shore??(own.component!==null?g.nodes.filter((_,i)=>g.component[i]===own.component):[{x:d.x,z:d.z},...Array.from({length:8},(_,k)=>({x:d.x+Math.cos(k/8*Math.PI*2)*15,z:d.z+Math.sin(k/8*Math.PI*2)*15}))]);
  const dry=sources.filter(q=>!c.wet(q.x,q.z)&&c.height(q.x,q.z)>c.seaLevel+1);
  const zoneGap=(q:PointXZ)=>own.footprint?Math.max(0,Math.min(...own.footprint.map(f=>Math.hypot(f.x-q.x,f.z-q.z)))-0):0;
  const pairs=dry.filter(q=>!shore||zoneGap(q)<=own.attachM*.9).map(q=>{let t=targets[0],dist=Infinity;for(const r of targets){const k=Math.hypot(r.x-q.x,r.z-q.z);if(k<dist){dist=k;t=r;}}return {from:q,to:t,dist};}).sort((a,b)=>a.dist-b.dist).slice(0,3);
  // Mountain destinations (pistes, lifts) accept a steeper trail, like the native mountain paths.
  const policies=d.kind==='piste'||d.kind==='lift'||d.kind==='mine'?[policy,{...policy,maxSlope:Math.max(policy.maxSlope,.45),widthM:1.6}]:[policy];
  let route:{points:PointXZ[]}|null=null,used=policy;
  search:for(const pol of policies)for(const pair of pairs){const r=planGroundRoute(pair.from,pair.to,c,{...pol,maxCells:Math.min(16384,Math.max(pol.maxCells??8192,Math.round(pair.dist*pair.dist/40)))});if(r.points.length>=2){route=r;used=pol;break search;}}
  if(!route){failed.push(d.id);continue;}
  const points=route.points.map(q=>({x:Math.round(q.x*100)/100,z:Math.round(q.z*100)/100}));
  added.push({id:nextId(),points,width:used.widthM,kind:'dirt',smooth:true} as PathDefinition);
 }
 return {paths:added,failed};
}
