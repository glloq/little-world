/** Terrain-led drainage. Each proposed native WATER network is recompiled in full. */
import {analyzeWatersheds} from './watershed-analysis.ts';
import {planGuidedRiver} from './guided-river.ts';
import {planTerraceFalls} from './world-terrace-falls.ts';
import {compileWaterNetwork,type HydroDiagnostic} from '../water/profile.ts';
import {polylineDistance,type PointXZ} from '../geography/archipelago.ts';
import type {MapRequirements} from './map-requirements.ts';
import type {Bounds} from './types.ts';
import type {WaterBody} from '../world-data.ts';
export function planNaturalHydro(r:MapRequirements,height:(x:number,z:number)=>number,bounds:Bounds){
 const survey=analyzeWatersheds(bounds,height,0,{maxCells:4096}),waters:WaterBody[]=[],diagnostics:HydroDiagnostic[]=[];
 const candidates=[...survey.headwaters].sort((a,b)=>b.elevationM-a.elevationM);
 const minor=Math.min(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
 const inWorld=(x:number,z:number)=>x>bounds.minX&&x<bounds.maxX&&z>bounds.minZ&&z<bounds.maxZ;
 // Survey supplies basin candidates; refine high slope sources in bounded extra directions.
 const sources:{source:PointXZ;toward:PointXZ}[]=[...candidates];
 for(const source of candidates.slice(0,6))for(const angle of [-1,1]){
  const dx=source.toward.x-source.source.x,dz=source.toward.z-source.source.z;
  const p={x:source.source.x+dz*angle*.6,z:source.source.z-dx*angle*.6};
  if(inWorld(p.x,p.z)&&height(p.x,p.z)>8)sources.push({source:p,toward:source.toward});
 }
 // The coarse D8 survey deliberately ignores short basins. Recover short island
 // streams using bounded, spatially separated high-ground samples of the same field.
 const high:{x:number;z:number;h:number}[]=[];
 for(let iz=0;iz<48;iz++)for(let ix=0;ix<48;ix++){
  const x=bounds.minX+(ix+.5)/48*(bounds.maxX-bounds.minX),z=bounds.minZ+(iz+.5)/48*(bounds.maxZ-bounds.minZ),h=height(x,z);
  if(h>12)high.push({x,z,h});
 }
 high.sort((a,b)=>b.h-a.h);let added=0;
 for(const p of high){
  if(added>=24)break;if(sources.some(c=>Math.hypot(c.source.x-p.x,c.source.z-p.z)<Math.max(35,minor*.055)))continue;
  let toward:PointXZ|undefined,best=p.h;
  for(let k=0;k<16;k++){const a=k*Math.PI/8,x=p.x+Math.cos(a)*Math.max(8,minor*.012),z=p.z+Math.sin(a)*Math.max(8,minor*.012),h=height(x,z);if(inWorld(x,z)&&h<best){best=h;toward={x,z};}}
  if(toward){sources.push({source:{x:p.x,z:p.z},toward});added++;}
 }
 if(r.rivers||r.tributaries)for(const [i,c]of sources.entries()){
  if(waters.length>=r.rivers+r.tributaries)break;
  if(waters.some(w=>polylineDistance(w.points,c.source.x,c.source.z)<50))continue;
  try{
   const plan=planGuidedRiver(c.source,c.toward,{height,inWorld,seaLevel:0,existing:waters,
    // Detect an existing carved channel footprint, including when its surface is below raw terrain.
    water:(x,z)=>waters.some(w=>polylineDistance(w.points,x,z)<Math.max(4,w.width/2))?height(x,z)+1:null},
    {id:'composition-river-'+i,width:Math.max(2,Math.min(9,Math.min(r.width,r.length)*.002)),depth:1.5,maxLengthM:4000});
   const w=plan.water;if(!w.to||plan.trace.lengthM<60)continue;
   if(w.to.kind==='sea'&&waters.filter(q=>q.to?.kind==='sea').length>=r.rivers)continue;
   if(w.to.kind==='river'&&waters.filter(q=>q.to?.kind==='river').length>=r.tributaries)continue;
   const network=compileWaterNetwork([...waters,w],height,0);
   if(network.some(c=>c.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE')))continue;
   // Reject a sampled segment that jumps over a marine pass before its outlet.
   let marine=false;
   for(let j=1;j<w.points.length;j++)for(let k=0;k<4;k++){
    const a=w.points[j-1],b=w.points[j],t=k/4;
    if(j<w.points.length-1&&height(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)<-.6)marine=true;
   }
   if(!marine)waters.push(w);
  }catch{/* Failed candidates are not saved; quotas are reported by composeWorld. */}
 }
 if(r.waterfalls){const next=planTerraceFalls(waters,height,6);waters.splice(0,waters.length,...next);}
 diagnostics.push(...compileWaterNetwork(waters,height,0).flatMap(w=>w.diagnostics));
 return {waters,diagnostics,survey};
}
