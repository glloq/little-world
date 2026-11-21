/** Studio V3 authoring of mini-game instances (doc 107). Mutations run inside the shared
 * CommandBus transaction (`session.change`), so Undo/Redo and saving work as for races. */
import type {ProjectDocument} from './types.ts';
import {areaToWorld,validateMiniGame,type MiniGameInstanceV1} from '../minigames/schema.ts';
import {defaultMiniGame,minigolfHole,MINIGOLF_COURSE,MINIGOLF_LANE} from '../minigames/layouts.ts';
import {MINIGAME_VARIANTS,type FloorShape,type MiniGameVariantId} from '../minigames/catalog.ts';
import {EARTHWORK_LIMIT,type EarthworkV1} from '../geography/earthworks.ts';

export const MAX_MINIGAMES=64;
export function putMiniGame(document:ProjectDocument,game:MiniGameInstanceV1){
  const all=document.libraries.minigames??{};
  if(Object.keys(all).length>=MAX_MINIGAMES&&!all[game.id])throw Error(MAX_MINIGAMES+' mini-jeux maximum');
  const parsed=validateMiniGame(structuredClone(game),document.world.bounds);
  document.libraries.minigames={...all,[parsed.id]:parsed};
  syncMiniGamePad(document,parsed);
}
export function removeMiniGame(document:ProjectDocument,id:string){
  if(!document.libraries.minigames?.[id])return;
  removeMiniGamePad(document,id); // Its grading goes with it (natural relief back).
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
/** Replace the layout by the variant template while keeping identity, area, players and rules.
 * Staged courses (mini-golf) are not stretched: the area grows to the template if needed. */
export function resetMiniGameLayout(game:MiniGameInstanceV1):MiniGameInstanceV1{
  const t=defaultMiniGame(game.variant,{id:game.id,x:0,z:0});
  if(MINIGAME_VARIANTS[game.variant].stages){
    const area={...game.area,halfWidth:Math.max(game.area.halfWidth,t.area.halfWidth),halfLength:Math.max(game.area.halfLength,t.area.halfLength)};
    return {...game,area,teams:t.teams,elements:t.elements};
  }
  const sx=game.area.halfWidth/t.area.halfWidth,sz=game.area.halfLength/t.area.halfLength;
  return {...game,teams:t.teams,elements:t.elements.map(e=>({...e,x:Math.round(e.x*sx*100)/100,z:Math.round(e.z*sz*100)/100}))};
}

/* ---------------- Mini-golf course editing (doc 107 §parcours). ---------------------------- */
const lanes=(g:MiniGameInstanceV1)=>g.elements.filter(e=>e.kind==='lane');
/** Hole types offered by Studio (index into MINIGOLF_COURSE); 5 = chicane (two baffles). */
export const GOLF_HOLE_TYPES=MINIGOLF_COURSE.map((c,i)=>({id:i,label:c.name}));
/** Appends a hole of `type` in the first free slot of the area (the area grows if full). */
export function addGolfHole(game:MiniGameInstanceV1,type:number):MiniGameInstanceV1{
  const kind=MINIGOLF_COURSE[type];if(!kind)throw Error('Type de trou inconnu');
  const existing=lanes(game),k=existing.length,max=MINIGAME_VARIANTS.minigolf.elements.lane?.[1]??9;
  if(!MINIGAME_VARIANTS[game.variant].stages)throw Error('Ce mini-jeu n’a pas de parcours');
  if(!k)throw Error('Trou unique historique : appliquez d’abord « Disposition par défaut » (parcours)');
  if(k>=max)throw Error(max+' trous maximum');
  const L=MINIGOLF_LANE,free=(area:MiniGameInstanceV1['area'])=>{
    for(let z=-area.halfLength+L.depth/2+.4;z<=area.halfLength-L.depth/2-.4+1e-6;z+=L.depth+1.8)
      for(let x=-area.halfWidth+L.width/2+.4;x<=area.halfWidth-L.width/2-.4+1e-6;x+=L.width+1.2)
        if(existing.every(l=>{const r=Math.hypot((l.width??2)/2,(l.depth??6)/2),flat=Math.abs(Math.sin(l.yaw??0))<.01;
          return flat?Math.abs(l.x-x)>((l.width??2)+L.width)/2+.5||Math.abs(l.z-z)>((l.depth??6)+L.depth)/2+.5:Math.hypot(l.x-x,l.z-z)>r+L.depth/2+.5;}))return {x:Math.round(x*100)/100+0,z:Math.round(z*100)/100+0};
    return null;
  };
  let area=game.area,slot=free(area);
  if(!slot){area={...area,halfLength:Math.round((area.halfLength+L.depth+1.8)*100)/100};slot=free(area);}
  if(!slot)throw Error('Pas de place pour un nouveau trou : élargissez la zone');
  const used=new Set(game.elements.map(e=>e.id));let n=k+1;while(['lane-','tee-','hole-'].some(p=>used.has(p+n)))n++;
  const yaw=k%2?Math.PI:0,parts=minigolfHole(k,slot.x,slot.z,yaw,kind.shape,kind.slope).map(e=>({...e,id:e.id.replace(/-\d+$/,'-'+n)}));
  if(type===5){const c=Math.cos(yaw);for(const [side,v] of [[-1,-1],[1,1]] as const){let m=1;while(used.has(`baffle-${n}-${m}`))m++;used.add(`baffle-${n}-${m}`);
    parts.push({id:`baffle-${n}-${m}`,kind:'obstacle',stage:k,x:Math.round((slot.x+side*.3*c)*100)/100+0,z:Math.round((slot.z+v*c)*100)/100+0,width:1,depth:.2,height:.3});}}
  return validateMiniGame({...game,area,elements:[...game.elements,...parts]});
}
/** Removes hole `stage` (its lane, tee, hole and obstacles); later holes move up by one. */
export function removeGolfHole(game:MiniGameInstanceV1,stage:number):MiniGameInstanceV1{
  if(lanes(game).length<=1)throw Error('Un parcours garde au moins un trou');
  const elements=game.elements.filter(e=>e.stage!==stage).map(e=>e.stage!==undefined&&e.stage>stage?{...e,stage:e.stage-1}:e);
  return validateMiniGame({...game,elements});
}
/** Changes the relief of one hole's lane (flat, ramps, bank, bumps) and its slope. */
export function setGolfHoleShape(game:MiniGameInstanceV1,stage:number,shape:FloorShape,slope:number):MiniGameInstanceV1{
  const elements=game.elements.map(e=>{
    if(e.kind!=='lane'||e.stage!==stage)return e;const next={...e};
    if(shape==='flat'){delete next.shape;delete next.slope;}else{next.shape=shape;next.slope=Math.max(0,Math.min(.3,Math.round(slope*100)/100));}
    return next;
  });
  return validateMiniGame({...game,elements});
}
/** Grading of a mini-game (doc 107 §sols): one flat earthwork pad under the area plus its
 * decoration margin, at the MEAN natural ground level (cut and fill balance), with a gentle
 * talus. The activity floor then lies a few centimetres above a smoothed, level ground
 * instead of being raised to the highest point. Its id is owned by the mini-game. */
export const MINIGAME_PAD={margin:1.5,talusM:4} as const;
export const miniGamePadId=(id:string)=>'pad:'+id;
function padPolygon(game:MiniGameInstanceV1){
  const {halfWidth:w,halfLength:l}=game.area,m=MINIGAME_PAD.margin;
  return [[-w-m,-l-m],[w+m,-l-m],[w+m,l+m],[-w-m,l+m]].map(([x,z])=>{const p=areaToWorld(game.area,x,z);return {x:Math.round(p.x*100)/100,z:Math.round(p.z*100)/100};});
}
export function miniGameGroundPad(game:MiniGameInstanceV1,height:(x:number,z:number)=>number,seaLevel:number):Extract<EarthworkV1,{kind:'pad'}>{
  const {halfWidth:w,halfLength:l}=game.area;let sum=0,n=0;
  for(let x=-w;x<=w+1e-6;x+=Math.max(.5,w/8))for(let z=-l;z<=l+1e-6;z+=Math.max(.5,l/8)){const p=areaToWorld(game.area,x,z);sum+=height(p.x,p.z);n++;}
  return {id:miniGamePadId(game.id),kind:'pad',polygon:padPolygon(game),levelM:Math.round((sum/n-seaLevel)*100)/100,talusM:MINIGAME_PAD.talusM};
}
const padsOf=(document:ProjectDocument)=>document.world.terrain?.kind==='archipelago'?document.world.terrain.archipelago.earthworks??[]:[];
/** The pad of a mini-game, if graded. */
export const miniGamePad=(document:ProjectDocument,id:string)=>padsOf(document).find(w=>w.id===miniGamePadId(id));
/** Keeps an existing pad under its mini-game when the area moves, turns or is resized (same
 * level; « Aplanir le terrain » recomputes it from the natural ground). */
function syncMiniGamePad(document:ProjectDocument,game:MiniGameInstanceV1){
  const pad=miniGamePad(document,game.id);if(!pad||pad.kind!=='pad')return;
  const polygon=padPolygon(game);if(JSON.stringify(polygon)===JSON.stringify(pad.polygon))return;
  document.world.terrain=structuredClone(document.world.terrain);const a=(document.world.terrain as {archipelago:{earthworks?:EarthworkV1[]}}).archipelago;
  a.earthworks=(a.earthworks??[]).map(w=>w.id===pad.id?{...pad,polygon}:w);
}
export function removeMiniGamePad(document:ProjectDocument,id:string){
  if(!miniGamePad(document,id))return;
  document.world.terrain=structuredClone(document.world.terrain);const a=(document.world.terrain as {archipelago:{earthworks?:EarthworkV1[]}}).archipelago;
  const kept=(a.earthworks??[]).filter(w=>w.id!==miniGamePadId(id));if(kept.length)a.earthworks=kept;else delete a.earthworks;
}
/** Writes (or replaces) the pad of a mini-game in the archipelago earthworks. */
export function flattenMiniGameGround(document:ProjectDocument,game:MiniGameInstanceV1,height:(x:number,z:number)=>number){
  if(document.world.terrain?.kind!=='archipelago')throw Error('Aplanir le terrain demande un relief insulaire');
  const pad=miniGameGroundPad(game,height,document.world.seaLevel);
  document.world.terrain=structuredClone(document.world.terrain);const a=document.world.terrain.archipelago;
  const list=(a.earthworks??[]).filter(w=>w.id!==pad.id);
  if(list.length>=EARTHWORK_LIMIT)throw Error(EARTHWORK_LIMIT+' terrassements maximum');
  a.earthworks=[...list,pad];return pad;
}
