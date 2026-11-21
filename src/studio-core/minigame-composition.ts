/** Terrain-aware placement of mini-games (Studio analysis and island composition). Kept out
 * of minigame-authoring.ts so the Studio core (elements, selection) never loads the site
 * search nor the race-placement environment. */
import type {ProjectDocument} from './types.ts';
import {MINIGAME_VARIANTS,type MiniGameVariantId} from '../minigames/catalog.ts';
import {suggestMiniGameSites,type SiteQueries} from '../minigames/sites.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';
import {createMiniGame,putMiniGame} from './minigame-authoring.ts';

/** Terrain queries of a project for mini-game sites (Studio analysis AND composition), from
 * the same environment as race placement: relief, water and occupation (buildings, paths,
 * reserved zones). The project's own mini-games are excluded (their ground is reserved). */
export function projectSiteQueries(p:ProjectDocument):SiteQueries{
  const env=projectRaceTerrainEnvironment({...p,libraries:{...p.libraries,minigames:undefined}});
  return {height:env.height,water:(x,z)=>env.water(x,z,env.height(x,z)),
    obstacles:(minX,maxX,minZ,maxZ)=>{const out:{x:number;z:number;r:number}[]=[];for(let x=minX;x<=maxX;x+=2)for(let z=minZ;z<=maxZ;z+=2){const o=env.occupation(x,z);if(o&&o!=='none')out.push({x,z,r:.5});}return out;}};
}
/** Composition (opt-in `generation.activities.minigames`): one instance per requested variant
 * on naturally suitable ground — near villages when the variant says so, otherwise around the
 * island centre. No terrain is modified; a variant without a site is reported, not forced. */
export function composeMiniGames(p:ProjectDocument,variants:readonly MiniGameVariantId[]):{placed:string[];missing:MiniGameVariantId[]}{
  const q=projectSiteQueries(p),b=p.world.bounds,placed:string[]=[],missing:MiniGameVariantId[]=[];
  const villages=Object.values(p.libraries.settlements??{}).map(s=>s.recipe.center).sort((a,c)=>a.x-c.x||a.z-c.z);
  const centre={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2};
  for(const variant of variants){
    const avoid=Object.values(p.libraries.minigames??{}).map(g=>g.area);
    const anchors=MINIGAME_VARIANTS[variant].site.nearSettlement&&villages.length?villages:[centre,...villages];
    const [area]=suggestMiniGameSites(variant,q,{anchors,bounds:b,avoid,maxDistance:260});
    if(!area){missing.push(variant);continue;}
    const game=createMiniGame(p,variant,area);putMiniGame(p,game);placed.push(game.id);
  }
  return {placed,missing};
}
