/**
 * Mini-game instances (doc 107): author data stored in `libraries.minigames`, compiled
 * unchanged into the playable world. Pure validation, no Three.js, no runtime module.
 * Every element is expressed in the AREA frame (x across, z along `heading`, metres),
 * so moving or turning an area in Studio moves its goals, pins, tee, hole and obstacles.
 */
import {MINIGAME_VARIANTS,FLOOR_SHAPES,type FloorShape,type MiniGameElementKind,type MiniGameFamilyId,type MiniGameVariantId} from './catalog.ts';
import {MINIGAME_PROP_IDS,validateStyle,type MiniGamePropId,type MiniGameStyleV1} from './themes.ts';

export type {MiniGameElementKind} from './catalog.ts';
export interface MiniGameElementV1 {
  id:string;kind:MiniGameElementKind;x:number;z:number;
  /** Footprint across / along the area frame, height (obstacles and goals); for targets,
   * `height` is the elevation of the target centre above the ground. */
  width?:number;depth?:number;height?:number;
  /** Local yaw of an obstacle relative to the area (rad). */
  yaw?:number;
  /** Goal defended by / spawn of this team. */
  teamId?:string;
  /** Mini-golf hole (0-based) the element belongs to. */
  stage?:number;
  /** Lane relief (kind 'lane') and its slope ratio / bump height. */
  shape?:FloorShape;slope?:number;
  /** Decorative prop (kind 'decor') or score board look (kind 'scoreboard': 'wood'|'stone'). */
  prop?:MiniGamePropId|'wood'|'stone';
}
export interface MiniGameTeamV1 {id:string;name:string;color:number}
export interface MiniGameRulesV1 {
  /** Finish when a side reaches this score (football). */scoreTarget?:number;
  /** Hard time limit of the match (s). */timeLimitSeconds?:number;
  /** Throws per round (bowling) or maximum strokes (mini-golf). */attempts?:number;
  /** Rounds / frames per player (bowling). */rounds?:number;
  /** Strokes considered par (mini-golf display only). */par?:number;
  /** Solo practice allowed below `playersMin` (local solo game). */practice?:boolean;
  /** Default game mode offered at start (variant `modes`, e.g. bowling beginner/normal). */mode?:string;
}
export interface MiniGameAreaV1 {x:number;z:number;heading:number;halfWidth:number;halfLength:number}
export interface MiniGameInstanceV1 {
  id:string;version:1;name:string;
  family:MiniGameFamilyId;variant:MiniGameVariantId;
  playersMin:number;playersMax:number;
  area:MiniGameAreaV1;
  teams?:MiniGameTeamV1[];
  rules:MiniGameRulesV1;
  elements:MiniGameElementV1[];
  /** Presentation options (theme, decoration, effects); absent = automatic. */
  style?:MiniGameStyleV1;
}
export interface MiniGameBounds {minX:number;maxX:number;minZ:number;maxZ:number}

