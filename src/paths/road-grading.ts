/** Road grading (doc 109 §5): where the natural ground does not suit a road — it falls sideways
 * under the surface, or steps along it — a bed is cut and filled with the shared `corridor`
 * earthwork (doc 104 §C4). Only the stretches that need it are graded; the level follows the
 * road's own smoothed profile, so the cut uphill balances the fill downhill. Nothing is graded
 * near water: banks, bridge abutments and river profiles keep their ground.
 * Pure: returns analytic works, the caller stores them. */
import type {EarthworkV1} from '../geography/earthworks.ts';
import type {PathDefinition} from '../world-data.ts';
import {centerline,type Sample} from './path-geometry.ts';

export interface RoadGradingEnv {height(x:number,z:number):number;seaLevel:number;
 /** Water within `marginM` of the point: such ground is left as it is. */nearWater(x:number,z:number,marginM:number):boolean}
export interface RoadGradingOptions {/** Side fall (rise/run across the road) from which a bed is cut. */tilt?:number;/** Bump or dip (m) against the smoothed profile from which it is evened. */bumpM?:number;
 /** Steepest gradient kept along the bed. */maxGrade?:number;shoulderM?:number;/** Largest cut or fill (m) at the road axis; deeper stretches are left natural. */budgetM?:number;maxPointsPerWork?:number}
export interface RoadGrading {works:EarthworkV1[];gradedM:number;maxCutM:number;maxFillM:number}
export const ROAD_GRADING={tilt:.1,bumpM:.25,maxGrade:.3,shoulderM:.6,budgetM:2.5,smoothM:10,spacingM:6,marginM:9,minRunM:9,waterM:5,maxPointsPerWork:20} as const;

/** Grading of one path. Ids are `<prefix><path id>:<n>` so a regeneration replaces only its own works. */
export function planRoadGrading(path:PathDefinition,env:RoadGradingEnv,o:RoadGradingOptions={},prefix='road:'):RoadGrading{
 const none:RoadGrading={works:[],gradedM:0,maxCutM:0,maxFillM:0};
 if(path.supportId||path.kind==='wood'||path.points.length<2)return none;
 const line:Sample[]=centerline(path),n=line.length,half=path.width/2,K=ROAD_GRADING,tiltMin=o.tilt??K.tilt,bump=o.bumpM??K.bumpM,maxGrade=o.maxGrade??K.maxGrade,budget=o.budgetM??K.budgetM;
 if(n<3)return none;
 const h=line.map(s=>env.height(s.x,s.z)),width=path.width+2*(o.shoulderM??K.shoulderM);
 // Smoothed longitudinal profile (moving average over ±smoothM), then the grade is bounded both ways.
 const level=h.map((_,i)=>{let sum=0,count=0;for(let k=i;k>=0&&line[i].d-line[k].d<=K.smoothM;k--){sum+=h[k];count++;}for(let k=i+1;k<n&&line[k].d-line[i].d<=K.smoothM;k++){sum+=h[k];count++;}return sum/count;});
 for(let pass=0;pass<2;pass++){
  for(let i=1;i<n;i++){const d=(line[i].d-line[i-1].d)*maxGrade;level[i]=Math.max(level[i-1]-d,Math.min(level[i-1]+d,level[i]));}
  for(let i=n-2;i>=0;i--){const d=(line[i+1].d-line[i].d)*maxGrade;level[i]=Math.max(level[i+1]-d,Math.min(level[i+1]+d,level[i]));}
 }
 const tilt=line.map((s,i)=>{const a=line[Math.max(0,i-1)],b=line[Math.min(n-1,i+1)],l=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=-(b.z-a.z)/l,nz=(b.x-a.x)/l;return Math.abs(env.height(s.x+nx*half,s.z+nz*half)-env.height(s.x-nx*half,s.z-nz*half))/(path.width||1);});
 const talusOf=(t:number)=>Math.max(2,Math.min(7,1.5+t*half*4));
 // Where a bed is wanted, widened along the road so it starts and ends on sound ground.
 const want=new Uint8Array(n);
 for(let i=0;i<n;i++)if(tilt[i]>tiltMin||Math.abs(h[i]-level[i])>bump)for(let k=0;k<n;k++)if(Math.abs(line[k].d-line[i].d)<=K.marginM)want[k]=1;
 // Never near water, under the sea, or beyond the cut/fill budget.
 for(let i=0;i<n;i++)if(want[i]&&(h[i]<env.seaLevel+.6||Math.abs(h[i]-level[i])>budget||env.nearWater(line[i].x,line[i].z,width/2+talusOf(tilt[i])+K.waterM)))want[i]=0;
 const works:EarthworkV1[]=[],r2=(v:number)=>Math.round(v*100)/100,max=Math.max(4,o.maxPointsPerWork??K.maxPointsPerWork);let gradedM=0,maxCutM=0,maxFillM=0;
 for(let i=0;i<n;i++){
  if(!want[i])continue;let k=i;while(k+1<n&&want[k+1])k++;
  if(line[k].d-line[i].d>=K.minRunM){
   // Points every spacingM along the run, both ends kept; long runs are split into works sharing an end.
   const ids:number[]=[i];for(let m=i+1;m<k;m++)if(line[m].d-line[ids.at(-1)!].d>=K.spacingM&&line[k].d-line[m].d>=K.spacingM/2)ids.push(m);ids.push(k);
   // The bed leaves the natural ground gently: at both ends its level is the ground itself.
   const target=(m:number)=>{const edge=Math.min(line[m].d-line[i].d,line[k].d-line[m].d),t=Math.min(1,edge/K.marginM);return h[m]+(level[m]-h[m])*t*t*(3-2*t);};
   let talus=2;for(let m=i;m<=k;m++){talus=Math.max(talus,talusOf(tilt[m]));const delta=target(m)-h[m];maxFillM=Math.max(maxFillM,delta);maxCutM=Math.max(maxCutM,-delta);}
   for(let s=0;s<ids.length-1;s+=max-1){const part=ids.slice(s,s+max);if(part.length<2)break;
    works.push({id:`${prefix}${path.id}:${works.length}`,kind:'corridor',points:part.map(m=>({x:r2(line[m].x),z:r2(line[m].z)})),levels:part.map(m=>r2(target(m)-env.seaLevel)),widthM:r2(width),talusM:r2(talus)});}
   gradedM+=line[k].d-line[i].d;
  }
  i=k;
 }
 return {works,gradedM:Math.round(gradedM),maxCutM:r2(maxCutM),maxFillM:r2(maxFillM)};
}
