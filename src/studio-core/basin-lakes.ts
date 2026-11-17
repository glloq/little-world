/** Lake proposals from closed D8 basins. A conservative local basin test:
 * water can be suggested only if every sampled rim is higher than its centre.
 * This is NOT automatic pit filling or flood modelling; the author must preview
 * and explicitly accept. Results use native WaterBody V3 and WATER checks. */
import type {WaterBody} from '../world-data.ts';
import type {WatershedBasin} from './watershed-analysis.ts';
import type {DepressionCandidate} from './depression-fill.ts';
import {WATER_ALTITUDE,compileWaterNetwork} from '../water/profile.ts';
export interface BasinLakeProposal {basin:WatershedBasin|DepressionCandidate;water:WaterBody;rimMinM:number}
export interface BasinLakeReview {proposals:BasinLakeProposal[];rejected:{outlet:{x:number;z:number};reason:string}[]}
const dist=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
/** Radial star-shaped lake outline. Every ray searches the actual native terrain for a
 * shoreline above the proposed water level, then checks the polygon edges for leaks.
 * This is intentionally conservative; connected multi-basin lakes need manual authoring. */
function shoreline(center:{x:number;z:number},level:number,areaM2:number,
 height:(x:number,z:number)=>number,bounds:{minX:number;maxX:number;minZ:number;maxZ:number}
):{points:{x:number;z:number}[];rimMin:number}|null{
 const extent=Math.min(120,Math.max(25,Math.sqrt(areaM2/Math.PI)*2.5)),step=Math.max(1.5,Math.min(4,extent/24));
 const count=20,points:{x:number;z:number}[]=[];
 const sample=(angle:number,radius:number)=>({x:center.x+Math.cos(angle)*radius,z:center.z+Math.sin(angle)*radius});
 const inside=(p:{x:number;z:number})=>p.x>bounds.minX+1&&p.x<bounds.maxX-1&&p.z>bounds.minZ+1&&p.z<bounds.maxZ-1;
 if(height(center.x,center.z)>=level-.5)return null;
 let rimMin=Infinity;
 for(let i=0;i<count;i++){
  const a=i*Math.PI*2/count;let last=0,found=-1;
  for(let radius=step;radius<=extent;radius+=step){
   const p=sample(a,radius);if(!inside(p))return null;
   if(height(p.x,p.z)>=level+.7){found=radius;break;}last=radius;
  }
  if(found<0)return null;
  for(let k=0;k<5;k++){const mid=(last+found)/2,p=sample(a,mid);
   if(height(p.x,p.z)>=level+.7)found=mid;else last=mid;}
  const point=sample(a,found+Math.min(.6,step*.2));
  if(!inside(point))return null;
  rimMin=Math.min(rimMin,height(point.x,point.z));points.push(point);
 }
 // The lake is polygonal, so lake-bank segments must also stay above its surface.
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];
  for(let j=1;j<=3;j++){const t=j/4,y=height(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
   if(!Number.isFinite(y)||y<level-.5)return null;
   rimMin=Math.min(rimMin,y);
  }
 }
 return {points,rimMin};
}
/** Up to four shallow, entirely bounded candidate lakes; no terrain carving. */
export function proposeBasinLakes(
 basins:readonly (WatershedBasin|DepressionCandidate)[],
 ctx:{height(x:number,z:number):number;bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
   existing:readonly WaterBody[];seaLevel:number},
 options:{maxLakes?:number;idPrefix?:string}={}
):BasinLakeReview{
 const proposals:BasinLakeProposal[]=[],rejected:BasinLakeReview['rejected']=[];
 const max=Math.min(4,Math.max(1,Math.floor(options.maxLakes??3)));
 for(const [index,basin] of basins.entries()){
  if(proposals.length>=max)break;
  if(basin.kind!=='pit')continue;
  const center=basin.outlet,middle=ctx.height(center.x,center.z);
  let points:{x:number;z:number}[],rim:number,level:number;
  if('spillLevelM' in basin){
   level=Math.round((basin.spillLevelM-.6)*10)/10;
   if(!Number.isFinite(level)||level<WATER_ALTITUDE.min||level>WATER_ALTITUDE.max||level<=middle+.6){
    rejected.push({outlet:center,reason:'Débordement trop faible ou niveau incompatible avec V3'});continue;
   }
   const contour=shoreline(center,level,basin.areaM2,ctx.height,ctx.bounds);
   if(!contour){rejected.push({outlet:center,reason:'Contour naturel non fermé : berges ou déversoir à corriger manuellement'});continue;}
   ({points,rimMin:rim}=contour);
  }else{
   // Compatibility for the original D8-only basin proposals.
   const radius=Math.min(35,Math.max(8,Math.sqrt(Math.max(basin.areaM2,1)/Math.PI)*.18));
   points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return {x:center.x+radius*Math.cos(a),z:center.z+radius*Math.sin(a)};});
   const b=ctx.bounds;
   if(points.some(p=>p.x<=b.minX+1||p.x>=b.maxX-1||p.z<=b.minZ+1||p.z>=b.maxZ-1)){
    rejected.push({outlet:center,reason:'Cuvette trop proche de la limite du monde'});continue;
   }
   rim=Math.min(...points.map(p=>ctx.height(p.x,p.z)));
   level=Math.round((rim-.6)*10)/10;
  }
  if([...ctx.existing,...proposals.map(p=>p.water)].some(w=>w.points.some(p=>dist(p,center)<Math.max(20,Math.sqrt(basin.areaM2/Math.PI)*.3)))){
   rejected.push({outlet:center,reason:'Plan d’eau déjà proche'});continue;
  }
  if(!Number.isFinite(middle)||!Number.isFinite(rim)||rim<middle+1.5){
   rejected.push({outlet:center,reason:'Berge trop basse ou cuvette non confirmée sur le relief précis'});continue;
  }
  if(level<WATER_ALTITUDE.min||level>WATER_ALTITUDE.max||level<=middle+.5){
   rejected.push({outlet:center,reason:'Niveau du lac incompatible avec le relief ou les limites V3'});continue;
  }
  const water:WaterBody={id:(options.idPrefix??'basin-lake-')+index,kind:'lake',points,width:6,
    level,depth:Math.max(.5,Math.min(20,level-middle))};
  const compiled=compileWaterNetwork([...ctx.existing,water],ctx.height,ctx.seaLevel);
  if(compiled.some(w=>w.diagnostics.some(d=>d.severity==='ERROR'))){
   rejected.push({outlet:center,reason:'Réseau d’eau incompatible'});continue;
  }
  proposals.push({basin,water,rimMinM:rim});
 }
 return {proposals,rejected};
}
