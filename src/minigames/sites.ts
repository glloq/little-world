/**
 * Terrain suitability of mini-game areas (doc 107 §Studio / composition). Pure queries over
 * the existing relief and water functions: Studio diagnostics, the opt-in demo and the
 * future world composer use the same rules; no terrain is generated or modified here.
 */
import {MINIGAME_VARIANTS,type MiniGameVariantId} from './catalog.ts';
import {areaRadius,areaToWorld,worldToArea,type MiniGameAreaV1,type MiniGameInstanceV1} from './schema.ts';
import {defaultMiniGame} from './layouts.ts';

export interface SiteQueries {height(x:number,z:number):number;water?(x:number,z:number):number|null;
  /** Existing obstacles (tree trunks, building colliders) as circles in a world rectangle. */
  obstacles?(minX:number,maxX:number,minZ:number,maxZ:number):readonly {x:number;z:number;r:number}[]}
export interface SiteReport {maxSlope:number;relief:number;water:boolean;obstacles:number;overlaps:number;accessible:boolean;ok:boolean;issues:string[]}
/** Optional context: other activity areas of the island (overlap check). */
export interface SiteContext {others?:readonly MiniGameAreaV1[]}

/** 5×5 samples over the area: steepest neighbour slope, total relief and water presence. */
export function inspectArea(area:MiniGameAreaV1,variant:MiniGameVariantId,q:SiteQueries,context:SiteContext={}):SiteReport{
  const n=5,h:number[][]=[];let water=false,lo=Infinity,hi=-Infinity,maxSlope=0;
  for(let i=0;i<n;i++){h.push([]);for(let j=0;j<n;j++){
    const p=areaToWorld(area,(i/(n-1)*2-1)*area.halfWidth,(j/(n-1)*2-1)*area.halfLength),y=q.height(p.x,p.z);
    h[i].push(y);lo=Math.min(lo,y);hi=Math.max(hi,y);const w=q.water?.(p.x,p.z)??null;if(w!==null&&w>y-.05)water=true;
  }}
  const dx=2*area.halfWidth/(n-1),dz=2*area.halfLength/(n-1);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){if(i)maxSlope=Math.max(maxSlope,Math.abs(h[i][j]-h[i-1][j])/dx);if(j)maxSlope=Math.max(maxSlope,Math.abs(h[i][j]-h[i][j-1])/dz);}
  const limit=MINIGAME_VARIANTS[variant].site.maxSlope,issues:string[]=[];
  if(maxSlope>limit)issues.push(`Pente ${Math.round(maxSlope*100)} % > ${Math.round(limit*100)} % conseillés`);
  if(water)issues.push('Eau dans la zone de jeu');
  let obstacles=0;
  if(q.obstacles){
    const r=areaRadius(area);
    for(const o of q.obstacles(area.x-r,area.x+r,area.z-r,area.z+r)){const l=worldToArea(area,o.x,o.z);if(Math.abs(l.x)<=area.halfWidth+o.r+.5&&Math.abs(l.z)<=area.halfLength+o.r+.5)obstacles++;}
    if(obstacles)issues.push(obstacles+' obstacle(s) existant(s) dans la zone (arbres, bâtiments)');
  }
  const overlaps=(context.others??[]).filter(o=>areasOverlap(area,o,1)).length;
  if(overlaps)issues.push(overlaps+' autre(s) activité(s) superposée(s)');
  // Access: some dry ground 3 m outside the area, walkable towards its edge (hamster slope limit).
  let accessible=false;
  for(let k=0;k<16&&!accessible;k++){
    const t=k/16*Math.PI*2,u=Math.cos(t),v=Math.sin(t),s=Math.max(Math.abs(u)/area.halfWidth,Math.abs(v)/area.halfLength);
    const edge=areaToWorld(area,u/s,v/s),out=areaToWorld(area,u/s+u*3,v/s+v*3),ho=q.height(out.x,out.z),he=q.height(edge.x,edge.z);
    const wet=(q.water?.(out.x,out.z)??null)!==null&&(q.water!(out.x,out.z) as number)>ho-.05;
    if(!wet&&Math.abs(ho-he)/3<WALKABLE_SLOPE)accessible=true;
  }
  if(!accessible)issues.push('Aucun accès à pied (eau ou pente tout autour)');
  return {maxSlope,relief:hi-lo,water,obstacles,overlaps,accessible,ok:!issues.length,issues};
}
/** Slope a walking hamster climbs (player DEFAULT_BODY: tan 50°). */
const WALKABLE_SLOPE=Math.tan(50*Math.PI/180);
/** Separating-axis test of two oriented areas, `margin` metres apart at least. */
export function areasOverlap(a:MiniGameAreaV1,b:MiniGameAreaV1,margin=0):boolean{
  const axes=(r:MiniGameAreaV1)=>[{x:Math.cos(r.heading),z:-Math.sin(r.heading)},{x:Math.sin(r.heading),z:Math.cos(r.heading)}];
  const extent=(r:MiniGameAreaV1,ax:{x:number;z:number})=>{const [u,v]=axes(r);return (r.halfWidth+margin/2)*Math.abs(u.x*ax.x+u.z*ax.z)+(r.halfLength+margin/2)*Math.abs(v.x*ax.x+v.z*ax.z);};
  const dx=b.x-a.x,dz=b.z-a.z;
  for(const ax of [...axes(a),...axes(b)])if(Math.abs(dx*ax.x+dz*ax.z)>extent(a,ax)+extent(b,ax))return false;
  return true;
}
export const inspectMiniGame=(def:MiniGameInstanceV1,q:SiteQueries,context:SiteContext={})=>inspectArea(def.area,def.variant,q,context);

/**
 * Deterministic search of suitable areas around anchor points (village centres, spawn):
 * rings every 8 m, 16 headings, first match per anchor order. Used by the demo and as the
 * composition integration point (activities suggested from relief and biome).
 */
export function suggestMiniGameSites(variant:MiniGameVariantId,q:SiteQueries,options:{anchors:readonly {x:number;z:number}[];bounds:{minX:number;maxX:number;minZ:number;maxZ:number};avoid?:readonly MiniGameAreaV1[];limit?:number;maxDistance?:number}):MiniGameAreaV1[]{
  const probe=defaultMiniGame(variant,{id:'minigame:probe',x:0,z:0}),out:MiniGameAreaV1[]=[],avoid=[...(options.avoid??[])];
  const r0=areaRadius(probe.area),limit=options.limit??1,maxD=options.maxDistance??160;
  for(const a of options.anchors){
    for(let d=r0+6;d<=maxD&&out.length<limit;d+=8)for(let k=0;k<16&&out.length<limit;k++){
      const t=k/16*Math.PI*2,x=Math.round(a.x+Math.sin(t)*d),z=Math.round(a.z+Math.cos(t)*d);
      // Long axis pointing away from the anchor: the pitch faces the village.
      const area={...probe.area,x,z,heading:Math.round(t*100)/100};
      if(x-r0<options.bounds.minX||x+r0>options.bounds.maxX||z-r0<options.bounds.minZ||z+r0>options.bounds.maxZ)continue;
      if(avoid.some(o=>areasOverlap(o,area,3)))continue;
      if(!inspectArea(area,variant,q).ok)continue;
      out.push(area);avoid.push(area);
    }
    if(out.length>=limit)break;
  }
  return out;
}
