/** Versioned layout preferences, geometry and bounds. All output remains native paths/entities. */
import type { SettlementRecipe } from './schema.ts';
import type { WorldDefinitionV3 } from '../studio-core/types.ts';
import type { PointXZ } from '../geography/archipelago.ts';
import { compilePolygon } from '../geography/archipelago.ts';
import { simpleOutline } from '../geography/simple-outline.ts';
import { fingerprint } from '../world-production/landscape-schema.ts';
import type { GroundRouteContext } from '../paths/terrain-route.ts';
import { inspectGroundSegment } from '../paths/terrain-route.ts';
export interface SettlementLayout {
    version: 1;
    pattern: 'organic' | 'clusters' | 'linear' | 'street' | 'mountain' | 'river' | 'fishing';
    density: 'loose' | 'balanced' | 'compact';
    variation: number;
    poi?: 'square' | 'market' | 'activity';
    modules?: {
        lane: number;
        dx: number;
        dz: number;
    }[];
    boundary?: PointXZ[];
    adjustments?: {
        slot: number;
        dx: number;
        dz: number;
    }[];
}
export const DEFAULT_SETTLEMENT_LAYOUT: SettlementLayout = { version: 1, pattern: 'organic', density: 'balanced', variation: 0 };
export function validateSettlementLayout(value: unknown, world: WorldDefinitionV3): asserts value is SettlementLayout {
    const v = value as SettlementLayout;
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['version', 'pattern', 'density', 'variation', 'poi', 'modules', 'boundary', 'adjustments'].includes(k)) || v.version !== 1 || !['organic', 'clusters', 'linear', 'street', 'mountain', 'river', 'fishing'].includes(v.pattern) || !['loose', 'balanced', 'compact'].includes(v.density) || !Number.isInteger(v.variation) || v.variation < 0 || v.variation > 0xffffffff)
        throw Error('Organisation de l’implantation invalide');
    if (v.poi !== undefined && !['square', 'market', 'activity'].includes(v.poi))
        throw Error('Point d’intérêt invalide');
    if (v.boundary !== undefined) {
        if (!Array.isArray(v.boundary) || v.boundary.length < 3 || v.boundary.length > 32 || v.boundary.some(q => !q || Object.keys(q).some(k => !['x', 'z'].includes(k)) || !Number.isFinite(q.x) || !Number.isFinite(q.z) || q.x < world.bounds.minX || q.x > world.bounds.maxX || q.z < world.bounds.minZ || q.z > world.bounds.maxZ) || !simpleOutline(v.boundary))
            throw Error('Zone de l’implantation croisée, dégénérée ou hors carte');
    }
    if (v.modules !== undefined && (!Array.isArray(v.modules) || v.modules.length > 6 || new Set(v.modules.map(m => m.lane)).size !== v.modules.length || v.modules.some(m => !m || Object.keys(m).some(k => !['lane', 'dx', 'dz'].includes(k)) || !Number.isInteger(m.lane) || m.lane < 0 || m.lane > 5 || ![m.dx, m.dz].every(n => Number.isFinite(n) && Math.abs(n) <= 150))))
        throw Error('Modules d’implantation invalides');
    if (v.adjustments !== undefined) {
        if (!Array.isArray(v.adjustments) || v.adjustments.length > 80 || new Set(v.adjustments.map(a => a.slot)).size !== v.adjustments.length || v.adjustments.some(a => !a || Object.keys(a).some(k => !['slot', 'dx', 'dz'].includes(k)) || !Number.isInteger(a.slot) || a.slot < 0 || a.slot > 79 || ![a.dx, a.dz].every(n => Number.isFinite(n) && Math.abs(n) <= 100)))
            throw Error('Retouches d’implantation invalides');
    }
}
export function layoutContext(r: SettlementRecipe, c: GroundRouteContext): GroundRouteContext { if (!r.layout)
    return c; const inside = r.layout.boundary ? compilePolygon(r.layout.boundary) : (x: number, z: number) => r.radius - Math.hypot(x - r.center.x, z - r.center.z); return { ...c, wet: (x, z) => c.wet(x, z) || inside(x, z) < 0 }; }
