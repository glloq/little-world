/**
 * Dendritic river network (doc 108 §8): small streams that join into larger rivers, generated from
 * the real relief, deterministic and authoring-only (no runtime cost). Output = ordinary WATER
 * sources (`WaterBody`): every stream is validated by the shared compiler like a hand-drawn river.
 *
 * Method (standard hydrology on a coarse grid, bounded):
 * 1. priority-flood depression filling (every land cell drains to the sea or the map border),
 *    with a tiny deterministic jitter so that planar slopes do not produce ruler-straight D8 lines;
 * 2. D8 steepest descent on the filled relief, upstream drainage area by accumulation;
 * 3. channels = cells draining more than `minAreaM2`; streams split at confluences by Hack's rule
 *    (the main stem continues along the larger upstream area, the others become tributaries);
 * 4. width from hydraulic geometry (w ∝ √area), depth from width; Chaikin smoothing; tributaries end
 *    exactly on their parent (`to:{kind:'river'}`), main stems in the sea (`to:{kind:'sea'}`) or in an
 *    existing river/lake they reach.
 */
import type {WaterBody,WaterLink} from '../world-data.ts';
import {compileWaterNetwork,polygonSignedDistance,WATER_ALTITUDE} from '../water/profile.ts';
import {valueNoise} from '../geography/noise.ts';

export interface RiverNetworkContext {
 height(x:number,z:number):number;
 seaLevel:number;
 bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
 /** Cells where no channel may run (settlements, fields, existing works). */
 avoid?(x:number,z:number):boolean;
 /** Existing water: streams reaching it end there and are linked to it. */
 existing?:WaterBody[];
 /** Places a lake must never flood (roads, fields, buildings…); defaults to `avoid`. */
 keepDry?(x:number,z:number):boolean;
}
export interface RiverNetworkOptions {
 idPrefix:string;
 /** Routing grid step (m). */cellM?:number;
 /** Drainage area that starts a channel (m²). */minAreaM2?:number;
 /** Maximum number of streams kept (largest drainage first). */maxStreams?:number;
 /** Streams shorter than this are dropped (m). */minLengthM?:number;
 maxWidthM?:number;seed?:number;
 /** false: skip the compiler validation (diagnostics/tests). */validate?:boolean;
 /** Closed basins turned into lakes (largest first). */maxLakes?:number;
}
export interface PlannedStream {id:string;parent?:string;areaM2:number;lengthM:number;order:number;width:number;to?:WaterLink;from?:WaterLink}
export interface RiverNetworkResult {waters:WaterBody[];streams:PlannedStream[];lakes:string[];diagnostics:string[];grid:{cols:number;rows:number;cellM:number}}

/** Hydraulic geometry (stylised): width (m) from the drainage area. */
export function streamWidth(areaM2:number,maxWidthM=12):number{
 return Math.round(Math.min(maxWidthM,Math.max(1.4,1.2+2.6*Math.sqrt(areaM2/1e6)))*10)/10;
}
/** Rays of a lake outline (≤ 100 WATER points). */
const RAYS=64;
const D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const;

/** Binary min-heap on (key, tie). */
class Heap {
 private k:number[]=[];private v:number[]=[];
 get size(){return this.v.length;}
 push(key:number,value:number){const k=this.k,v=this.v;let i=v.length;k.push(key);v.push(value);
  while(i>0){const p=(i-1)>>1;if(k[p]<k[i]||k[p]===k[i]&&v[p]<=v[i])break;[k[p],k[i]]=[k[i],k[p]];[v[p],v[i]]=[v[i],v[p]];i=p;}}
 pop():number{const k=this.k,v=this.v,top=v[0],lk=k.pop()!,lv=v.pop()!;if(v.length){k[0]=lk;v[0]=lv;let i=0;
  for(;;){const l=2*i+1,r=l+1;let m=i;if(l<v.length&&(k[l]<k[m]||k[l]===k[m]&&v[l]<v[m]))m=l;if(r<v.length&&(k[r]<k[m]||k[r]===k[m]&&v[r]<v[m]))m=r;if(m===i)break;
   [k[m],k[i]]=[k[i],k[m]];[v[m],v[i]]=[v[i],v[m]];i=m;}}return top;}
}

