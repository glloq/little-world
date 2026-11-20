/**
 * Land registry (doc 104 §C3, doc 73): one occupation model shared by every
 * producer — terrain sites, settlements, fields, roads, water, pistes, races,
 * surf breaks, dive sites, mines. A reservation states its use, footprint,
 * priority, clearance and the terrain it can accept; the registry answers
 * "does this candidate conflict with what is already claimed?" so planners
 * can try their next site instead of relying on call order.
 *
 * Pure data + geometry: no DOM, no rendering, usable in Node, workers and the
 * Studio. Reservations are DERIVED from the project (never a second source of
 * truth), except candidates a planner is evaluating.
 */
import type {ProjectDocument} from './types.ts';
import {settlementFootprint,type PointXZ} from '../settlements/footprint.ts';
import {earthworkFootprint} from '../geography/earthworks.ts';

export const LAND_USES=['settlement','road','farm','site-harbor','site-farm','site-lake','water','piste','race','surf','dive','mine','grading','calm'] as const;
export type LandUse=typeof LAND_USES[number];
export type LandShape=
 |{kind:'polygon';points:PointXZ[]}
 |{kind:'corridor';points:PointXZ[];widthM:number}
 |{kind:'disc';x:number;z:number;radiusM:number};
/** Terrain a reservation accepts before grading (all optional). */
export interface TerrainWindow {minHeightM?:number;maxHeightM?:number;maxSlope?:number;minDepthM?:number;maxDepthM?:number}
export interface LandReservation {
 id:string;use:LandUse;shape:LandShape;
 /** Owning source object, e.g. {kind:'settlement',id}. */
 owner:{kind:string;id:string};
 /** Higher wins when a planner must choose; 0–100. */
 priority:number;
 /** Free margin required around the footprint against incompatible uses. */
 clearanceM:number;
 window?:TerrainWindow;
 /** Maximum vertical change (m) the earthworks layer may apply inside. */
 gradingBudgetM?:number;
}
export interface LandConflict {a:string;b:string;useA:LandUse;useB:LandUse;areaM2:number;at:PointXZ}

/** Uses that may legitimately share ground (containers, crossings, bridges). Unordered pairs. */
const COMPATIBLE=new Set<string>([
 'settlement|road','settlement|farm','settlement|site-harbor','settlement|site-farm','settlement|water','settlement|mine','settlement|grading',
 'road|road','road|farm','road|site-harbor','road|site-farm','road|site-lake','road|water','road|piste','road|race','road|mine','road|grading','road|calm',
 'farm|site-farm','farm|grading','farm|farm',
 'site-harbor|water','site-harbor|grading','site-farm|grading','site-lake|water','site-lake|grading',
 'water|water','water|dive','water|grading','water|race',
 'piste|piste','piste|race','piste|grading',
 'race|grading','surf|dive','dive|dive','mine|grading','calm|calm','grading|grading',
]);
export function compatibleUses(a:LandUse,b:LandUse):boolean{return COMPATIBLE.has(a+'|'+b)||COMPATIBLE.has(b+'|'+a);}

interface Box {minX:number;maxX:number;minZ:number;maxZ:number}
function shapeBox(s:LandShape,margin=0):Box{
 if(s.kind==='disc')return {minX:s.x-s.radiusM-margin,maxX:s.x+s.radiusM+margin,minZ:s.z-s.radiusM-margin,maxZ:s.z+s.radiusM+margin};
 const pad=(s.kind==='corridor'?s.widthM/2:0)+margin,xs=s.points.map(p=>p.x),zs=s.points.map(p=>p.z);
 return {minX:Math.min(...xs)-pad,maxX:Math.max(...xs)+pad,minZ:Math.min(...zs)-pad,maxZ:Math.max(...zs)+pad};
}
function polylineDistance(points:readonly PointXZ[],x:number,z:number):number{
 if(points.length===1)return Math.hypot(x-points[0].x,z-points[0].z);
 let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),ex=x-a.x-t*dx,ez=z-a.z-t*dz,d=ex*ex+ez*ez;if(d<best)best=d;}
 return Math.sqrt(best);
}
function insidePolygon(poly:readonly PointXZ[],x:number,z:number):boolean{
 let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a.z>z)!==(b.z>z)&&x<a.x+(z-a.z)/(b.z-a.z)*(b.x-a.x))inside=!inside;}return inside;
}
/** Signed distance outside the shape (≤ 0 inside). Polygons use the edge distance. */
export function shapeDistance(s:LandShape,x:number,z:number):number{
 if(s.kind==='disc')return Math.hypot(x-s.x,z-s.z)-s.radiusM;
 if(s.kind==='corridor')return polylineDistance(s.points,x,z)-s.widthM/2;
 const d=polylineDistance([...s.points,s.points[0]],x,z);return insidePolygon(s.points,x,z)?-d:d;
}
export function shapeContains(s:LandShape,x:number,z:number,margin=0):boolean{return shapeDistance(s,x,z)<=margin;}
export function shapeArea(s:LandShape):number{
 if(s.kind==='disc')return Math.PI*s.radiusM*s.radiusM;
 if(s.kind==='corridor'){let l=0;for(let i=1;i<s.points.length;i++)l+=Math.hypot(s.points[i].x-s.points[i-1].x,s.points[i].z-s.points[i-1].z);return l*s.widthM;}
 let a=0;for(let i=0,j=s.points.length-1;i<s.points.length;j=i++)a+=(s.points[j].x+s.points[i].x)*(s.points[j].z-s.points[i].z);return Math.abs(a)/2;
}

