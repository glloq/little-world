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
export interface SiteReport {maxSlope:number;relief:number;water:boolean;obstacles:number;ok:boolean;issues:string[]}

/** 5×5 samples over the area: steepest neighbour slope, total relief and water presence. */
export function inspectArea(area:MiniGameAreaV1,variant:MiniGameVariantId,q:SiteQueries):SiteReport{
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
  return {maxSlope,relief:hi-lo,water,obstacles,ok:!issues.length,issues};
}
export const inspectMiniGame=(def:MiniGameInstanceV1,q:SiteQueries)=>inspectArea(def.area,def.variant,q);

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
      if(avoid.some(o=>Math.hypot(o.x-x,o.z-z)<areaRadius(o)+r0+3))continue;
      if(!inspectArea(area,variant,q).ok)continue;
      out.push(area);avoid.push(area);
    }
    if(out.length>=limit)break;
  }
  return out;
}