function chaikin(points:{x:number;z:number}[],iterations:number){
 let p=points;
 for(let it=0;it<iterations;it++){if(p.length<3)break;const out=[p[0]];
  for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];
   if(i>0)out.push({x:a.x*.75+b.x*.25,z:a.z*.75+b.z*.25});
   if(i<p.length-2)out.push({x:a.x*.25+b.x*.75,z:a.z*.25+b.z*.75});}
  out.push(p.at(-1)!);p=out;}
 return p;
}
function resample(points:{x:number;z:number}[],maxPoints:number,minSpacing:number){
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
 const total=lengths.at(-1)!,count=Math.max(2,Math.min(maxPoints,Math.round(total/minSpacing)+1)),out:{x:number;z:number}[]=[];
 let j=1;for(let k=0;k<count;k++){const d=total*k/(count-1);while(j<points.length-1&&lengths[j]<d)j++;
  const a=points[j-1],b=points[j],t=(d-lengths[j-1])/Math.max(1e-9,lengths[j]-lengths[j-1]);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
 return {points:out,length:total};
}
function nearestOnPolyline(points:{x:number;z:number}[],x:number,z:number){
 let best={x:points[0].x,z:points[0].z,d:Infinity};
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  const q={x:a.x+dx*t,z:a.z+dz*t},d=Math.hypot(q.x-x,q.z-z);if(d<best.d)best={...q,d};}
 return best;
}
const round=(v:number)=>Math.round(v*100)/100;
/** Gentle meanders (λ ≈ 14 widths, amplitude ≈ 1.2 widths) that never climb a bank: a point is
 * moved sideways only where the ground there is not higher than on the original trace. */
function meander(points:{x:number;z:number}[],width:number,seed:number,height:(x:number,z:number)=>number){
 const lambda=Math.min(140,Math.max(40,width*14)),amp=Math.min(8,Math.max(2,width*1.2)),phase=(seed%997)/997*Math.PI*2;
 const base=points.map(p=>({...p}));let d=0;
 for(let i=2;i<base.length-2;i++){
  d+=Math.hypot(base[i].x-base[i-1].x,base[i].z-base[i-1].z);
  const a=base[i-1],b=base[i+1],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
  const off=amp*Math.sin(Math.PI*2*d/lambda+phase)*(.7+.3*valueNoise(seed,d/lambda,0));
  const g0=height(base[i].x,base[i].z);
  for(const k of [1,.5]){const x=base[i].x+nx*off*k,z=base[i].z+nz*off*k;if(height(x,z)<=g0+.25){points[i]={x,z};break;}}
 }
}

