/** Lake proposals from closed D8 basins. A conservative local basin test:
 * water can be suggested only if every sampled rim is higher than its centre.
 * This is NOT automatic pit filling or flood modelling; the author must preview
 * and explicitly accept. Results use native WaterBody V3 and WATER checks. */
import type {WaterBody} from '../world-data.ts';
import type {WatershedBasin} from './watershed-analysis.ts';
import {compileWaterNetwork} from '../water/profile.ts';
export interface BasinLakeProposal {basin:WatershedBasin;water:WaterBody;rimMinM:number}
export interface BasinLakeReview {proposals:BasinLakeProposal[];rejected:{outlet:{x:number;z:number};reason:string}[]}
const dist=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
/** Up to four shallow, entirely bounded candidate lakes; no terrain carving. */
export function proposeBasinLakes(
 basins:readonly WatershedBasin[],
 ctx:{height(x:number,z:number):number;bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
   existing:readonly WaterBody[];seaLevel:number},
 options:{maxLakes?:number;idPrefix?:string}={}
):BasinLakeReview{
 const proposals:BasinLakeProposal[]=[],rejected:BasinLakeReview['rejected']=[];
 const max=Math.min(4,Math.max(1,Math.floor(options.maxLakes??3)));
 for(const [index,basin] of basins.entries()){
  if(proposals.length>=max)break;
  if(basin.kind!=='pit')continue;
  const center=basin.outlet,radius=Math.min(35,Math.max(8,Math.sqrt(Math.max(basin.areaM2,1)/Math.PI)*.18));
  const points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return {x:center.x+radius*Math.cos(a),z:center.z+radius*Math.sin(a)};});
  const b=ctx.bounds;
  if(points.some(p=>p.x<=b.minX+1||p.x>=b.maxX-1||p.z<=b.minZ+1||p.z>=b.maxZ-1)){
   rejected.push({outlet:center,reason:'Cuvette trop proche de la limite du monde'});continue;
  }
  if([...ctx.existing,...proposals.map(p=>p.water)].some(w=>w.points.some(p=>dist(p,center)<radius*2))){
   rejected.push({outlet:center,reason:'Plan d’eau déjà proche'});continue;
  }
  const middle=ctx.height(center.x,center.z),rim=Math.min(...points.map(p=>ctx.height(p.x,p.z)));
  if(!Number.isFinite(middle)||!Number.isFinite(rim)||rim<middle+1.5){
   rejected.push({outlet:center,reason:'Berge trop basse ou cuvette non confirmée sur le relief précis'});continue;
  }
  const level=Math.round(Math.min(100,rim-.6)*10)/10;
  if(level< -20||level<=middle+.5){
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
