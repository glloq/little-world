/** Pure ski-resort planning: pistes traced at a target grade per difficulty, a groomed
 * longitudinal profile and straight lift lines. Never mutates terrain; callers store the
 * result as authored data (pistes, lift lines, groomed relief features). */
import type {SkiPoint} from './snow-pistes.ts';

export type PisteDifficulty='green'|'blue'|'red'|'black';
export type LiftKind='chairlift'|'gondola'|'draglift';
/** Grades are rise/run. Targets are what the tracer aims for, max is never exceeded.
 * `cross` bounds the RAW side slope: the groomed relief feature then flattens it. */
export const PISTE_GRADES:Record<PisteDifficulty,{target:number;max:number;cross:number}>={
  green:{target:.11,max:.2,cross:.5},
  blue:{target:.19,max:.33,cross:.62},
  red:{target:.28,max:.42,cross:.7},
  black:{target:.4,max:.58,cross:.75},
};
export const PISTE_LABELS:Record<PisteDifficulty,string>={green:'verte',blue:'bleue',red:'rouge',black:'noire'};
export const PISTE_COLORS:Record<PisteDifficulty,number>={green:0x2e9e4f,blue:0x2f6fd0,red:0xd23a32,black:0x1d1f24};
export const LIFT_LABELS:Record<LiftKind,string>={chairlift:'Télésiège',gondola:'Télécabine',draglift:'Téléski'};

export interface ResortEnv {
  bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
  height(x:number,z:number):number;
  /** True when the point cannot host a piste (water, sea, building, road, reserved…). */
  blocked(x:number,z:number):boolean;
}
export interface RouteOptions {
  difficulty:PisteDifficulty;widthM:number;
  /** Finish disc; when absent the run ends at the first point below `stopAltitude`. */
  goal?:{x:number;z:number;radiusM:number};
  stopAltitude:number;
  /** Other pistes: crossing their corridor is expensive (allowed near both ends only). */
  avoid?:readonly (readonly SkiPoint[])[];
  maxLengthM?:number;
}
const dist=(a:SkiPoint,b:SkiPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
export function polylineLength(points:readonly SkiPoint[]){let d=0;for(let i=1;i<points.length;i++)d+=dist(points[i-1],points[i]);return d;}
export function distanceToPolyline(points:readonly SkiPoint[],x:number,z:number){
  let best=Infinity;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
    best=Math.min(best,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
  }
  return points.length===1?dist(points[0],{x,z}):best;
}
/** Sampled relief of the domain (heights, gradient, distance to the nearest obstacle). */
export interface PisteGrid {minX:number;minZ:number;cell:number;nx:number;nz:number;h:Float64Array;gx:Float64Array;gz:Float64Array;clear:Float64Array}
export function buildPisteGrid(env:ResortEnv,box:{minX:number;maxX:number;minZ:number;maxZ:number},cell=8):PisteGrid{
  const minX=Math.max(box.minX,env.bounds.minX+20),minZ=Math.max(box.minZ,env.bounds.minZ+20);
  const nx=Math.floor((Math.min(box.maxX,env.bounds.maxX-20)-minX)/cell)+1,nz=Math.floor((Math.min(box.maxZ,env.bounds.maxZ-20)-minZ)/cell)+1,n=nx*nz;
  const h=new Float64Array(n),gx=new Float64Array(n),gz=new Float64Array(n),clear=new Float64Array(n).fill(1e9);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=minX+i*cell,z=minZ+j*cell,k=j*nx+i;h[k]=env.height(x,z);
    gx[k]=(env.height(x+2,z)-env.height(x-2,z))/4;gz[k]=(env.height(x,z+2)-env.height(x,z-2))/4;
    if(i===0||j===0||i===nx-1||j===nz-1||env.blocked(x,z))clear[k]=0;}
  // Two-pass chamfer distance transform (metres) to the nearest blocked cell.
  const d1=cell,d2=cell*Math.SQRT2;
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const k=j*nx+i;let v=clear[k];
    if(i>0)v=Math.min(v,clear[k-1]+d1);if(j>0){v=Math.min(v,clear[k-nx]+d1);if(i>0)v=Math.min(v,clear[k-nx-1]+d2);if(i<nx-1)v=Math.min(v,clear[k-nx+1]+d2);}clear[k]=v;}
  for(let j=nz-1;j>=0;j--)for(let i=nx-1;i>=0;i--){const k=j*nx+i;let v=clear[k];
    if(i<nx-1)v=Math.min(v,clear[k+1]+d1);if(j<nz-1){v=Math.min(v,clear[k+nx]+d1);if(i<nx-1)v=Math.min(v,clear[k+nx+1]+d2);if(i>0)v=Math.min(v,clear[k+nx-1]+d2);}clear[k]=v;}
  return {minX,minZ,cell,nx,nz,h,gx,gz,clear};
}
/** 16 headings (22.5°), as integer grid steps. */
const DIRS:[number,number][]=[[0,1],[1,2],[1,1],[2,1],[1,0],[2,-1],[1,-1],[1,-2],[0,-1],[-1,-2],[-1,-1],[-2,-1],[-1,0],[-2,1],[-1,1],[-1,2]];
class Heap {
  private keys:number[]=[];private values:number[]=[];
  get size(){return this.keys.length;}
  push(key:number,value:number){const k=this.keys,v=this.values;let i=k.length;k.push(key);v.push(value);
    while(i>0){const p=(i-1)>>1;if(k[p]<=key)break;k[i]=k[p];v[i]=v[p];i=p;}k[i]=key;v[i]=value;}
  pop():[number,number]{const k=this.keys,v=this.values,topK=k[0],topV=v[0],lastK=k.pop()!,lastV=v.pop()!,n=k.length;
    if(n){let i=0;for(;;){let c=2*i+1;if(c>=n)break;if(c+1<n&&k[c+1]<k[c])c++;if(k[c]>=lastK)break;k[i]=k[c];v[i]=v[c];i=c;}k[i]=lastK;v[i]=lastV;}
    return [topK,topV];}
}
/** Least-cost descent on the grid (state = cell + heading). Each step must descend, stay below
 * the difficulty's maximum grade and raw side slope, keep the corridor clear of obstacles and
 * turn at most 45°. Cost favours the target grade, few turns and distance to other pistes. */
