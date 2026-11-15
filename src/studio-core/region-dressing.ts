/** B2: V3 polygon recipes become compact runtime ecology influence descriptors.
 * All trees remain the same instanced dressing, no serialized per-tree entities. */
import type {RegionRecipeV1,RegionVegetation} from './region-schema.ts';
import {DEFAULT_REGION_VEGETATION} from './region-schema.ts';
import type {LandscapeRegion} from '../world-production/biotopes.ts';
export function regionDressingRegions(regions:Record<string,RegionRecipeV1>|undefined):LandscapeRegion[]{
 const out:LandscapeRegion[]=[];
 for(const v of Object.values(regions??{}).sort((a,b)=>a.id.localeCompare(b.id))){
  const t=v.vegetation;if(!t)continue; // V1 regions without tuning keep prior ecology.
  if(Object.entries(DEFAULT_REGION_VEGETATION).every(([k,n])=>t[k as keyof RegionVegetation]===n)&&!Object.keys(t.treeMix??{}).length)continue;
  const xs=v.points.map(p=>p.x),zs=v.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  out.push({id:'region-ecology:'+v.id,x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,length:maxZ-minZ,rotation:0,
    edgeM:v.transitionM,polygon:v.points.map(p=>({...p})),vegetation:structuredClone(t)});
 }
 return out;
}
