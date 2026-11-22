/** Road planner for links between towns, villages and sites: a deterministic, bounded search that
 * - never enters water: streams are crossed only at bridge sites, square to the flow, between two
 *   dry banks of similar height (lakes and the sea are never crossed);
 * - caps the gradient *along* the road, so a steep slope is climbed by traverses and hairpins
 *   instead of the fall line, and pays for turns so legs stay long (no jitter);
 * - returns native path pieces cut at each bridge (no walking surface under water).
 * Pure: no Three.js, nothing stored. Distinct from `planGroundRoute` (short dry accesses), whose
 * output must stay identical for existing worlds. */
import {MinHeap} from '../studio-core/depression-fill.ts';
import type {PointXZ} from '../geography/archipelago.ts';

export interface RoadStream {id:string;points:{x:number;z:number;half:number;level:number}[]}
export interface RoadContext {bounds:{minX:number;maxX:number;minZ:number;maxZ:number};height(x:number,z:number):number;seaLevel:number;
 /** Water or forbidden ground (buildings, fields, race corridors) within `marginM` of the point. */
 blocked(x:number,z:number,marginM:number):boolean;
 /** Water alone at the point (no other forbidden ground): the short hop from a stop to the search grid
  * may cross a field edge, never a brook. Defaults to `blocked(x,z,0)`. */
 wet?(x:number,z:number):boolean;
 /** Rivers that may be bridged. */streams:readonly RoadStream[];
 /** Roads already planned (bridges included as segments): followed at a discount instead of being
  * doubled, so a new road branches off where it really diverges. */
 network?:readonly (readonly PointXZ[])[]}
export interface RoadPolicy {/** Steepest gradient along the road (rise/run). */maxGrade:number;/** Steepest ground across the road. */maxTilt:number;widthM:number;
 stepM?:number;/** Cost of a right-angle turn, in metres. */turnM?:number;/** Cost of one bridge, in metres. */bridgeCostM?:number;maxSpanM?:number;maxBankStepM?:number;maxCells?:number;roundM?:number}
export interface BridgeSite {waterId:string;a:PointXZ;b:PointXZ;spanM:number;axisX:number;axisZ:number;/** Lower bank height: the deck anchors there. */bankY:number;level:number}
export interface PlannedRoad {/** New dry pieces in travel order, cut at each bridge and wherever the road follows the existing network. */pieces:PointXZ[][];bridges:BridgeSite[];lengthM:number;expanded:number;reason?:string}

export const ROAD_POLICIES={
 /** Cart road between towns and villages. */road:{maxGrade:.16,maxTilt:.55,widthM:3},
 /** Footpath to hamlets, camps and landmarks. */trail:{maxGrade:.24,maxTilt:.75,widthM:2},
 /** Last resort on mountain flanks. */steep:{maxGrade:.32,maxTilt:.95,widthM:1.8},
} as const satisfies Record<string,RoadPolicy>;
const STUB_M=5,MIN_DECK_M=5.6;

