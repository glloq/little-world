/** Opt-in demonstration (`?minigames=demo`): football, bowling and mini-golf placed on the
 * nearest suitable ground around the spawn of the loaded island. Nothing is written to the
 * map sources; without the parameter no mini-game code is fetched. */
import {MINIGAME_VARIANT_IDS} from './catalog.ts';
import {defaultMiniGame} from './layouts.ts';
import type {MiniGameAreaV1,MiniGameInstanceV1} from './schema.ts';
import {suggestMiniGameSites,type SiteQueries} from './sites.ts';

/** Height difference accepted under a demo field before falling back (m). */
export const DEMO_MAX_RELIEF=.35;
export function demoMiniGames(origin:{x:number;z:number},q:SiteQueries,bounds:{minX:number;maxX:number;minZ:number;maxZ:number}):MiniGameInstanceV1[]{
  const out:MiniGameInstanceV1[]=[],taken:MiniGameAreaV1[]=[];
  for(const variant of MINIGAME_VARIANT_IDS){
    // The demo cannot grade the island: it looks for nearly flat ground first, so that the
    // activity floor lies a few centimetres above the relief (fallback: any suitable site).
    const flat=suggestMiniGameSites(variant,q,{anchors:[origin],bounds,avoid:taken,maxDistance:260,maxRelief:DEMO_MAX_RELIEF});
    const [area]=flat.length?flat:suggestMiniGameSites(variant,q,{anchors:[origin],bounds,avoid:taken,maxDistance:220});
    if(!area)continue;taken.push(area);
    const g=defaultMiniGame(variant,{id:'minigame:demo-'+variant,x:area.x,z:area.z,heading:area.heading});
    out.push({...g,name:g.name+' (démo)'});
  }
  return out;
}

/** Obstacles of the running game for site checks: deterministic dressing trees (same cells as
 * the renderer and the trunk colliders) and the static colliders already registered. */
export function runtimeObstacles(deps:{cell?(cx:number,cz:number):{items:Record<string,ArrayLike<number>>};cellSize:number;stride:number;
  solids?(minX:number,maxX:number,minZ:number,maxZ:number):readonly {minX:number;maxX:number;minZ:number;maxZ:number}[]}){
  return (minX:number,maxX:number,minZ:number,maxZ:number)=>{
    const out:{x:number;z:number;r:number}[]=[];
    for(const b of deps.solids?.(minX,maxX,minZ,maxZ)??[])out.push({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,r:Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)/2});
    if(deps.cell)for(let cz=Math.floor(minZ/deps.cellSize);cz<=Math.floor(maxZ/deps.cellSize);cz++)for(let cx=Math.floor(minX/deps.cellSize);cx<=Math.floor(maxX/deps.cellSize);cx++){
      const c=deps.cell(cx,cz);for(const kind of ['pine','oak']){const a=c.items[kind];if(!a)continue;for(let i=0;i<a.length;i+=deps.stride)if(a[i]>=minX&&a[i]<=maxX&&a[i+2]>=minZ&&a[i+2]<=maxZ)out.push({x:a[i],z:a[i+2],r:1});}
    }
    return out;
  };
}