export function layoutPoint(r: SettlementRecipe, x: number, z: number): PointXZ { const a = r.orientation * Math.PI / 180; return { x: r.center.x + x * Math.cos(a) + z * Math.sin(a), z: r.center.z - x * Math.sin(a) + z * Math.cos(a) }; }
export const layoutRandom = (r: SettlementRecipe, salt: string) => parseInt(fingerprint([r.seed, r.layout?.variation ?? 0, salt]).slice(0, 8), 16) / 0xffffffff;
export function layoutDimensions(r:SettlementRecipe){
 const organic=!!r.layout&&r.layout.pattern!=='linear',density=r.layout?.density??'balanced',factor=(density==='loose'?1.16:density==='compact'?.92:1)*(r.layout?.pattern==='clusters'?1.08:1);
 const lanes=organic?(r.targetBuildings<=16?3:r.targetBuildings<=40?4:r.targetBuildings<=65?5:6):(r.targetBuildings<=16?1:r.targetBuildings<=40?2:3),pairs=Math.ceil(r.targetBuildings/(lanes*2)),step=(r.activity==='agriculture'?18:15)*(r.layout?factor:1),half=(pairs-1)*step/2;
 const spacing=r.form==='fortified'?7.2:r.form==='town'?8:12,outer=Math.min(r.radius-7,(24+Math.sqrt(r.targetBuildings)*spacing)*factor),inner=18.8;
 return {organic,lanes,pairs,step,half,roadZ:organic?0:-half-10,gap:r.layout?Math.max(28,28*factor):28,factor,outer,inner,streetWidth:r.form==='fortified'?2.2:r.form==='town'?2.7:3.2};
}
export function layoutAngle(r:SettlementRecipe,lane:number){const d=layoutDimensions(r);return r.orientation*Math.PI/180+layoutRandom(r,'orientation-phase')*Math.PI*2+lane/d.lanes*Math.PI*2;}
export const sectorWeight=(t:number)=>Math.max(0,Math.min(1,(t-.22)/.78));
/** Sector deformation fades toward the single central place, never creates satellite centers. */
export function spokePoint(r:SettlementRecipe,lane:number,t:number):PointXZ{const d=layoutDimensions(r),a=layoutAngle(r,lane)+(layoutRandom(r,'street-bend-'+lane)-.5)*.28*Math.sin(t*Math.PI),radius=t*(d.outer+2),k=1+.045*Math.sin(a*2+.7)+.035*Math.sin(a*3+layoutRandom(r,'rim-phase')*Math.PI*2),m=r.layout?.modules?.find(m=>m.lane===lane);return {x:r.center.x+Math.cos(a)*radius*k+(m?.dx??0)*sectorWeight(t),z:r.center.z+Math.sin(a)*radius*k+(m?.dz??0)*sectorWeight(t)};}
export function moduleCenter(r:SettlementRecipe,lane:number):PointXZ{return spokePoint(r,lane,.58);}
export function lanePoint(r:SettlementRecipe,lane:number,t:number):PointXZ{const d=layoutDimensions(r);return d.organic?spokePoint(r,lane,t/Math.max(1,d.half+10)):layoutPoint(r,(lane-(d.lanes-1)/2)*d.gap,t);}
export function recommendedLayoutRadius(r:SettlementRecipe){const d=layoutDimensions(r);return d.organic?Math.max(75,(24+Math.sqrt(r.targetBuildings)*(r.form==='fortified'?7.2:r.form==='town'?8:12))*d.factor+18):r.radius;}
export function ringBands(r:SettlementRecipe){const d=layoutDimensions(r);return d.outer>100?[d.inner,d.outer*.5,d.outer*.8]:[d.inner,d.outer*.64];}
export function nearestOnRoad(q: PointXZ, points: PointXZ[]) { let best: {
    point: PointXZ;
    tangent: PointXZ;
    distance: number;
} | null = null; for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
    if (n < 1e-8)
        continue;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / n)), point = { x: a.x + dx * t, z: a.z + dz * t }, distance = Math.hypot(q.x - point.x, q.z - point.z);
    if (!best || distance < best.distance)
        best = { point, tangent: { x: dx / Math.sqrt(n), z: dz / Math.sqrt(n) }, distance };
} return best; }
export function organicStreet(r:SettlementRecipe,lane:number,c:GroundRouteContext,clear:(points:PointXZ[],width:number)=>boolean=()=>true):PointXZ[]|null{
 const d=layoutDimensions(r),values=[...Array.from({length:25},(_,i)=>i/24),...ringBands(r).map(radius=>radius/(d.outer+2))].sort((a,b)=>a-b),raw=values.map(t=>spokePoint(r,lane,t)),normal={x:-Math.sin(layoutAngle(r,lane)),z:Math.cos(layoutAngle(r,lane))};
 for(const offset of [0,4,-4,8,-8,12,-12,16,-16,20,-20,28,-28]){const points=raw.map((q,i)=>({x:q.x+normal.x*offset*Math.sin(values[i]*Math.PI),z:q.z+normal.z*offset*Math.sin(values[i]*Math.PI)}));if(points.slice(1).every((b,i)=>inspectGroundSegment(points[i],b,c,{maxSlope:.35,widthM:d.streetWidth}).valid)&&clear(points,d.streetWidth))return points;}
 return null;
}
export function organicArcs(r:SettlementRecipe,roads:{id:string;points:PointXZ[]}[],c:GroundRouteContext,clear:(points:PointXZ[],width:number)=>boolean=()=>true){const d=layoutDimensions(r),arcs:{id:string;points:PointXZ[]}[]=[];let omitted=0;
 for(const [band,radius]of ringBands(r).entries())for(let lane=0;lane<d.lanes;lane++){const a=roads.find(p=>p.id===r.id+'-street-'+lane),b=roads.find(p=>p.id===r.id+'-street-'+((lane+1)%d.lanes));if(!a||!b){omitted++;continue;}
  const from=nearestOnRoad(spokePoint(r,lane,radius/(d.outer+2)),a.points)?.point,to=nearestOnRoad(spokePoint(r,(lane+1)%d.lanes,radius/(d.outer+2)),b.points)?.point;if(!from||!to)continue;const start=layoutAngle(r,lane),end=start+Math.PI*2/d.lanes;
  for(const bow of [0,.06,-.06,.12,-.12]){const nominal=(t:number)=>{const angle=start+(end-start)*t,k=1+.045*Math.sin(angle*2+.7)+.035*Math.sin(angle*3+layoutRandom(r,'rim-phase')*Math.PI*2),rad=radius*(1+bow*Math.sin(t*Math.PI));return {x:r.center.x+Math.cos(angle)*rad*k,z:r.center.z+Math.sin(angle)*rad*k};},na=nominal(0),nb=nominal(1),points=Array.from({length:13},(_,i)=>{const t=i/12,q=nominal(t);return {x:q.x+(from.x-na.x)*(1-t)+(to.x-nb.x)*t,z:q.z+(from.z-na.z)*(1-t)+(to.z-nb.z)*t};});if(points.slice(1).every((q,i)=>inspectGroundSegment(points[i],q,c,{maxSlope:.35,widthM:d.streetWidth}).valid)&&clear(points,d.streetWidth)){arcs.push({id:r.id+'-street-ring-'+band+'-'+lane,points});break;}if(bow===-.12)omitted++;}
 }
 return {arcs,omitted};}
/** Fit a user-drawn zone with the street axis along its principal direction. */
export function recipeForBoundary(r: SettlementRecipe, boundary: PointXZ[]): SettlementRecipe {
    const center = { x: boundary.reduce((n, q) => n + q.x, 0) / boundary.length, z: boundary.reduce((n, q) => n + q.z, 0) / boundary.length };
    let xx = 0, zz = 0, xz = 0;
    for (const q of boundary) {
        const x = q.x - center.x, z = q.z - center.z;
        xx += x * x;
        zz += z * z;
        xz += x * z;
    }
    const axis = .5 * Math.atan2(2 * xz, xx - zz), orientation = r.layout && r.layout.pattern !== 'linear' ? r.orientation : (Math.PI / 2 - axis) * 180 / Math.PI, radius = Math.min(600, Math.max(30, ...boundary.map(q => Math.hypot(q.x - center.x, q.z - center.z) + 8)));
    return { ...r, center, radius, orientation, layout: { ...DEFAULT_SETTLEMENT_LAYOUT, pattern: r.layout?.pattern ?? 'linear', ...r.layout, boundary: structuredClone(boundary) } };
}