/** Places where a stream can be bridged: square to the flow, both banks dry and level enough. */
export function bridgeSites(c:RoadContext,p:RoadPolicy,spacingM=10):BridgeSite[]{
 const out:BridgeSite[]=[],maxSpan=p.maxSpanM??16,maxStep=p.maxBankStepM??1;
 // Banks of a small stream sit about level with its water line: dry = outside the water strip, not drowned.
 const dry=(q:PointXZ,level:number)=>!c.blocked(q.x,q.z,0)&&c.height(q.x,q.z)>level-.15;
 for(const s of c.streams){
  let carried=spacingM;
  for(let i=1;i<s.points.length;i++){
   const u=s.points[i-1],v=s.points[i],len=Math.hypot(v.x-u.x,v.z-u.z);if(len<1e-6)continue;
   const tx=(v.x-u.x)/len,tz=(v.z-u.z)/len,nx=-tz,nz=tx;
   for(let d=carried;d<len;d+=spacingM){
    const t=d/len,x=u.x+(v.x-u.x)*t,z=u.z+(v.z-u.z)*t,half=u.half+(v.half-u.half)*t,level=u.level+(v.level-u.level)*t;
    // Falls are not bridged: the water line drops too fast under the deck. A torrent running down
    // a flank is: the deck follows the contour.
    if(Math.abs(v.level-u.level)/len>.5)continue;
    const bank=(side:number)=>{for(let r=half+.6;r<=half+5;r+=.6){const q={x:x+nx*side*r,z:z+nz*side*r};if(dry(q,level))return q;}return null;};
    let a=bank(1),b=bank(-1);if(!a||!b)continue;
    let span=Math.hypot(b.x-a.x,b.z-a.z);
    if(span<MIN_DECK_M){const grow=(MIN_DECK_M-span)/2;a={x:a.x+nx*grow,z:a.z+nz*grow};b={x:b.x-nx*grow,z:b.z-nz*grow};span=MIN_DECK_M;if(!dry(a,level)||!dry(b,level))continue;}
    const ha=c.height(a.x,a.z),hb=c.height(b.x,b.z);
    if(span>maxSpan||Math.abs(ha-hb)>maxStep)continue;
    // Straight approaches on both banks: dry, gentle, clear of any other water.
    const approach=(q:PointXZ,side:number,h0:number)=>{let prev=h0;for(let r=1;r<=STUB_M+2;r++){const w={x:q.x+nx*side*r,z:q.z+nz*side*r},h=c.height(w.x,w.z);if(c.blocked(w.x,w.z,0)||h<level-.15||Math.abs(h-prev)>p.maxGrade*1.6)return false;prev=h;}return true;};
    if(!approach(a,1,ha)||!approach(b,-1,hb))continue;
    out.push({waterId:s.id,a,b,spanM:span,axisX:-nx,axisZ:-nz,bankY:Math.min(ha,hb),level});
   }
   carried=(carried-len)%spacingM;if(carried<0)carried+=spacingM;
  }
 }
 return out;
}

// 24 directions (axes, diagonals, then 2:1 and 3:1 moves), sorted by angle: a road must be able to
// run 72° off the fall line, or a 50 % flank could not be climbed at 16 % at all.
const DIRS:(readonly [number,number])[]=[[1,0],[1,1],[2,1],[3,1]].flatMap(([a,b])=>a===b||!b?[[a,b],[-b,a],[-a,-b],[b,-a]]:[[a,b],[b,a],[-a,b],[-b,a],[a,-b],[b,-a],[-a,-b],[-b,-a]])
 .map(([x,z])=>[x,z] as const).sort((p,q)=>Math.atan2(p[1],p[0])-Math.atan2(q[1],q[0])),D=DIRS.length,SLOTS=D+1;
/** Cells a move passes through (both ends excluded): all must be free and gentle. */
const BETWEEN=DIRS.map(([dx,dz])=>{const out:[number,number][]=[],n=Math.max(Math.abs(dx),Math.abs(dz))*4;
 for(let k=1;k<n;k++)for(const [x,z]of [[Math.floor(dx*k/n+.5),Math.floor(dz*k/n+.5)],[Math.ceil(dx*k/n-.5),Math.ceil(dz*k/n-.5)]])if((x||z)&&(x!==dx||z!==dz)&&!out.some(o=>o[0]===x&&o[1]===z))out.push([x,z]);
 return out;});