/** Overlapping area of two reservations, inflated by the larger clearance; sampled on a grid. */
export function overlapArea(a:LandReservation,b:LandReservation,maxSamples=4096):{areaM2:number;at:PointXZ}{
 const m=Math.max(a.clearanceM,b.clearanceM),ba=shapeBox(a.shape),bb=shapeBox(b.shape,m);
 const box={minX:Math.max(ba.minX,bb.minX),maxX:Math.min(ba.maxX,bb.maxX),minZ:Math.max(ba.minZ,bb.minZ),maxZ:Math.min(ba.maxZ,bb.maxZ)};
 if(box.minX>=box.maxX||box.minZ>=box.maxZ)return {areaM2:0,at:{x:0,z:0}};
 const w=box.maxX-box.minX,h=box.maxZ-box.minZ,step=Math.max(1,Math.sqrt(w*h/maxSamples));
 let n=0,sx=0,sz=0;
 for(let z=box.minZ+step/2;z<box.maxZ;z+=step)for(let x=box.minX+step/2;x<box.maxX;x+=step)
  if(shapeContains(a.shape,x,z)&&shapeContains(b.shape,x,z,m)){n++;sx+=x;sz+=z;}
 return {areaM2:n*step*step,at:n?{x:Math.round(sx/n),z:Math.round(sz/n)}:{x:0,z:0}};
}

const CELL=128;
/** Spatial index of reservations with conflict queries. Minor contacts below `toleranceM2` are ignored. */
export class LandRegistry {
 private readonly items=new Map<string,{r:LandReservation;box:Box}>();
 private readonly cells=new Map<string,Set<string>>();
 readonly toleranceM2:number;
 constructor(reservations:readonly LandReservation[]=[],toleranceM2=16){this.toleranceM2=toleranceM2;for(const r of reservations)this.add(r);}
 get size(){return this.items.size;}
 list():LandReservation[]{return [...this.items.values()].map(i=>i.r);}
 get(id:string){return this.items.get(id)?.r;}
 private keys(box:Box):string[]{const out:string[]=[];for(let cz=Math.floor(box.minZ/CELL);cz<=Math.floor(box.maxZ/CELL);cz++)for(let cx=Math.floor(box.minX/CELL);cx<=Math.floor(box.maxX/CELL);cx++)out.push(cx+':'+cz);return out;}
 add(r:LandReservation):void{
  if(this.items.has(r.id))throw Error('Réservation dupliquée : '+r.id);
  const box=shapeBox(r.shape,r.clearanceM);this.items.set(r.id,{r,box});
  for(const k of this.keys(box)){let s=this.cells.get(k);if(!s)this.cells.set(k,s=new Set());s.add(r.id);}
 }
 remove(id:string):void{const it=this.items.get(id);if(!it)return;this.items.delete(id);for(const k of this.keys(it.box))this.cells.get(k)?.delete(id);}
 /** Candidates whose (clearance-inflated) boxes touch the box. */
 near(box:Box):LandReservation[]{const ids=new Set<string>();for(const k of this.keys(box))for(const id of this.cells.get(k)??[])ids.add(id);return [...ids].map(id=>this.items.get(id)!.r).filter(r=>{const b=shapeBox(r.shape,r.clearanceM);return b.minX<=box.maxX&&b.maxX>=box.minX&&b.minZ<=box.maxZ&&b.maxZ>=box.minZ;});}
 conflictsWith(c:LandReservation):LandConflict[]{
  const out:LandConflict[]=[];
  for(const r of this.near(shapeBox(c.shape,c.clearanceM))){
   if(r.id===c.id||(r.owner.kind===c.owner.kind&&r.owner.id===c.owner.id)||compatibleUses(r.use,c.use))continue;
   const o=overlapArea(c,r);if(o.areaM2>this.toleranceM2)out.push({a:c.id,b:r.id,useA:c.use,useB:r.use,areaM2:Math.round(o.areaM2),at:o.at});
  }
  return out;
 }
 /** Claim when free; returns the conflicts otherwise (the registry is unchanged). */
 claim(c:LandReservation):LandConflict[]{const conflicts=this.conflictsWith(c);if(!conflicts.length)this.add(c);return conflicts;}
 /** Every conflicting pair once. */
 conflicts():LandConflict[]{
  const out:LandConflict[]=[],seen=new Set<string>();
  for(const {r}of this.items.values())for(const c of this.conflictsWith(r)){const k=[c.a,c.b].sort().join('|');if(!seen.has(k)){seen.add(k);out.push(c);}}
  return out;
 }
 /** Uses claimed at a point, highest priority first. */
 usesAt(x:number,z:number):LandReservation[]{return this.near({minX:x,maxX:x,minZ:z,maxZ:z}).filter(r=>shapeContains(r.shape,x,z)).sort((a,b)=>b.priority-a.priority);}
}

