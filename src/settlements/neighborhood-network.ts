/** Irregular connected quarters with a shared civic center, rather than repeated concentric rings. */
import type {SettlementRecipe} from './schema.ts';import type {GroundRouteContext} from '../paths/terrain-route.ts';import {inspectGroundSegment} from '../paths/terrain-route.ts';import {layoutRandom,layoutDimensions} from './layout.ts';
export function neighborhoodNetwork(r:SettlementRecipe,c:GroundRouteContext,clear:(p:{x:number;z:number}[],w:number)=>boolean){
 const d=layoutDimensions(r),count=d.lanes,paths:{id:string;points:{x:number;z:number}[]}[]=[],phase=r.orientation*Math.PI/180+layoutRandom(r,'network-phase')*Math.PI*2;
 for(let i=0;i<count;i++){const a=phase+(i+.3*(layoutRandom(r,'quarter-angle-'+i)-.5))/count*Math.PI*2,length=d.outer*(.57+.4*layoutRandom(r,'quarter-length-'+i)),end={x:r.center.x+Math.cos(a)*length,z:r.center.z+Math.sin(a)*length};
  for(const bend of [1,-1,.4,-.4,0]){const bow=(12+layoutRandom(r,'quarter-curve-'+i)*14)*bend,points=Array.from({length:20},(_,j)=>{const t=j/19;return {x:r.center.x+(end.x-r.center.x)*t-Math.sin(a)*Math.sin(t*Math.PI)*bow,z:r.center.z+(end.z-r.center.z)*t+Math.cos(a)*Math.sin(t*Math.PI)*bow};});if(points.slice(1).every((b,j)=>inspectGroundSegment(points[j],b,c,{maxSlope:.35,widthM:d.streetWidth}).valid)&&clear(points,d.streetWidth)){paths.push({id:r.id+'-street-'+i,points});break;}}
 }
 return paths;
}
export const networkPattern=(r:SettlementRecipe)=>r.layout?.pattern==='network';