const turn=(a:number,b:number)=>{let d=Math.abs(a-b)%(Math.PI*2);if(d>Math.PI)d=Math.PI*2-d;return d;};
interface Grid {minX:number;minZ:number;step:number;cols:number;rows:number;h:Float32Array;gx:Float32Array;gz:Float32Array;open:Uint8Array;road:Uint8Array}
function buildGrid(c:RoadContext,box:RoadContext['bounds'],step:number):Grid{
 const cols=Math.max(2,Math.floor((box.maxX-box.minX)/step)),rows=Math.max(2,Math.floor((box.maxZ-box.minZ)/step)),n=cols*rows,h=new Float32Array(n),gx=new Float32Array(n),gz=new Float32Array(n),open=new Uint8Array(n);
 for(let i=0;i<n;i++){const x=box.minX+(i%cols+.5)*step,z=box.minZ+(Math.floor(i/cols)+.5)*step;h[i]=c.height(x,z);open[i]=h[i]>c.seaLevel+.6&&!c.blocked(x,z,step*.75)?1:0;}
 for(let i=0;i<n;i++){const x=i%cols,z=Math.floor(i/cols),l=x?i-1:i,r=x<cols-1?i+1:i,d=z?i-cols:i,u=z<rows-1?i+cols:i;gx[i]=(h[r]-h[l])/((r-l)*step||1);gz[i]=(h[u]-h[d])/(((u-d)/cols)*step||1);}
 // Existing roads: their cells are always passable (bridges cross water) and cheap to follow.
 const road=new Uint8Array(n);
 for(const line of c.network??[])for(let k=1;k<line.length;k++){const a=line[k-1],b=line[k],m=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/(step*.4)));
  for(let t=0;t<=m;t++){const x=Math.floor((a.x+(b.x-a.x)*t/m-box.minX)/step),z=Math.floor((a.z+(b.z-a.z)*t/m-box.minZ)/step);if(x>=0&&x<cols&&z>=0&&z<rows)road[z*cols+x]=open[z*cols+x]=1;}}
 return {minX:box.minX,minZ:box.minZ,step,cols,rows,h,gx,gz,open,road};
}
const cellPoint=(g:Grid,i:number):PointXZ=>({x:g.minX+(i%g.cols+.5)*g.step,z:g.minZ+(Math.floor(i/g.cols)+.5)*g.step});
/** Closest free cell; with `dryHop`, the straight hop from the point to that cell must not touch water. */
function nearestOpen(g:Grid,q:PointXZ,reach=3,dryHop?:(x:number,z:number)=>boolean):number{
 const cx=Math.floor((q.x-g.minX)/g.step),cz=Math.floor((q.z-g.minZ)/g.step);let best=-1,bd=Infinity;
 for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++){const x=cx+dx,z=cz+dz;if(x<0||x>=g.cols||z<0||z>=g.rows)continue;const i=z*g.cols+x;if(!g.open[i])continue;const t=cellPoint(g,i),d=Math.hypot(t.x-q.x,t.z-q.z);if(d>=bd-1e-9)continue;
  if(dryHop){const n=Math.max(1,Math.ceil(d/1.2));let wet=false;for(let k=0;k<=n&&!wet;k++)wet=dryHop(q.x+(t.x-q.x)*k/n,q.z+(t.z-q.z)*k/n);if(wet)continue;}
  bd=d;best=i;}
 return best;
}
interface BridgeEdge {to:number;site:BridgeSite;forward:boolean;angle:number;dir:number;cost:number}
const REUSE=.6;
type Step={cell:number;/** Reached along an existing road. */reused:boolean;bridge?:{site:BridgeSite;forward:boolean}};