export const MINIGAME_ID=/^minigame:[a-zA-Z0-9_-]{1,100}$/;
const LOCAL_ID=/^[a-zA-Z0-9_-]{1,40}$/;
const KINDS:readonly MiniGameElementKind[]=['goal','pin','tee','hole','obstacle','spawn','ball','target','lane','scoreboard','decor'];
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
  only(raw,['id','version','name','family','variant','playersMin','playersMax','area','teams','rules','elements','style'],'Mini-jeu');
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
  only(raw.rules,['scoreTarget','timeLimitSeconds','attempts','rounds','par','practice','mode'],'Règles');
  const r=raw.rules;
  if(r.scoreTarget!==undefined&&!(Number.isSafeInteger(r.scoreTarget)&&num(r.scoreTarget,1,99))||
     r.timeLimitSeconds!==undefined&&!num(r.timeLimitSeconds,10,3600)||
     r.attempts!==undefined&&!(Number.isSafeInteger(r.attempts)&&num(r.attempts,1,20))||
     r.rounds!==undefined&&!(Number.isSafeInteger(r.rounds)&&num(r.rounds,1,10))||
     r.par!==undefined&&!(Number.isSafeInteger(r.par)&&num(r.par,1,20))||
     r.practice!==undefined&&typeof r.practice!=='boolean'||
     r.mode!==undefined&&!variant.modes?.some(m=>m.id===r.mode))throw Error('Mini-jeu : règles invalides');
  for(const key of variant.requiredRules)if(r[key]===undefined)throw Error('Mini-jeu : règle requise '+key);
  if(!Array.isArray(raw.elements)||raw.elements.length>64)throw Error('Mini-jeu : éléments invalides');
  const ids=new Set<string>(),count:Partial<Record<MiniGameElementKind,number>>={};
  for(const e of raw.elements){
    if(!isObj(e))throw Error('Élément : objet attendu');
    only(e,['id','kind','x','z','width','depth','height','yaw','teamId','stage','shape','slope','prop'],'Élément');
    if(typeof e.id!=='string'||!LOCAL_ID.test(e.id)||ids.has(e.id))throw Error('Élément : identifiant invalide');
    if(!KINDS.includes(e.kind as MiniGameElementKind))throw Error('Élément : type inconnu');
    const out=e.kind==='scoreboard'||e.kind==='decor'?8:.01;
    if(!num(e.x,-area.halfWidth-out,area.halfWidth+out)||!num(e.z,-area.halfLength-out,area.halfLength+out))throw Error('Élément hors de la zone : '+e.id);
    for(const k of ['width','depth','height'] as const)if(e[k]!==undefined&&!num(e[k],.05,40))throw Error('Élément : dimension invalide '+e.id);
    if(e.yaw!==undefined&&!num(e.yaw,-Math.PI*2,Math.PI*2))throw Error('Élément : orientation invalide');
    if(e.teamId!==undefined&&(typeof e.teamId!=='string'||!teamIds.has(e.teamId)))throw Error('Élément : équipe inconnue '+e.id);
    if(e.stage!==undefined&&(!variant.stages||!Number.isSafeInteger(e.stage)||(e.stage as number)<0||(e.stage as number)>8))throw Error('Élément : étape invalide '+e.id);
    if(e.shape!==undefined&&(e.kind!=='lane'||!FLOOR_SHAPES.includes(e.shape as FloorShape))||e.slope!==undefined&&(e.kind!=='lane'||!num(e.slope,0,.3)))throw Error('Élément : relief de piste invalide '+e.id);
    if(e.kind==='decor'?!MINIGAME_PROP_IDS.includes(e.prop as MiniGamePropId):e.kind==='scoreboard'?e.prop!==undefined&&e.prop!=='wood'&&e.prop!=='stone':e.prop!==undefined)throw Error('Élément : décor invalide '+e.id);
    // Presentation elements may stand a little outside the field (stands, score boards).
    ids.add(e.id);const k=e.kind as MiniGameElementKind;count[k]=(count[k]??0)+1;
  }
  for(const [kind,[min,max]] of Object.entries(variant.elements) as [MiniGameElementKind,[number,number]][]){
    const n=count[kind]??0;if(n<min||n>max)throw Error(`Mini-jeu : ${n} élément(s) « ${kind} » (attendu ${min}–${max})`);
  }
  for(const kind of Object.keys(count) as MiniGameElementKind[])if(!variant.elements[kind])throw Error('Mini-jeu : élément « '+kind+' » non utilisé par '+variant.label);
  if(variant.teams)for(const team of teamIds)if(!raw.elements.some(e=>isObj(e)&&e.kind==='goal'&&e.teamId===team))throw Error('Mini-jeu : but absent pour l’équipe '+team);
  if(variant.stages)validateStages((raw.elements as unknown as MiniGameElementV1[]).filter(e=>e.kind!=='scoreboard'&&e.kind!=='decor'));
  if(raw.style!==undefined)validateStyle(raw.style);
  return structuredClone(raw) as unknown as MiniGameInstanceV1;
}

/** Reserved ground of authored mini-games (geography zones: grass, no generated trees),
 * 1 m beyond the area. Only worlds that declare mini-games get these zones. */
export function minigameGeoZones(games:Record<string,MiniGameInstanceV1>|undefined):{kind:'minigame';polygon:{x:number;z:number}[]}[]{
  return Object.values(games??{}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(g=>{
    const w=g.area.halfWidth+1,l=g.area.halfLength+1;
    return {kind:'minigame' as const,polygon:[[-w,-l],[w,-l],[w,l],[-w,l]].map(([x,z])=>{const p=areaToWorld(g.area,x,z);return {x:Math.round(p.x*100)/100,z:Math.round(p.z*100)/100};})};
  });
}

/** Area-frame point → lane frame (u across, v along, metres) of a 'lane' element. */
export function laneLocal(lane:MiniGameElementV1,x:number,z:number){
  const y=lane.yaw??0,c=Math.cos(y),s=Math.sin(y),dx=x-lane.x,dz=z-lane.z;
  return {u:dx*c-dz*s,v:dx*s+dz*c};
}
export const insideLane=(lane:MiniGameElementV1,x:number,z:number,margin=0)=>{const l=laneLocal(lane,x,z);return Math.abs(l.u)<=(lane.width??2)/2+margin&&Math.abs(l.v)<=(lane.depth??6)/2+margin;};
/** Staged course (mini-golf): without lanes = one historical hole over the whole area; with
 * lanes, stages 0…n−1 each have exactly one lane, tee and hole, the tee and the hole inside
 * their lane, and every staged element points to an existing stage. */
function validateStages(elements:readonly MiniGameElementV1[]){
  const lanes=elements.filter(e=>e.kind==='lane');
  if(!lanes.length){if(elements.filter(e=>e.kind==='tee').length!==1||elements.filter(e=>e.kind==='hole').length!==1||elements.some(e=>e.stage!==undefined&&e.stage!==0))throw Error('Mini-jeu : un départ et un trou sans piste');return;}
  for(let k=0;k<lanes.length;k++){
    const of=(kind:string)=>elements.filter(e=>e.kind===kind&&e.stage===k);
    const [lane]=of('lane'),tees=of('tee'),holes=of('hole');
    if(!lane||of('lane').length!==1||tees.length!==1||holes.length!==1)throw Error('Mini-jeu : le trou '+(k+1)+' doit avoir une piste, un départ et un trou');
    if(!insideLane(lane,tees[0].x,tees[0].z)||!insideLane(lane,holes[0].x,holes[0].z))throw Error('Mini-jeu : départ ou trou hors de la piste '+(k+1));
  }
  for(const e of elements)if(e.stage===undefined||e.stage>=lanes.length)throw Error('Mini-jeu : élément sans trou valide '+e.id);
}