const corridor=(points:readonly PointXZ[],widthM:number):LandShape=>({kind:'corridor',points:points.map(p=>({x:p.x,z:p.z})),widthM});
/** Derive every reservation implied by an authored project (deterministic, ordered by id). */
export function collectLandReservations(p:ProjectDocument):LandReservation[]{
 const out:LandReservation[]=[],L=p.libraries;
 const features=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features:[];
 for(const plan of Object.values(L.terrainPlans??{}))for(const s of plan.sites){
  const f=features.find(f=>f.id===s.featureId);if(f?.kind!=='plateau')continue;
  out.push({id:'site:'+s.id,use:('site-'+s.kind) as LandUse,shape:{kind:'polygon',points:f.polygon.map(q=>({x:q.x,z:q.z}))},owner:{kind:'terrain-site',id:s.id},priority:80,clearanceM:0});
 }
 for(const s of Object.values(L.settlements??{})){const poly=settlementFootprint(s);if(poly&&poly.length>=3)out.push({id:'settlement:'+s.id,use:'settlement',shape:{kind:'polygon',points:poly},owner:{kind:'settlement',id:s.id},priority:70,clearanceM:2,window:{maxSlope:.35}});}
 for(const z of Object.values(L.zones??{}))if(z.polygon.length>=3)out.push({id:'zone:'+z.id,use:z.kind==='farm-plot'?'farm':'mine',shape:{kind:'polygon',points:z.polygon.map(q=>({x:q.x,z:q.z}))},owner:{kind:'zone',id:z.id},priority:60,clearanceM:0});
 for(const path of Object.values(L.paths))if(path.points.length>=2)out.push({id:'path:'+path.id,use:'road',shape:corridor(path.points,path.width),owner:{kind:'path',id:path.id},priority:50,clearanceM:0});
 for(const w of Object.values(L.water)){if(w.points.length<2)continue;out.push({id:'water:'+w.id,use:'water',shape:w.kind==='lake'&&w.points.length>=3?{kind:'polygon',points:w.points.map(q=>({x:q.x,z:q.z}))}:corridor(w.points,w.width),owner:{kind:'water',id:w.id},priority:90,clearanceM:0});}
 for(const a of Object.values(L.alpine??{}))out.push({id:'piste:'+a.id,use:'piste',shape:corridor(a.points,a.widthM),owner:{kind:'alpine',id:a.id},priority:65,clearanceM:2});
 for(const r of Object.values(L.races??{}))if(r.track&&r.track.points.length>=2)out.push({id:'race:'+r.id,use:'race',shape:corridor(r.track.points,r.track.width),owner:{kind:'race',id:r.id},priority:55,clearanceM:1});
 for(const z of Object.values(L.surfZones??{}))out.push({id:'surf:'+z.id,use:'surf',shape:{kind:'polygon',points:[{x:z.minX,z:z.minZ},{x:z.maxX,z:z.minZ},{x:z.maxX,z:z.maxZ},{x:z.minX,z:z.maxZ}]},owner:{kind:'surf',id:z.id},priority:60,clearanceM:0});
 for(const w of p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.earthworks??[]:[])out.push({id:'grading:'+w.id,use:'grading',shape:earthworkFootprint(w),owner:{kind:'earthwork',id:w.id},priority:40,clearanceM:0});
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}
export function projectLandRegistry(p:ProjectDocument):LandRegistry{return new LandRegistry(collectLandReservations(p));}

export interface LandDiagnostic {severity:'ERROR'|'WARNING';code:string;message:string;id?:string}
const USE_LABEL:Record<LandUse,string>={settlement:'village',road:'chemin','farm':'champ','site-harbor':'port','site-farm':'zone agricole','site-lake':'lac',water:'eau',piste:'piste',race:'course',surf:'zone de surf',dive:'site de plongée',mine:'mine',grading:'terrassement',calm:'zone calme'};
/** Overlaps between incompatible uses, as navigable diagnostics. */
export function auditLandUse(p:ProjectDocument,registry=projectLandRegistry(p)):LandDiagnostic[]{
 return registry.conflicts().map(c=>({severity:'WARNING' as const,code:'LAND_OVERLAP',id:c.a,message:`${USE_LABEL[c.useA]} « ${c.a.split(':').slice(1).join(':')} » chevauche ${USE_LABEL[c.useB]} « ${c.b.split(':').slice(1).join(':')} » sur ~${c.areaM2} m² vers (${c.at.x}, ${c.at.z}).`}));
}
