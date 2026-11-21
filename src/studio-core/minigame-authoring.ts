/** Studio V3 authoring of mini-game instances (doc 107). Mutations run inside the shared
 * CommandBus transaction (`session.change`), so Undo/Redo and saving work as for races. */
import type {ProjectDocument} from './types.ts';
import {validateMiniGame,type MiniGameInstanceV1} from '../minigames/schema.ts';
import {defaultMiniGame} from '../minigames/layouts.ts';
import type {MiniGameVariantId} from '../minigames/catalog.ts';

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

