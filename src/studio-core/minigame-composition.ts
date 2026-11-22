/** Terrain-aware placement of mini-games (Studio analysis and island composition). Kept out
 * of minigame-authoring.ts so the Studio core (elements, selection) never loads the site
 * search nor the race-placement environment. */
import type {ProjectDocument} from './types.ts';
import {MINIGAME_VARIANTS,type MiniGameVariantId} from '../minigames/catalog.ts';
import {suggestMiniGameSites,type SiteQueries} from '../minigames/sites.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';
import {createMiniGame,flattenMiniGameGround,miniGamePadId,putMiniGame} from './minigame-authoring.ts';
import type {MiniGameInstanceV1} from '../minigames/schema.ts';

/** Terrain queries of a project for mini-game sites (Studio analysis AND composition), from
 * the same environment as race placement: relief, water and occupation (buildings, paths,
 * reserved zones). The project's own mini-games are excluded (their ground is reserved). */
export function projectSiteQueries(p:ProjectDocument):SiteQueries{
  const env=projectRaceTerrainEnvironment({...p,libraries:{...p.libraries,minigames:undefined}});
  return {height:env.height,water:(x,z)=>env.water(x,z,env.height(x,z)),
    obstacles:(minX,maxX,minZ,maxZ)=>{const out:{x:number;z:number;r:number}[]=[];for(let x=minX;x<=maxX;x+=2)for(let z=minZ;z<=maxZ;z+=2){const o=env.occupation(x,z);if(o&&o!=='none')out.push({x,z,r:.5});}return out;}};
}
/** Grades the ground under a mini-game (pad at the mean NATURAL level: its own previous pad
 * is ignored while sampling). No-op on terrains without earthworks (historical valley). */
export function gradeMiniGame(p:ProjectDocument,game:MiniGameInstanceV1){
  if(p.world.terrain?.kind!=='archipelago')return null;
  const t=p.world.terrain,natural={...p,world:{...p.world,terrain:{...t,archipelago:{...t.archipelago,earthworks:(t.archipelago.earthworks??[]).filter(w=>w.id!==miniGamePadId(game.id))}}}} as ProjectDocument;
  return flattenMiniGameGround(p,game,projectSiteQueries(natural).height);
}
/** Composition (opt-in `generation.activities.minigames`): one instance per requested variant
 * on suitable ground — near villages when the variant says so, otherwise around the island
 * centre — then its ground is graded (pad, doc 107 §sols). A variant without a site is
 * reported, not forced. */
export function composeMiniGames(p:ProjectDocument,variants:readonly MiniGameVariantId[]):{placed:string[];missing:MiniGameVariantId[]}{
  const q=projectSiteQueries(p),b=p.world.bounds,placed:string[]=[],missing:MiniGameVariantId[]=[];
  const villages=Object.values(p.libraries.settlements??{}).map(s=>s.recipe.center).sort((a,c)=>a.x-c.x||a.z-c.z);
  const centre={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2};
  for(const variant of variants){
    const avoid=Object.values(p.libraries.minigames??{}).map(g=>g.area);
    const anchors=MINIGAME_VARIANTS[variant].site.nearSettlement&&villages.length?villages:[centre,...villages];
    const [area]=suggestMiniGameSites(variant,q,{anchors,bounds:b,avoid,maxDistance:260});
    if(!area){missing.push(variant);continue;}
    const game=createMiniGame(p,variant,area);putMiniGame(p,game);gradeMiniGame(p,game);placed.push(game.id);
  }
  return {placed,missing};
}
