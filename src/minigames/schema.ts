/**
 * Mini-game instances (doc 107): author data stored in `libraries.minigames`, compiled
 * unchanged into the playable world. Pure validation, no Three.js, no runtime module.
 * Every element is expressed in the AREA frame (x across, z along `heading`, metres),
 * so moving or turning an area in Studio moves its goals, pins, tee, hole and obstacles.
 */
import {MINIGAME_VARIANTS,type MiniGameVariantId} from './catalog.ts';

export type MiniGameElementKind='goal'|'pin'|'tee'|'hole'|'obstacle'|'spawn'|'ball';
export interface MiniGameElementV1 {
  id:string;kind:MiniGameElementKind;x:number;z:number;
  /** Footprint across / along the area frame, height (obstacles and goals). */
  width?:number;depth?:number;height?:number;
  /** Local yaw of an obstacle relative to the area (rad). */
  yaw?:number;
  /** Goal defended by / spawn of this team. */
  teamId?:string;
}
export interface MiniGameTeamV1 {id:string;name:string;color:number}
export interface MiniGameRulesV1 {
  /** Finish when a side reaches this score (football). */scoreTarget?:number;
  /** Hard time limit of the match (s). */timeLimitSeconds?:number;
  /** Throws per round (bowling) or maximum strokes (mini-golf). */attempts?:number;
  /** Rounds / frames per player (bowling). */rounds?:number;
  /** Strokes considered par (mini-golf display only). */par?:number;
  /** Solo practice allowed below `playersMin` (local solo game). */practice?:boolean;
}
export interface MiniGameAreaV1 {x:number;z:number;heading:number;halfWidth:number;halfLength:number}
export interface MiniGameInstanceV1 {
  id:string;version:1;name:string;
  family:'ball';variant:MiniGameVariantId;
  playersMin:number;playersMax:number;
  area:MiniGameAreaV1;
  teams?:MiniGameTeamV1[];
  rules:MiniGameRulesV1;
  elements:MiniGameElementV1[];
}
export interface MiniGameBounds {minX:number;maxX:number;minZ:number;maxZ:number}

export const MINIGAME_ID=/^minigame:[a-zA-Z0-9_-]{1,100}$/;
const LOCAL_ID=/^[a-zA-Z0-9_-]{1,40}$/;
const KINDS:readonly MiniGameElementKind[]=['goal','pin','tee','hole','obstacle','spawn','ball'];
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const only=(v:Record<string,unknown>,keys:readonly string[],label:string)=>{for(const k of Object.keys(v))if(!keys.includes(k))throw Error(label+' : champ inconnu '+k);};

/** Area frame → world XZ. */
export function areaToWorld(area:MiniGameAreaV1,x:number,z:number):{x:number;z:number}{
  const s=Math.sin(area.heading),c=Math.cos(area.heading);
  return {x:area.x+x*c+z*s,z:area.z-x*s+z*c};
}
/** World XZ → area frame. */
export function worldToArea(area:MiniGameAreaV1,x:number,z:number):{x:number;z:number}{
  const s=Math.sin(area.heading),c=Math.cos(area.heading),dx=x-area.x,dz=z-area.z;
  return {x:dx*c-dz*s,z:dx*s+dz*c};
}
/** Radius enclosing the whole area (discovery and proximity). */
export const areaRadius=(a:MiniGameAreaV1)=>Math.hypot(a.halfWidth,a.halfLength);