function searchLeg(start:PointXZ,end:PointXZ,g:Grid,sites:readonly BridgeSite[],p:RoadPolicy,c_network:boolean,startDir=D,wet?:(x:number,z:number)=>boolean):{steps:Step[];expanded:number;dir:number}|null{
 const first=nearestOpen(g,start,3,wet),last=nearestOpen(g,end,3,wet);if(first<0||last<0)return null;
 const n=g.cols*g.rows,turnM=p.turnM??12,bridgeCost=p.bridgeCostM??60,angles=DIRS.map(([dx,dz])=>Math.atan2(dz,dx)),lens=DIRS.map(([dx,dz])=>Math.hypot(dx,dz)*g.step);
 // Bridges become edges between the cells behind each approach stub.
 const bridges=new Map<number,BridgeEdge[]>();
 for(const site of sites){
  // The cell behind each approach must be reached from its stub over dry ground: another brook may
  // run just behind the bank (confluences).
  const stubA={x:site.a.x-site.axisX*STUB_M,z:site.a.z-site.axisZ*STUB_M},stubB={x:site.b.x+site.axisX*STUB_M,z:site.b.z+site.axisZ*STUB_M};
  const ca=nearestOpen(g,{x:stubA.x-site.axisX*g.step,z:stubA.z-site.axisZ*g.step},1),cb=nearestOpen(g,{x:stubB.x+site.axisX*g.step,z:stubB.z+site.axisZ*g.step},1);if(ca<0||cb<0||ca===cb)continue;
  const hopWet=(from:PointXZ,cell:number)=>{if(!wet)return false;const t=cellPoint(g,cell),n=Math.max(1,Math.ceil(Math.hypot(t.x-from.x,t.z-from.z)/1.2));for(let k=0;k<=n;k++)if(wet(from.x+(t.x-from.x)*k/n,from.z+(t.z-from.z)*k/n))return true;return false;};
  if(hopWet(stubA,ca)||hopWet(stubB,cb))continue;
  const A=cellPoint(g,ca),B=cellPoint(g,cb),cost=Math.hypot(B.x-A.x,B.z-A.z)+bridgeCost,angle=Math.atan2(site.axisZ,site.axisX);
  const nearestDir=(a:number)=>{let k=0;for(let i=1;i<D;i++)if(turn(angles[i],a)<turn(angles[k],a))k=i;return k;};
  for(const [from,to,forward,ang]of [[ca,cb,true,angle],[cb,ca,false,angle+Math.PI]] as const){const list=bridges.get(from)??[];list.push({to,site,forward,angle:ang,dir:nearestDir(ang),cost});bridges.set(from,list);}
 }
 const cost=new Float64Array(n*SLOTS).fill(Infinity),parent=new Int32Array(n*SLOTS).fill(-1),via=new Map<number,{site:BridgeSite;forward:boolean}>(),closed=new Uint8Array(n*SLOTS),reused=new Uint8Array(n*SLOTS),heap=new MinHeap(),goal=cellPoint(g,last),hScale=c_network?REUSE:1;
 // A via stop is passed through: the next leg starts with the arrival heading (no free U-turn).
 const s0=first*SLOTS+startDir;cost[s0]=0;heap.push({index:s0,level:0});let expanded=0,found=-1;const limit=n*SLOTS;
 while(heap.length&&expanded<limit){
  const s=heap.pop().index;if(closed[s])continue;closed[s]=1;expanded++;
  const i=Math.floor(s/SLOTS),din=s%SLOTS;if(i===last){found=s;break;}
  const x=i%g.cols,z=Math.floor(i/g.cols),inAngle=din<D?angles[din]:null;
  const relax=(j:number,dir:number,angle:number,edge:number,bridge?:{site:BridgeSite;forward:boolean},onRoad=false)=>{
   // An existing road was already shaped: following it costs no turn.
   // A hairpin is allowed (a full U-turn costs 4 × turnM): on an even flank it is the only way up.
   const t=inAngle===null||onRoad||reused[s]?0:turn(inAngle,angle);
   const ns=j*SLOTS+dir,c2=cost[s]+edge+turnM*(t/(Math.PI/2))**2;if(c2>=cost[ns]||closed[ns])return;
   cost[ns]=c2;parent[ns]=s;reused[ns]=onRoad?1:0;if(bridge)via.set(ns,bridge);else via.delete(ns);
   const q=cellPoint(g,j);heap.push({index:ns,level:c2+Math.hypot(q.x-goal.x,q.z-goal.z)*hScale});
  };
  for(let k=0;k<D;k++){
   const [dx,dz]=DIRS[k],xx=x+dx,zz=z+dz;if(xx<0||xx>=g.cols||zz<0||zz>=g.rows)continue;
   const j=zz*g.cols+xx;if(!g.open[j])continue;
   if(g.road[i]&&g.road[j]&&Math.abs(dx)<2&&Math.abs(dz)<2){relax(j,k,angles[k],lens[k]*REUSE,undefined,true);continue;}
   const len=lens[k],ux=dx*g.step/len,uz=dz*g.step/len,grade=Math.abs(g.h[j]-g.h[i])/len;if(grade>p.maxGrade)continue;
   // Local slope along the road at both ends and in every cell passed: free ground, no hidden
   // step inside a gentle average.
   let along=Math.max(Math.abs(g.gx[i]*ux+g.gz[i]*uz),Math.abs(g.gx[j]*ux+g.gz[j]*uz)),tilt=Math.max(Math.abs(g.gz[i]*ux-g.gx[i]*uz),Math.abs(g.gz[j]*ux-g.gx[j]*uz)),free=true;
   for(const [ox,oz]of BETWEEN[k]){const m=(z+oz)*g.cols+x+ox;if(!g.open[m]){free=false;break;}along=Math.max(along,Math.abs(g.gx[m]*ux+g.gz[m]*uz));tilt=Math.max(tilt,Math.abs(g.gz[m]*ux-g.gx[m]*uz));}
   if(!free||along>p.maxGrade*1.5||tilt>p.maxTilt)continue;
   relax(j,k,angles[k],len*(1+1.5*(grade/p.maxGrade)**2+(tilt/p.maxTilt)**2));
  }
  for(const b of bridges.get(i)??[])relax(b.to,b.dir,b.angle,b.cost,{site:b.site,forward:b.forward});
 }
 if(found<0)return null;
 const steps:Step[]=[];for(let s=found;s>=0;s=parent[s])steps.push({cell:Math.floor(s/SLOTS),reused:!!reused[s],bridge:via.get(s)});
 return {steps:steps.reverse(),expanded,dir:found%SLOTS};
}
/** Drop points that barely leave the straight line (the grid staircase), keeping both ends. */
function simplify(pts:PointXZ[],tol:number):PointXZ[]{
 if(pts.length<3)return pts;
 const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const stack:[number,number][]=[[0,pts.length-1]];
 while(stack.length){const [a,b]=stack.pop()!,A=pts[a],B=pts[b],dx=B.x-A.x,dz=B.z-A.z,l=Math.hypot(dx,dz)||1;let worst=0,at=-1;
  for(let i=a+1;i<b;i++){const d=Math.abs((pts[i].x-A.x)*dz-(pts[i].z-A.z)*dx)/l;if(d>worst){worst=d;at=i;}}
  if(at>=0&&worst>tol){keep[at]=1;stack.push([a,at],[at,b]);}}
 return pts.filter((_,i)=>keep[i]);
}
/** Round each corner with a short curve (radius bounded by the adjacent legs): hairpins become bends. */
function roundCorners(pts:PointXZ[],radius:number):PointXZ[]{
 if(pts.length<3)return pts;const out:PointXZ[]=[pts[0]];
 for(let i=1;i<pts.length-1;i++){
  const a=pts[i-1],v=pts[i],b=pts[i+1],la=Math.hypot(a.x-v.x,a.z-v.z),lb=Math.hypot(b.x-v.x,b.z-v.z);
  const bend=turn(Math.atan2(v.z-a.z,v.x-a.x),Math.atan2(b.z-v.z,b.x-v.x)),r=Math.min(radius,la*.45,lb*.45);
  if(bend<.2||r<1){out.push(v);continue;}
  const p0={x:v.x+(a.x-v.x)/la*r,z:v.z+(a.z-v.z)/la*r},p2={x:v.x+(b.x-v.x)/lb*r,z:v.z+(b.z-v.z)/lb*r},n=bend>1.2?4:2;
  for(let k=0;k<=n;k++){const t=k/n,w=1-t;out.push({x:w*w*p0.x+2*w*t*v.x+t*t*p2.x,z:w*w*p0.z+2*w*t*v.z+t*t*p2.z});}
 }
 out.push(pts.at(-1)!);return out;
}
/** Closest point where a road may start or end (dry, clear of water by its width), or null. */
export function nearestRoadPoint(c:RoadContext,q:PointXZ,widthM:number,reachM=60):PointXZ|null{
 const ok=(x:number,z:number)=>x>c.bounds.minX&&x<c.bounds.maxX&&z>c.bounds.minZ&&z<c.bounds.maxZ&&c.height(x,z)>c.seaLevel+.6&&!c.blocked(x,z,widthM);
 if(ok(q.x,q.z))return q;
 for(let r=4;r<=reachM;r+=4)for(let k=0;k<16;k++){const x=q.x+Math.cos(k/16*Math.PI*2)*r,z=q.z+Math.sin(k/16*Math.PI*2)*r;if(ok(x,z))return round2({x,z});}
 return null;
}
const round2=(q:PointXZ):PointXZ=>({x:Math.round(q.x*100)/100,z:Math.round(q.z*100)/100});