export function planRiverNetwork(ctx:RiverNetworkContext,options:RiverNetworkOptions):RiverNetworkResult{
 const cellM=Math.max(8,options.cellM??24),minArea=Math.max(cellM*cellM*4,options.minAreaM2??150000);
 const maxStreams=Math.max(1,Math.min(90,options.maxStreams??24)),minLength=options.minLengthM??120,maxWidth=options.maxWidthM??12,seed=options.seed??1;
 const {minX,maxX,minZ,maxZ}=ctx.bounds,cols=Math.max(3,Math.ceil((maxX-minX)/cellM)),rows=Math.max(3,Math.ceil((maxZ-minZ)/cellM)),n=cols*rows;
 if(n>400000)throw Error('Réseau hydrographique : grille trop fine pour cette carte');
 const diagnostics:string[]=[],existing=ctx.existing??[];
 const cx=(i:number)=>minX+((i%cols)+.5)*(maxX-minX)/cols,cz=(i:number)=>minZ+(Math.floor(i/cols)+.5)*(maxZ-minZ)/rows;
 // Existing water footprint (rivers: within their half width + 4 m; lakes: inside + 4 m).
 const receiving=(x:number,z:number):WaterLink|null=>{
  for(const w of existing){
   if(w.kind==='lake'){if(polygonSignedDistance(w.points,x,z)>-4)return {kind:'lake',id:w.id};continue;}
   if(nearestOnPolyline(w.points,x,z).d<w.width/2+4)return {kind:'river',id:w.id};
  }
  return null;
 };
 const raw=new Float64Array(n),fill=new Float64Array(n),sea=new Uint8Array(n),blocked=new Uint8Array(n),wet=new Array<WaterLink|null>(n).fill(null);
 for(let i=0;i<n;i++){const x=cx(i),z=cz(i),h=ctx.height(x,z);raw[i]=h;sea[i]=h<=ctx.seaLevel?1:0;
  if(!sea[i]){wet[i]=receiving(x,z);if(!wet[i]&&ctx.avoid?.(x,z))blocked[i]=1;}}
 // 1. Priority flood from the sea and the border; jitter only steers routing on flats/planes.
 const heap=new Heap(),done=new Uint8Array(n),eps=1e-3;
 for(let i=0;i<n;i++){const c=i%cols,r=Math.floor(i/cols);if(sea[i]||c===0||r===0||c===cols-1||r===rows-1){fill[i]=raw[i];done[i]=1;heap.push(raw[i],i);}}
 while(heap.size){const i=heap.pop(),c=i%cols,r=Math.floor(i/cols);
  for(const [dx,dz]of D8){const cc=c+dx,rr=r+dz;if(cc<0||rr<0||cc>=cols||rr>=rows)continue;const j=rr*cols+cc;if(done[j])continue;
   const jitter=(valueNoise(seed,cx(j)/90,cz(j)/90)-.5)*.6;fill[j]=Math.max(raw[j]+jitter,fill[i]+eps);done[j]=1;heap.push(fill[j],j);}}
 // 2. D8 steepest descent on the filled relief; accumulation from the top down.
 const down=new Int32Array(n).fill(-1);
 for(let i=0;i<n;i++){if(sea[i])continue;const c=i%cols,r=Math.floor(i/cols);let best=-1,slope=0;
  for(const [dx,dz]of D8){const cc=c+dx,rr=r+dz;if(cc<0||rr<0||cc>=cols||rr>=rows)continue;const j=rr*cols+cc,s=(fill[i]-fill[j])/Math.hypot(dx,dz);if(s>slope){slope=s;best=j;}}
  down[i]=best;}
 // 2b. Closed basins deeper than 1.5 m hold a lake at their spill level (real drainage does that):
 //     streams end in it, its outflow leaves from the spill point (`from:{kind:'lake'}`).
 const lakes:WaterBody[]=[],lakeOutflow=new Map<number,WaterBody>(),lakeSpill=new Map<string,number>();
 {
  const seen=new Uint8Array(n),comps:{cells:number[];deep:number}[]=[],N4=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let i=0;i<n;i++){if(seen[i]||sea[i]||wet[i]||fill[i]-raw[i]<.8)continue;
   const cells:number[]=[],stack=[i];seen[i]=1;let deep=0,bad=false;
   while(stack.length){const k=stack.pop()!,c=k%cols,row=Math.floor(k/cols);cells.push(k);deep=Math.max(deep,fill[k]-raw[k]);
    if(blocked[k]||c===0||row===0||c===cols-1||row===rows-1)bad=true;
    for(const [dx,dz]of N4){const cc=c+dx,rr=row+dz;if(cc<0||rr<0||cc>=cols||rr>=rows)continue;const j=rr*cols+cc;
     if(!seen[j]&&!sea[j]&&!wet[j]&&fill[j]-raw[j]>=.8){seen[j]=1;stack.push(j);}}}
   if(deep>=1.5&&cells.length>=2&&!bad)comps.push({cells,deep});}
  comps.sort((a,b)=>b.cells.length*b.deep-a.cells.length*a.deep||a.cells[0]-b.cells[0]);
  const cellAreaM=((maxX-minX)/cols)*((maxZ-minZ)/rows);
  for(const comp of comps){
   if(lakes.length>=(options.maxLakes??10))break;
   const dry=ctx.keepDry??ctx.avoid;if(dry&&comp.cells.some(k=>dry(cx(k),cz(k))))continue;
   // Centre: the component centroid when it is under water (star-shaped outline), else its deepest cell.
   const gx=comp.cells.reduce((t,k)=>t+cx(k),0)/comp.cells.length,gz=comp.cells.reduce((t,k)=>t+cz(k),0)/comp.cells.length;
   const bottom=comp.cells.reduce((m,k)=>raw[k]<raw[m]?k:m,comp.cells[0]);
   const spill=Math.min(...comp.cells.map(k=>fill[k])),maxR=Math.sqrt(comp.cells.length*cellAreaM/Math.PI)*2.5+cellM;
   let outline:{x:number;z:number}[]|null=null,level=0;
   for(let attempt=0;attempt<3&&!outline;attempt++){
    level=Math.round((spill-.4-attempt*.6)*10)/10;
    const center=ctx.height(gx,gz)<level-.6?{x:gx,z:gz}:{x:cx(bottom),z:cz(bottom)};if(ctx.height(center.x,center.z)>level-.6)break;
    const pts:{x:number;z:number}[]=[];let ok=true;
    for(let a=0;a<RAYS&&ok;a++){const ang=a/RAYS*Math.PI*2,ux=Math.cos(ang),uz=Math.sin(ang);let lo=0,hi=-1;
     for(let rad=cellM/4;rad<=maxR;rad+=cellM/4){if(ctx.height(center.x+ux*rad,center.z+uz*rad)>=level+.3){hi=rad;break;}lo=rad;}
     if(hi<0){ok=false;break;}
     for(let k=0;k<5;k++){const mid=(lo+hi)/2;if(ctx.height(center.x+ux*mid,center.z+uz*mid)>=level+.3)hi=mid;else lo=mid;}
     const q={x:round(center.x+ux*(hi+.5)),z:round(center.z+uz*(hi+.5))};
     if(q.x<=minX+1||q.x>=maxX-1||q.z<=minZ+1||q.z>=maxZ-1||dry?.(q.x,q.z)||receiving(q.x,q.z))ok=false;pts.push(q);}
    // Polygon edges must stay above the surface too (no leak between two rays).
    for(let k=0;ok&&k<pts.length;k++){const p=pts[k],q=pts[(k+1)%pts.length];for(let t=1;t<4;t++){const x=p.x+(q.x-p.x)*t/4,z=p.z+(q.z-p.z)*t/4;if(ctx.height(x,z)<level-1.2||dry?.(x,z)){ok=false;break;}}}
    if(ok)outline=pts;
   }
   if(!outline){diagnostics.push(`Cuvette (${Math.round(gx)}, ${Math.round(gz)}) : rivage introuvable, pas de lac (déborde ${spill.toFixed(1)} m, ${comp.cells.length} cellules).`);continue;}
   const center={x:gx,z:gz};void center;
   const lake:WaterBody={id:`${options.idPrefix}lake-${lakes.length}`,kind:'lake',points:outline,width:4,level,depth:Math.round(Math.min(6,Math.max(1,comp.deep))*10)/10};
   lakes.push(lake);
   const link:WaterLink={kind:'lake',id:lake.id},inLake=(k:number)=>polygonSignedDistance(outline!,cx(k),cz(k))>-cellM*.5;
   for(const k of comp.cells)wet[k]=link;
   const c0=Math.max(0,Math.floor((Math.min(...outline.map(p=>p.x))-minX)/((maxX-minX)/cols))-1),c1=Math.min(cols-1,Math.ceil((Math.max(...outline.map(p=>p.x))-minX)/((maxX-minX)/cols))+1);
   const r0=Math.max(0,Math.floor((Math.min(...outline.map(p=>p.z))-minZ)/((maxZ-minZ)/rows))-1),r1=Math.min(rows-1,Math.ceil((Math.max(...outline.map(p=>p.z))-minZ)/((maxZ-minZ)/rows))+1);
   for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const k=r*cols+c;if(!sea[k]&&!wet[k]&&inLake(k))wet[k]=link;}
   // Outflow: where the filled routing leaves the lake (largest drainage).
   let spillCell=-1;for(let k=0;k<n;k++)if(wet[k]===link&&down[k]>=0&&wet[down[k]]!==link&&(spillCell<0||fill[k]<fill[spillCell]))spillCell=k;
   if(spillCell>=0)lakeSpill.set(lake.id,spillCell);
  }
 }
 const order=Array.from({length:n},(_,i)=>i).filter(i=>!sea[i]).sort((a,b)=>fill[b]-fill[a]||a-b);
 const cellArea=((maxX-minX)/cols)*((maxZ-minZ)/rows),area=new Float64Array(n);
 for(const i of order){area[i]+=cellArea;if(down[i]>=0)area[down[i]]+=area[i];}
 // 3. Channels: enough drainage, on land, outside avoided and existing water.
 // Filled flats outside a lake would route ruler-straight lines (D8 on a flat): no channel there.
 const channel=new Uint8Array(n);for(const i of order)if(area[i]>=minArea&&!blocked[i]&&!wet[i]&&fill[i]-raw[i]<.5)channel[i]=1;
 // A lake outflow starts at the first channel cell below its spill (across a short filled margin).
 for(const lake of lakes){let c=down[lakeSpill.get(lake.id)??-1]??-1;
  for(let k=0;k<20&&c>=0&&!channel[c]&&!sea[c]&&!wet[c];k++)c=down[c];
  if(c>=0&&channel[c]&&polygonSignedDistance(lake.points,cx(c),cz(c))>-cellM*6)lakeOutflow.set(c,lake);
  else diagnostics.push(`${lake.id} : sans exutoire (${c<0?'aucun':sea[c]?'mer':wet[c]?'autre eau':channel[c]?'trop loin':'pas de chenal'}, aire ${c>=0?Math.round(area[c]):0} m²).`);}
 /** Where a stream really ends: the sea / a lake / a river reached within a short filled margin. */
 const settle=(tail:number)=>{const path:number[]=[];let c=tail;
  for(let k=0;k<20&&c>=0&&!sea[c]&&!wet[c]&&!channel[c];k++){path.push(c);c=down[c];}
  return c>=0&&(sea[c]||wet[c])?{cell:c,path}:null;};
 const upstream=new Map<number,number[]>();
 for(const i of order)if(channel[i]&&down[i]>=0&&channel[down[i]]){const list=upstream.get(down[i])??[];list.push(i);upstream.set(down[i],list);}
 interface Raw {cells:number[];parent:number;outlet:number;tail:number}
 const raws:Raw[]=[];
 const walk=(outlet:number,parent:number,tail:number)=>{
  // From the outlet up the largest upstream area (Hack's main stem); side branches recurse.
  const stack:[number,number,number][]=[[outlet,parent,tail]];
  while(stack.length){const [start,par,end]=stack.pop()!,index=raws.length,cells=[start];raws.push({cells,parent:par,outlet:start,tail:end});
   let cur=start;for(;;){const ups=(upstream.get(cur)??[]).slice().sort((a,b)=>area[b]-area[a]||a-b);if(!ups.length)break;
    // A lake outflow is the head of its stream: the lake is its main source, side channels join it.
    if(lakeOutflow.has(cur)){for(const side of ups)stack.push([side,index,cur]);break;}
    for(const side of ups.slice(1))stack.push([side,index,cur]);cur=ups[0];cells.push(cur);}
   cells.reverse();}
 };
 const outlets=order.filter(i=>channel[i]&&!(down[i]>=0&&channel[down[i]])).sort((a,b)=>area[b]-area[a]||a-b);
 for(const o of outlets)walk(o,-1,down[o]);
 // 4. Keep the largest streams whose parent is kept and that end somewhere real.
 const kept=new Map<number,PlannedStream&{points:{x:number;z:number}[];headArea:number}>();
 const byArea=raws.map((_r,i)=>i).sort((a,b)=>area[raws[b].outlet]-area[raws[a].outlet]||a-b);
 for(const k of byArea){
  if(kept.size>=maxStreams)break;
  const r=raws[k];if(r.parent>=0&&!kept.has(r.parent))continue;
  let to:WaterLink|undefined;const tail=r.tail;
  if(r.parent>=0)to={kind:'river',id:kept.get(r.parent)!.id};
  let extra:number[]=[];
  if(r.parent<0){const end=tail>=0?settle(tail):null;
   if(end&&sea[end.cell])to={kind:'sea'};else if(end&&wet[end.cell])to=wet[end.cell]!;
   else continue; // ends in a village, on the border or nowhere: not a believable stream
   extra=end.path.slice(1);if(end.cell!==tail)extra.push(end.cell);}
  const headArea=area[r.cells[0]],source=lakeOutflow.get(r.cells[0]);
  if(!source&&r.parent<0&&headArea>minArea*4)continue; // would spring from nowhere at full size
  let pts=[...r.cells,...(tail>=0?[tail]:[]),...extra].map(i=>({x:cx(i),z:cz(i)}));
  // A lake outflow starts on the shore at the spill point.
  if(source)pts.unshift(nearestOnPolyline([...source.points,source.points[0]],pts[0].x,pts[0].z));
  pts=chaikin(pts,3);
  const wiggle=resample(pts,200,8);
  meander(wiggle.points,streamWidth(area[r.outlet],maxWidth),seed*31+k,ctx.height);
  // Smooth the displaced points (no kinks), then ≤ 100 WATER points.
  const sampled=resample(chaikin(wiggle.points,2),100,9);
  if(sampled.length<minLength)continue;
  const width=streamWidth(area[r.outlet],maxWidth);
  kept.set(k,{id:'',...(r.parent>=0?{parent:String(r.parent)}:{}),areaM2:Math.round(area[r.outlet]),lengthM:Math.round(sampled.length),order:1,width,to,...(source?{from:{kind:'lake',id:source.id} as WaterLink}:{}),points:sampled.points,headArea});
 }
 // Stable ids in kept order (largest first) and Strahler order (diagnostic only).
 let index=0;for(const s of kept.values())s.id=`${options.idPrefix}${index++}`;
 for(const [k,s]of kept){if(s.parent!==undefined){const p=kept.get(Number(s.parent))!;s.parent=p.id;s.to={kind:'river',id:p.id};
   // End exactly on the parent's trace (link gap = 0).
   const q=nearestOnPolyline(p.points,s.points.at(-1)!.x,s.points.at(-1)!.z);s.points[s.points.length-1]={x:q.x,z:q.z};}
  void k;}
 const strahler=(id:string):number=>{const kids=[...kept.values()].filter(s=>s.parent===id).map(s=>strahler(s.id));if(!kids.length)return 1;const m=Math.max(...kids);return kids.filter(v=>v===m).length>1?m+1:m;};
 for(const s of kept.values())s.order=strahler(s.id);
 // 5. Validate with the shared compiler; drop failing streams and everything upstream of them.
 const toWater=(s:PlannedStream&{points:{x:number;z:number}[]}):WaterBody=>{const h=height(s.points[0].x,s.points[0].z);
  return {id:s.id,kind:'river',points:s.points.map(p=>({x:round(p.x),z:round(p.z)})),width:s.width,depth:Math.round(Math.min(2.5,.6+.15*s.width)*10)/10,
   level:round(Math.max(WATER_ALTITUDE.min,Math.min(WATER_ALTITUDE.max,h-.35))),profile:{mode:'terrain',offset:-.35},...(s.from?{from:s.from}:{}),...(s.to?{to:s.to}:{})};};
 let streams=[...kept.values()];const height=ctx.height;
 for(let pass=0;pass<(options.validate===false?0:6);pass++){
  const waters=streams.map(toWater),compiled=compileWaterNetwork([...existing,...lakes,...waters],height,ctx.seaLevel).slice(existing.length+lakes.length);
  const bad=new Set(streams.filter((_s,i)=>compiled[i].diagnostics.some(d=>d.severity==='ERROR')).map(s=>s.id));
  if(!bad.size)break;
  for(const s of streams)if(bad.has(s.id))diagnostics.push(`${s.id} : rejeté (${compiled[streams.indexOf(s)].diagnostics.filter(d=>d.severity==='ERROR').map(d=>d.code).join(', ')})`);
  const drop=new Set(bad);let grew=true;while(grew){grew=false;for(const s of streams)if(s.parent&&drop.has(s.parent)&&!drop.has(s.id)){drop.add(s.id);grew=true;}}
  streams=streams.filter(s=>!drop.has(s.id));
 }
 // Lakes nobody feeds or drains are kept only when large (a pond in a closed hollow stays plausible).
 const used=new Set(streams.flatMap(q=>[q.to?.id,q.from?.id]));
 const keptLakes=lakes.filter(l=>used.has(l.id)||l.points.length&&l.depth>=2);
 return {waters:[...keptLakes,...streams.map(toWater)],streams:streams.map(({points:_p,headArea:_h,...s})=>s),lakes:keptLakes.map(l=>l.id),diagnostics,grid:{cols,rows,cellM}};
}
