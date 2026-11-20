/**
 * Settlement footprint (doc 104 §C3): the area a village actually occupies,
 * derived from its doors and amenity entries, never stored separately so it
 * follows locks and manual edits. Used by the land registry and by the
 * geography engine (no trees between houses; gardens and grass remain).
 */
import type {SettlementInstance} from './schema.ts';

export interface PointXZ {x:number;z:number}
/** Margin around door/amenity entries: half a house diagonal plus a small yard. */
export const SETTLEMENT_FOOTPRINT_MARGIN_M=9;

/** Monotone chain convex hull, counter-clockwise, without collinear points. */
export function convexHull(points:readonly PointXZ[]):PointXZ[] {
 const p=[...points].sort((a,b)=>a.x-b.x||a.z-b.z);if(p.length<3)return p;
 const cross=(o:PointXZ,a:PointXZ,b:PointXZ)=>(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);
 const lower:PointXZ[]=[],upper:PointXZ[]=[];
 for(const q of p){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],q)<=0)lower.pop();lower.push(q);}
 for(let i=p.length-1;i>=0;i--){const q=p[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],q)<=0)upper.pop();upper.push(q);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}

/** Offset a convex counter-clockwise polygon outwards with rounded corners (8 steps). */
export function inflateConvex(hull:readonly PointXZ[],margin:number):PointXZ[] {
 if(hull.length===0)return [];
 if(hull.length<3){
  const c=hull.reduce((a,q)=>({x:a.x+q.x/hull.length,z:a.z+q.z/hull.length}),{x:0,z:0}),r=margin+Math.max(...hull.map(q=>Math.hypot(q.x-c.x,q.z-c.z)));
  return Array.from({length:12},(_,i)=>({x:c.x+Math.cos(i/12*Math.PI*2)*r,z:c.z+Math.sin(i/12*Math.PI*2)*r}));
 }
 const out:PointXZ[]=[];
 for(let i=0;i<hull.length;i++){
  const prev=hull[(i+hull.length-1)%hull.length],q=hull[i],next=hull[(i+1)%hull.length];
  const a0=Math.atan2(-(q.x-prev.x),q.z-prev.z),a1=Math.atan2(-(next.x-q.x),next.z-q.z);
  let span=a1-a0;while(span<0)span+=Math.PI*2;while(span>Math.PI*2)span-=Math.PI*2;
  const steps=Math.max(1,Math.ceil(span/(Math.PI/8)));
  for(let s=0;s<=steps;s++){const a=a0+span*s/steps;out.push({x:q.x+Math.cos(a)*margin,z:q.z+Math.sin(a)*margin});}
 }
 return out;
}

/** Footprint polygon of one settlement, or null when it has no placed house or amenity. */
export function settlementFootprint(s:SettlementInstance,margin=SETTLEMENT_FOOTPRINT_MARGIN_M):PointXZ[]|null {
 const points=[...s.buildings.map(b=>b.entry),...(s.amenities??[]).map(a=>a.entry)].filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.z));
 if(!points.length)return null;
 return inflateConvex(convexHull(points),margin).map(q=>({x:Math.round(q.x*100)/100,z:Math.round(q.z*100)/100}));
}

/** Geography zones of the settlements of a library (occupation 'reserved': no trees). */
export function settlementGeoZones(settlements:Record<string,SettlementInstance>|undefined):{kind:'settlement';polygon:PointXZ[]}[] {
 return Object.values(settlements??{}).flatMap(s=>{const polygon=settlementFootprint(s);return polygon&&polygon.length>=3?[{kind:'settlement' as const,polygon}]:[];});
}
