/** Studio V3 authoring of mini-game instances (doc 107). Mutations run inside the shared
 * CommandBus transaction (`session.change`), so Undo/Redo and saving work as for races. */
import type {ProjectDocument} from './types.ts';
import {validateMiniGame,type MiniGameInstanceV1} from '../minigames/schema.ts';
import {defaultMiniGame} from '../minigames/layouts.ts';
import {MINIGAME_VARIANTS,type MiniGameVariantId} from '../minigames/catalog.ts';
import {suggestMiniGameSites,type SiteQueries} from '../minigames/sites.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';

export const MAX_MINIGAMES=64;
export function putMiniGame(document:ProjectDocument,game:MiniGameInstanceV1){
  const all=document.libraries.minigames??{};
  if(Object.keys(all).length>=MAX_MINIGAMES&&!all[game.id])throw Error(MAX_MINIGAMES+' mini-jeux maximum');
  const parsed=validateMiniGame(structuredClone(game),document.world.bounds);
  document.libraries.minigames={...all,[parsed.id]:parsed};
}
export function removeMiniGame(document:ProjectDocument,id:string){
  if(!document.libraries.minigames?.[id])return;
  const next={...document.libraries.minigames};delete next[id];
  document.libraries.minigames=Object.keys(next).length?next:undefined;
  if(!document.libraries.minigames)delete document.libraries.minigames;
}
/** First free stable id `minigame:<variant>-<n>`. */
export function nextMiniGameId(document:ProjectDocument,variant:MiniGameVariantId){
  const used=new Set(Object.keys(document.libraries.minigames??{}));
  for(let n=1;;n++){const id=`minigame:${variant}-${n}`;if(!used.has(id))return id;}
}
/** New instance of a template at a position, several instances of a variant allowed. */
export function createMiniGame(document:ProjectDocument,variant:MiniGameVariantId,at:{x:number;z:number;heading?:number},name?:string){
  const id=nextMiniGameId(document,variant),n=id.split('-').at(-1);
  const game=defaultMiniGame(variant,{id,x:Math.round(at.x*10)/10,z:Math.round(at.z*10)/10,heading:Math.round((at.heading??0)*100)/100});
  return {...game,name:name??`${game.name} ${n}`};
}
/** Replace the layout by the variant template while keeping identity, area, players and rules. */
export function resetMiniGameLayout(game:MiniGameInstanceV1):MiniGameInstanceV1{
  const t=defaultMiniGame(game.variant,{id:game.id,x:0,z:0});
  const sx=game.area.halfWidth/t.area.halfWidth,sz=game.area.halfLength/t.area.halfLength;
  return {...game,teams:t.teams,elements:t.elements.map(e=>({...e,x:Math.round(e.x*sx*100)/100,z:Math.round(e.z*sz*100)/100}))};
}

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