/** Strict validation at the Studio / compiled boundary. Returns a detached copy. */
export function validateMiniGame(raw:unknown,bounds?:MiniGameBounds):MiniGameInstanceV1{
  if(!isObj(raw))throw Error('Mini-jeu : objet attendu');
  only(raw,['id','version','name','family','variant','playersMin','playersMax','area','teams','rules','elements'],'Mini-jeu');
  if(typeof raw.id!=='string'||!MINIGAME_ID.test(raw.id))throw Error('Mini-jeu : identifiant invalide');
  if(raw.version!==1)throw Error('Mini-jeu : version inconnue');
  if(typeof raw.name!=='string'||raw.name.trim().length<2||raw.name.length>100)throw Error('Mini-jeu : nom invalide');
  const variant=MINIGAME_VARIANTS[raw.variant as MiniGameVariantId];
  if(!variant||raw.family!==variant.family)throw Error('Mini-jeu : famille ou variante inconnue');
  if(!Number.isSafeInteger(raw.playersMin)||!Number.isSafeInteger(raw.playersMax)||
     (raw.playersMin as number)<1||(raw.playersMax as number)<(raw.playersMin as number)||(raw.playersMax as number)>variant.maxPlayers)
    throw Error('Mini-jeu : nombre de joueurs invalide');
  if(!isObj(raw.area))throw Error('Mini-jeu : zone absente');
  only(raw.area,['x','z','heading','halfWidth','halfLength'],'Zone de jeu');
  const a=raw.area;
  if(!num(a.x,-100000,100000)||!num(a.z,-100000,100000)||!num(a.heading,-Math.PI*2,Math.PI*2)||
     !num(a.halfWidth,variant.minHalfSize.width,60)||!num(a.halfLength,variant.minHalfSize.length,80))
    throw Error('Mini-jeu : dimensions de zone invalides');
  const area=a as unknown as MiniGameAreaV1;
  if(bounds){const r=areaRadius(area);if(area.x-r<bounds.minX||area.x+r>bounds.maxX||area.z-r<bounds.minZ||area.z+r>bounds.maxZ)throw Error('Mini-jeu : zone hors de la carte');}
  const teamIds=new Set<string>();
  if(raw.teams!==undefined){
    if(!Array.isArray(raw.teams)||raw.teams.length>4)throw Error('Mini-jeu : équipes invalides');
    for(const t of raw.teams){
      if(!isObj(t))throw Error('Équipe : objet attendu');only(t,['id','name','color'],'Équipe');
      if(typeof t.id!=='string'||!LOCAL_ID.test(t.id)||teamIds.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>40||
         !Number.isSafeInteger(t.color)||(t.color as number)<0||(t.color as number)>0xffffff)throw Error('Équipe invalide');
      teamIds.add(t.id);
    }
  }
  if(variant.teams&&teamIds.size<2)throw Error('Mini-jeu : deux équipes requises');
  if(!isObj(raw.rules))throw Error('Mini-jeu : règles absentes');
  only(raw.rules,['scoreTarget','timeLimitSeconds','attempts','rounds','par','practice'],'Règles');
  const r=raw.rules;
  if(r.scoreTarget!==undefined&&!(Number.isSafeInteger(r.scoreTarget)&&num(r.scoreTarget,1,99))||
     r.timeLimitSeconds!==undefined&&!num(r.timeLimitSeconds,10,3600)||
     r.attempts!==undefined&&!(Number.isSafeInteger(r.attempts)&&num(r.attempts,1,20))||
     r.rounds!==undefined&&!(Number.isSafeInteger(r.rounds)&&num(r.rounds,1,10))||
     r.par!==undefined&&!(Number.isSafeInteger(r.par)&&num(r.par,1,20))||
     r.practice!==undefined&&typeof r.practice!=='boolean')throw Error('Mini-jeu : règles invalides');
  for(const key of variant.requiredRules)if(r[key]===undefined)throw Error('Mini-jeu : règle requise '+key);
  if(!Array.isArray(raw.elements)||raw.elements.length>64)throw Error('Mini-jeu : éléments invalides');
  const ids=new Set<string>(),count:Partial<Record<MiniGameElementKind,number>>={};
  for(const e of raw.elements){
    if(!isObj(e))throw Error('Élément : objet attendu');
    only(e,['id','kind','x','z','width','depth','height','yaw','teamId'],'Élément');
    if(typeof e.id!=='string'||!LOCAL_ID.test(e.id)||ids.has(e.id))throw Error('Élément : identifiant invalide');
    if(!KINDS.includes(e.kind as MiniGameElementKind))throw Error('Élément : type inconnu');
    if(!num(e.x,-area.halfWidth-.01,area.halfWidth+.01)||!num(e.z,-area.halfLength-.01,area.halfLength+.01))throw Error('Élément hors de la zone : '+e.id);
    for(const k of ['width','depth','height'] as const)if(e[k]!==undefined&&!num(e[k],.05,40))throw Error('Élément : dimension invalide '+e.id);
    if(e.yaw!==undefined&&!num(e.yaw,-Math.PI*2,Math.PI*2))throw Error('Élément : orientation invalide');
    if(e.teamId!==undefined&&(typeof e.teamId!=='string'||!teamIds.has(e.teamId)))throw Error('Élément : équipe inconnue '+e.id);
    ids.add(e.id);const k=e.kind as MiniGameElementKind;count[k]=(count[k]??0)+1;
  }
  for(const [kind,[min,max]] of Object.entries(variant.elements) as [MiniGameElementKind,[number,number]][]){
    const n=count[kind]??0;if(n<min||n>max)throw Error(`Mini-jeu : ${n} élément(s) « ${kind} » (attendu ${min}–${max})`);
  }
  for(const kind of Object.keys(count) as MiniGameElementKind[])if(!variant.elements[kind])throw Error('Mini-jeu : élément « '+kind+' » non utilisé par '+variant.label);
  if(variant.teams)for(const team of teamIds)if(!raw.elements.some(e=>isObj(e)&&e.kind==='goal'&&e.teamId===team))throw Error('Mini-jeu : but absent pour l’équipe '+team);
  return structuredClone(raw) as unknown as MiniGameInstanceV1;
}
