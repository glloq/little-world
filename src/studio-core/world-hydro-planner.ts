/** Native WATER from the composed drainage corridor; D8 surveys the final terrain.
 * All samples, including between control points, pass through the shared compiler. */
import {compileWaterNetwork,type HydroDiagnostic} from '../water/profile.ts';
import type {WaterBody} from '../world-data.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {proposeComposedTributaries} from './world-tributaries.ts';
import {planTerraceFalls} from './world-terrace-falls.ts';
import {proposeBasinLakes} from './basin-lakes.ts';
import {reviewHydroNetwork,planHydroFalls} from './hydro-network-assistant.ts';
import {analyzeWatersheds} from './watershed-analysis.ts';
import {proposeWatershedRivers} from './watershed-rivers.ts';
import type {MapRequirements} from './map-requirements.ts';
import type {Bounds} from './types.ts';
export function planWorldHydro(r:MapRequirements,axis:PointXZ[],height:(x:number,z:number)=>number,bounds:Bounds,lakeCenter?:PointXZ){
 const waters:WaterBody[]=[],diagnostics:HydroDiagnostic[]=[];
 if(r.rivers){
  const seaIndex=(r.compositionVersion??1)>=2?axis.findIndex(q=>height(q.x,q.z)<-.6):-1;
  const points=seaIndex>0?axis.slice(0,seaIndex+1):axis;
  const river:WaterBody={id:'composition-river-0',kind:'river',points,width:Math.max(4,Math.min(14,Math.min(r.width,r.length)*.004)),depth:2,
   level:height(axis[0].x,axis[0].z)-.35,profile:{mode:'terrain',offset:-.35},to:{kind:'sea'}};
  const c=compileWaterNetwork([river],height,0)[0];
  // Never hide a local climb behind WATER's monotonizing correction.
  if(c.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE'))diagnostics.push(...c.diagnostics);
  else waters.push(river);
 }
 if(lakeCenter){
  const bottom=height(lakeCenter.x,lakeCenter.z),radius=Math.min(70,Math.min(r.width,r.length)*.045);
  const review=proposeBasinLakes([{kind:'pit',outlet:lakeCenter,spillLevelM:21,bottomM:bottom,depthM:22-bottom,areaM2:Math.PI*radius*radius,cells:1}],
   {height,bounds,existing:waters,seaLevel:0},{maxLakes:1,idPrefix:'composition-lake-'});
  for(const p of review.proposals)waters.push(p.water);
 }
 const survey=analyzeWatersheds(bounds,height,0,{maxCells:1024});
 if((r.compositionVersion??1)===3&&r.tributaries){const main=waters.find(w=>w.kind==='river');if(main)waters.push(...proposeComposedTributaries(main,waters,height,bounds,r.tributaries));}
 if(r.rivers>1||((r.compositionVersion??1)<3&&r.tributaries)){
  const additional=proposeWatershedRivers(survey.headwaters,{height,water:()=>null,inWorld:(x,z)=>x>bounds.minX&&x<bounds.maxX&&z>bounds.minZ&&z<bounds.maxZ,seaLevel:0,existing:waters},
    {maxRivers:Math.min(6,r.rivers-1+r.tributaries),maxLengthM:4000,idPrefix:'composition-extra-'});
  for(const p of additional.proposals)if(p.plan.water.to?.kind==='sea'||p.plan.water.to?.kind==='river'){if(!compileWaterNetwork([...waters,p.plan.water],height,0).some(w=>w.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE')))waters.push(p.plan.water);}
 }
 if(r.waterfalls&&(r.compositionVersion??1)===3){const next=planTerraceFalls(waters,height,Math.min(8,r.terraces+1));waters.splice(0,waters.length,...next);}
 if(r.waterfalls&&(r.compositionVersion??1)<3){
  const review=reviewHydroNetwork(waters,height,0),falls=planHydroFalls(waters,review.falls,height,0,Math.min(6,r.terraces));
  for(const next of falls.changes){const proposed=waters.map(w=>w.id===next.id?next:w);if(compileWaterNetwork(proposed,height,0).some(w=>w.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE')))continue;const index=waters.findIndex(w=>w.id===next.id);waters[index]=next;}
 }
diagnostics.push(...compileWaterNetwork(waters,height,0).flatMap(w=>w.diagnostics));
 return {waters,diagnostics,survey};
}