/** Plan one road through `stops` (at least two). Fails with a reason rather than inventing a passage. */
const SITE_CACHE=new WeakMap<object,Map<string,BridgeSite[]>>();
/** Bridge sites of a context, computed once per policy (same streams, same terrain). */
function cachedSites(c:RoadContext,p:RoadPolicy):BridgeSite[]{
 let byPolicy=SITE_CACHE.get(c.streams);if(!byPolicy)SITE_CACHE.set(c.streams,byPolicy=new Map());
 const key=[p.maxGrade,p.widthM,p.maxSpanM??'',p.maxBankStepM??''].join(':');let sites=byPolicy.get(key);if(!sites)byPolicy.set(key,sites=bridgeSites(c,p));return sites;
}
export function planRoad(stops:readonly PointXZ[],c:RoadContext,p:RoadPolicy,sites:readonly BridgeSite[]=cachedSites(c,p)):PlannedRoad{
 const fail=(reason:string,expanded=0):PlannedRoad=>({pieces:[],bridges:[],lengthM:0,expanded,reason});
 if(stops.length<2)return fail('Deux points au moins.');
 const xs=stops.map(q=>q.x),zs=stops.map(q=>q.z),reach=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs));
 let expanded=0;
 // Search a corridor around the stops first, then wider: most roads never need the whole island.
 for(const margin of [Math.max(160,reach*.3),Math.max(420,reach*.8)]){
  const box={minX:Math.max(c.bounds.minX,Math.min(...xs)-margin),maxX:Math.min(c.bounds.maxX,Math.max(...xs)+margin),minZ:Math.max(c.bounds.minZ,Math.min(...zs)-margin),maxZ:Math.min(c.bounds.maxZ,Math.max(...zs)+margin)};
  const step=Math.max(p.stepM??6,Math.sqrt((box.maxX-box.minX)*(box.maxZ-box.minZ)/(p.maxCells??60000))),g=buildGrid(c,box,step);
  // Travel order: points with the way they were reached, and bridge breaks between banks.
  type Item={q:PointXZ;reused:boolean;site?:undefined}|{site:BridgeSite;q?:undefined};
  const items:Item[]=[{q:stops[0],reused:false}];let ok=true,heading=D;
  for(let k=1;k<stops.length&&ok;k++){
   const leg=searchLeg(stops[k-1],stops[k],g,sites,p,!!c.network?.length,heading,c.wet??((x,z)=>c.blocked(x,z,0)));if(!leg){ok=false;break;}expanded+=leg.expanded;heading=leg.dir;
   // The first and last cells stand for the stops themselves.
   leg.steps.forEach((s,i)=>{
    if(s.bridge){const {site,forward}=s.bridge,[near,far]=forward?[site.a,site.b]:[site.b,site.a],sx=forward?site.axisX:-site.axisX,sz=forward?site.axisZ:-site.axisZ;
     items.push({q:{x:near.x-sx*STUB_M,z:near.z-sz*STUB_M},reused:false},{q:near,reused:false},{site},{q:far,reused:false},{q:{x:far.x+sx*STUB_M,z:far.z+sz*STUB_M},reused:false});}
    if(i>0&&i<leg.steps.length-1)items.push({q:cellPoint(g,s.cell),reused:s.reused});
   });
   items.push({q:stops[k],reused:leg.steps.at(-1)!.reused});
  }
  if(!ok)continue;
  const snap=(q:PointXZ):PointXZ=>{let best=q,bd=Infinity;for(const line of c.network??[])for(let k=1;k<line.length;k++){const a=line[k-1],b=line[k],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz||1))),x=a.x+dx*t,z=a.z+dz*t,d=Math.hypot(x-q.x,z-q.z);if(d<bd){bd=d;best={x,z};}}return bd<=g.step*2?best:q;};
  type Piece={points:PointXZ[];head:boolean;tail:boolean;/** Left the existing network to get here. */branch:boolean};
  const raw:Piece[]=[],bridges:BridgeSite[]=[],span=(l:PointXZ[])=>l.slice(1).reduce((m,q,i)=>m+Math.hypot(q.x-l[i].x,q.z-l[i].z),0);
  let current:Piece|null={points:[stops[0]],head:false,tail:false,branch:false},previous=stops[0],onNetwork=false;
  // A few metres that leave the network only to rejoin it are grid noise, not a road: dropped.
  const close=(rejoins=false)=>{if(current&&current.points.length>=2&&!(rejoins&&current.branch&&!current.head&&span(current.points)<g.step*5))raw.push(current);current=null;};
  for(const item of items.slice(1)){
   if(item.site){if(current)current.tail=true;close();bridges.push(item.site);current={points:[],head:true,tail:false,branch:false};onNetwork=false;continue;}
   if(item.reused){if(current&&current.points.length>=2)current.points[current.points.length-1]=snap(current.points.at(-1)!);close(true);onNetwork=true;}
   else{if(!current)current={points:[onNetwork?snap(previous):previous],head:false,tail:false,branch:onNetwork};current.points.push(item.q);onNetwork=false;}
   previous=item.q;
  }
  close();
  // Same noise at the journey's end: a stub between two points of the network adds nothing.
  const gap=(q:PointXZ)=>{const s=snap(q);return s===q?(c.network?.some(l=>l.some(v=>v.x===q.x&&v.z===q.z))?0:Infinity):Math.hypot(s.x-q.x,s.z-q.z);};
  for(let k=raw.length-1;k>=0;k--){const piece=raw[k];if(!piece.head&&!piece.tail&&span(piece.points)<g.step*5&&gap(piece.points[0])<1.5&&gap(piece.points.at(-1)!)<1.5)raw.splice(k,1);}
  // A stop standing just beside the network, reached without leaving it: joined by a short spur.
  for(const [stop,first]of [[stops[0],true],[stops.at(-1)!,false]] as const){const d=gap(stop);if(d>.5&&d<Infinity&&!raw.some(piece=>piece.points.some(q=>q===stop)))raw[first?'unshift':'push']({points:first?[stop,snap(stop)]:[snap(stop),stop],head:false,tail:false,branch:true});}
  // Bridge ends and their stubs stay exact: only the open ground in between is simplified and rounded.
  const pieces=raw.map(({points:piece,head,tail})=>{
   const first=head?piece.slice(0,1):[],lastPoint=tail?piece.slice(-1):[],body=piece.slice(head?1:0,tail?piece.length-1:piece.length);
   return roundCorners([...first,...simplify(body,g.step*.45),...lastPoint],p.roundM??9).filter((q,i,l)=>!i||Math.hypot(q.x-l[i-1].x,q.z-l[i-1].z)>.05).map(round2);
  }).filter(l=>l.length>=2);
  const lengthM=pieces.reduce((n,l)=>n+l.slice(1).reduce((m,q,i)=>m+Math.hypot(q.x-l[i].x,q.z-l[i].z),0),0)+bridges.reduce((n,b)=>n+b.spanM,0);
  return {pieces,bridges,lengthM:Math.round(lengthM),expanded};
 }
 return fail('Aucun passage sec respectant la pente : rapprocher les points, assouplir la pente ou prévoir un ouvrage.',expanded);
}
/** Try the gentlest policy first; the caller learns which one was needed. */
export function planRoadTiered(stops:readonly PointXZ[],c:RoadContext,policies:readonly RoadPolicy[]):PlannedRoad&{policy:RoadPolicy|null}{
 let last:PlannedRoad|null=null;
 for(const policy of policies){const r=planRoad(stops,c,policy);if(r.pieces.length)return {...r,policy};last=r;}
 return {...(last??{pieces:[],bridges:[],lengthM:0,expanded:0,reason:'Aucune politique.'}),policy:null};
}