export function routePiste(grid:PisteGrid,start:SkiPoint,o:RouteOptions):SkiPoint[]|null{
  const g=PISTE_GRADES[o.difficulty],{nx,nz,cell,h,gx,gz,clear}=grid,n=nx*nz;
  const ci=(p:SkiPoint)=>{const i=Math.round((p.x-grid.minX)/cell),j=Math.round((p.z-grid.minZ)/cell);return i<0||j<0||i>=nx||j>=nz?-1:j*nx+i;};
  const s=ci(start);if(s<0)return null;
  const goalCell=o.goal?ci(o.goal):-1;
  const near=new Float64Array(n).fill(1e9);
  if(o.avoid?.length)for(let k=0;k<n;k++){const x=grid.minX+(k%nx)*cell,z=grid.minZ+Math.floor(k/nx)*cell;
    for(const other of o.avoid)near[k]=Math.min(near[k],distanceToPolyline(other,x,z));}
  const need=o.widthM/2+2,cost=new Float64Array(n*16).fill(Infinity),from=new Int32Array(n*16).fill(-1),heap=new Heap();
  for(let d=0;d<16;d++){cost[s*16+d]=0;heap.push(0,s*16+d);}
  const maxCost=(o.maxLengthM??2600)*6;let done=-1;
  while(heap.size){
    const [c,state]=heap.pop();if(c>cost[state])continue;if(c>maxCost)break;
    const k=state>>4,d=state&15,i=k%nx,j=(k-i)/nx,x=grid.minX+i*cell,z=grid.minZ+j*cell;
    const fromStart=Math.hypot(x-start.x,z-start.z);
    if(k!==s&&(o.goal?Math.hypot(x-o.goal.x,z-o.goal.z)<=o.goal.radiusM:h[k]<=o.stopAltitude)){done=state;break;}
    for(let t=-2;t<=2;t++){
      const nd=(d+t+16)&15,[di,dj]=DIRS[nd],ii=i+di,jj=j+dj;
      if(ii<0||jj<0||ii>=nx||jj>=nz)continue;
      const kk=jj*nx+ii,len=Math.hypot(di,dj)*cell,grade=(h[k]-h[kk])/len;
      // Leaving the summit cap: a short steeper start is tolerated (groomed afterwards).
      if(grade>g.max+(fromStart<45?.15:0)||grade<-.01||clear[kk]<need)continue;
      const px=-dj/Math.hypot(di,dj),pz=di/Math.hypot(di,dj),cross=Math.abs(gx[kk]*px+gz[kk]*pz);
      if(cross>g.cross)continue;
      const xx=grid.minX+ii*cell,zz=grid.minZ+jj*cell;
      const nearEnd=fromStart<50||(goalCell>=0&&Math.hypot(xx-o.goal!.x,zz-o.goal!.z)<o.goal!.radiusM+90);
      if(!nearEnd&&near[kk]<o.widthM+10)continue;
      const crowd=!nearEnd&&near[kk]<o.widthM+30?4:1;
      const dev=(grade-g.target)/g.target,step=len*(1+1.6*dev*dev+(grade<.03?1.5:0)+cross*.8)*crowd+Math.abs(t)*cell*.35;
      const next=kk*16+nd,nc=c+step;
      if(nc<cost[next]){cost[next]=nc;from[next]=state;heap.push(nc,next);}
    }
  }
  if(done<0)return null;
  const cells:SkiPoint[]=[];
  for(let st=done;st>=0;st=from[st]){const k=st>>4;cells.push({x:grid.minX+(k%nx)*cell,z:grid.minZ+Math.floor(k/nx)*cell});}
  cells.reverse();cells[0]={...start};
  const smooth=resample(chaikin(chaikin(chaikin(cells))),7);
  return smooth.length>=12&&smooth.length<=200?smooth:null;
}
export function chaikin(points:readonly SkiPoint[]):SkiPoint[]{
  if(points.length<3)return points.map(p=>({...p}));
  const out:SkiPoint[]=[{...points[0]}];
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];
    out.push({x:a.x*.75+b.x*.25,z:a.z*.75+b.z*.25},{x:a.x*.25+b.x*.75,z:a.z*.25+b.z*.75});}
  out.push({...points[points.length-1]});return out;
}
/** Even spacing along the polyline (first/last points kept). */
export function resample(points:readonly SkiPoint[],spacing:number):SkiPoint[]{
  const total=polylineLength(points);if(total<spacing)return points.map(p=>({...p}));
  const count=Math.max(2,Math.round(total/spacing)+1),out:SkiPoint[]=[];
  let seg=1,acc=0;
  for(let k=0;k<count;k++){
    const target=total*k/(count-1);
    while(seg<points.length-1&&acc+dist(points[seg-1],points[seg])<target){acc+=dist(points[seg-1],points[seg]);seg++;}
    const a=points[seg-1],b=points[seg],d=dist(a,b)||1,t=Math.max(0,Math.min(1,(target-acc)/d));
    out.push({x:Math.round((a.x+(b.x-a.x)*t)*100)/100,z:Math.round((a.z+(b.z-a.z)*t)*100)/100});
  }
  return out;
}
/** Groomed longitudinal profile: moving average of the terrain along the centre line, cut or
 * filled by at most `maxCutM`, then strictly descending (a groomed run never climbs). */
