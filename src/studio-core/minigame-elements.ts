/** Mini-games as universal Studio elements (doc 107 §Studio): the shared selection, hover,
 * gizmo moves, deletion, duplication and author list work on a whole activity area
 * ('minigame') and on each authored element ('minigameElement', id `<game>#<element>`).
 * Every write goes through putMiniGame, i.e. the same validation as the panel. */
import type {ProjectDocument,PointXZ} from './types.ts';
import {areaToWorld,worldToArea,type MiniGameElementV1,type MiniGameInstanceV1} from '../minigames/schema.ts';
import {MINIGAME_VARIANTS} from '../minigames/catalog.ts';
import {putMiniGame,removeMiniGame,nextMiniGameId} from './minigame-authoring.ts';

export type MiniGameElementKind='minigame'|'minigameElement';
const SEP='#';
const KIND_LABELS:Record<MiniGameElementV1['kind'],string>={goal:'But',pin:'Quille',tee:'Départ',hole:'Trou',obstacle:'Obstacle',spawn:'Point de départ',ball:'Balle',target:'Cible',lane:'Piste',scoreboard:'Tableau de score',decor:'Décoration'};
export const minigameElementId=(gameId:string,elementId:string)=>gameId+SEP+elementId;
function split(id:string){const i=id.lastIndexOf(SEP);return i<0?null:{game:id.slice(0,i),element:id.slice(i+1)};}
function lookup(p:ProjectDocument,kind:MiniGameElementKind,id:string){
  if(kind==='minigame'){const game=p.libraries.minigames?.[id];return game?{game,element:null}:null;}
  const s=split(id),game=s?p.libraries.minigames?.[s.game]:undefined,element=game?.elements.find(e=>e.id===s!.element);
  return game&&element?{game,element}:null;
}
/** Read-only geometry for outlines, anchors and labels (world coordinates). */
export function minigameElementData(p:ProjectDocument,kind:MiniGameElementKind,id:string):({polygon:PointXZ[];name:string}|{x:number;z:number;radius:number;name:string})|undefined{
  const l=lookup(p,kind,id);if(!l)return undefined;const a=l.game.area;
  if(!l.element)return {name:l.game.name,polygon:[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>areaToWorld(a,u*a.halfWidth,v*a.halfLength))};
  const w=areaToWorld(a,l.element.x,l.element.z);
  return {name:KIND_LABELS[l.element.kind]+' · '+l.game.name,x:w.x,z:w.z,radius:Math.max(.35,Math.hypot(l.element.width??.5,l.element.depth??.5)/2)};
}
export function minigameElementLabel(p:ProjectDocument,kind:MiniGameElementKind,id:string){
  const l=lookup(p,kind,id);if(!l)return id;
  return l.element?`${KIND_LABELS[l.element.kind]} (${l.element.id}) · ${l.game.name}`:`${l.game.name} · ${MINIGAME_VARIANTS[l.game.variant].label}`;
}
/** Elements first (their footprint), then the areas containing the point. */
export function minigameElementsAt(p:ProjectDocument,x:number,z:number,tolerance:number):{ref:{kind:MiniGameElementKind;id:string};d:number}[]{
  const out:{ref:{kind:MiniGameElementKind;id:string};d:number}[]=[];
  for(const g of Object.values(p.libraries.minigames??{})){
    const l=worldToArea(g.area,x,z);
    for(const e of g.elements){const r=Math.max(.35,Math.hypot(e.width??.5,e.depth??.5)/2),d=Math.hypot(l.x-e.x,l.z-e.z)-r;if(d<=tolerance)out.push({ref:{kind:'minigameElement',id:minigameElementId(g.id,e.id)},d:d-1});}
    if(Math.abs(l.x)<=g.area.halfWidth&&Math.abs(l.z)<=g.area.halfLength)out.push({ref:{kind:'minigame',id:g.id},d:50});
  }
  return out;
}
/** Gizmo moves: a whole area, or one element converted into the area frame (validated). */
export function moveMinigameElement(draft:ProjectDocument,kind:MiniGameElementKind,id:string,offset:{x:number;z:number}){
  const l=lookup(draft,kind,id);if(!l)return;const g=l.game;
  if(!l.element){putMiniGame(draft,{...g,area:{...g.area,x:round(g.area.x+offset.x),z:round(g.area.z+offset.z)}});return;}
  const s=Math.sin(g.area.heading),c=Math.cos(g.area.heading),dx=offset.x*c-offset.z*s,dz=offset.x*s+offset.z*c;
  putMiniGame(draft,{...g,elements:g.elements.map(e=>e.id===l.element!.id?{...e,x:round(e.x+dx),z:round(e.z+dz)}:e)});
}
export function updateMinigameElement(draft:ProjectDocument,kind:MiniGameElementKind,id:string,patch:Record<string,unknown>){
  const l=lookup(draft,kind,id);if(!l)throw Error('Élément introuvable');const g=l.game;
  if(!l.element)putMiniGame(draft,{...g,...(typeof patch.name==='string'?{name:patch.name}:{}),area:{...g.area,...pick(patch,['x','z','heading'])}});
  else putMiniGame(draft,{...g,elements:g.elements.map(e=>e.id===l.element!.id?{...e,...pick(patch,['x','z','width','depth','height','yaw'])}:e)});
}
/** Deleting an element keeps the activity valid (minimum counts of the variant are checked). */
export function removeMinigameElement(draft:ProjectDocument,kind:MiniGameElementKind,id:string){
  const l=lookup(draft,kind,id);if(!l)return;
  if(!l.element){removeMiniGame(draft,id);return;}
  putMiniGame(draft,{...l.game,elements:l.game.elements.filter(e=>e.id!==l.element!.id)});
}
export function duplicateMinigameElement(draft:ProjectDocument,kind:MiniGameElementKind,id:string,offset:{x:number;z:number}):{kind:MiniGameElementKind;id:string}|null{
  const l=lookup(draft,kind,id);if(!l)return null;const g=l.game;
  if(!l.element){const copy:MiniGameInstanceV1={...structuredClone(g),id:nextMiniGameId(draft,g.variant),name:g.name+' (copie)',area:{...g.area,x:g.area.x+offset.x,z:g.area.z+offset.z}};putMiniGame(draft,copy);return {kind:'minigame',id:copy.id};}
  let n=2;while(g.elements.some(e=>e.id===l.element!.id+'-'+n))n++;
  const copy={...structuredClone(l.element),id:l.element.id+'-'+n,x:round(l.element.x+Math.min(1,g.area.halfWidth/4))};
  putMiniGame(draft,{...g,elements:[...g.elements,copy]});return {kind:'minigameElement',id:minigameElementId(g.id,copy.id)};
}
export function listMinigameElements(p:ProjectDocument):{kind:MiniGameElementKind;id:string}[]{
  return Object.values(p.libraries.minigames??{}).flatMap(g=>[{kind:'minigame' as const,id:g.id},...g.elements.map(e=>({kind:'minigameElement' as const,id:minigameElementId(g.id,e.id)}))]);
}
const round=(v:number)=>Math.round(v*100)/100;
function pick(patch:Record<string,unknown>,keys:string[]){const out:Record<string,number>={};for(const k of keys)if(typeof patch[k]==='number'&&Number.isFinite(patch[k]))out[k]=patch[k] as number;return out;}