export function groomedProfile(points:readonly SkiPoint[],height:(x:number,z:number)=>number,maxCutM=8):number[]{
  const raw=points.map(p=>height(p.x,p.z)),n=raw.length,win=6;
  const avg=raw.map((_,i)=>{let s=0,c=0;for(let j=Math.max(0,i-win);j<=Math.min(n-1,i+win);j++){s+=raw[j];c++;}return s/c;});
  for(let i=0;i<n;i++)avg[i]=Math.max(raw[i]-maxCutM,Math.min(raw[i]+maxCutM,avg[i]));
  for(let i=1;i<n;i++)avg[i]=Math.min(avg[i],avg[i-1]-.05);
  return avg.map(v=>Math.round(v*100)/100);
}
export interface LiftStation {x:number;y:number;z:number}
/** Cable path of a lift following the terrain: low stations, pylons where spans would come
 * too close to the ground. Draglifts follow the ground (the rider is pulled on the snow). */
export function liftCablePath(kind:LiftKind,line:readonly SkiPoint[],height:(x:number,z:number)=>number):LiftStation[]{
  const top=line[line.length-1],length=polylineLength(line);
  const at=(s:number):SkiPoint=>{let acc=0;for(let i=1;i<line.length;i++){const d=dist(line[i-1],line[i]);if(acc+d>=s||i===line.length-1){const t=d?Math.max(0,Math.min(1,(s-acc)/d)):0;return {x:line[i-1].x+(line[i].x-line[i-1].x)*t,z:line[i-1].z+(line[i].z-line[i-1].z)*t};}acc+=d;}return {...top};};
  if(kind==='draglift'){
    const count=Math.max(2,Math.ceil(length/6)+1);
    return Array.from({length:count},(_,i)=>{const p=at(length*i/(count-1));return {x:p.x,y:height(p.x,p.z)+1.1,z:p.z};});
  }
  const station=1.55,tower=kind==='gondola'?11:9,clearance=kind==='gondola'?4.6:3.8,maxSpan=kind==='gondola'?60:42;
  // Distances along the line of supports; stations + regular pylons.
  const supports=[0,Math.min(10,length/3)];
  const spans=Math.max(1,Math.ceil((length-20)/maxSpan));
  for(let i=1;i<spans;i++)supports.push(10+(length-20)*i/spans);
  supports.push(Math.max(length-10,length*2/3),length);
  const yAt=(s:number)=>{const p=at(s);return height(p.x,p.z)+(s===0||s===length?station:tower);};
  let ys=supports.map(yAt);
  for(let guard=0;guard<40;guard++){
    let worst=0,worstS=-1;
    for(let i=1;i<supports.length;i++){
      const a=supports[i-1],b=supports[i];
      for(let s=a+3;s<b;s+=3){
        const t=(s-a)/(b-a),y=ys[i-1]+(ys[i]-ys[i-1])*t,p=at(s),gap=height(p.x,p.z)+clearance-y;
        // Stations sit low: the first and last 6 m may approach the ground.
        if(s<6||s>length-6)continue;
        if(gap>worst){worst=gap;worstS=s;}
      }
    }
    if(worstS<0)break;
    const index=supports.findIndex(s=>s>worstS);
    supports.splice(index,0,worstS);ys.splice(index,0,yAt(worstS)+Math.min(6,worst*.5));
  }
  return supports.map((s,i)=>{const p=at(s);return {x:p.x,y:ys[i],z:p.z};});
}
