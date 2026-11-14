/** World Production V1 — authoring contract of landscape instances (WP-4).
 * Stored in the V3 source as the OPTIONAL library `libraries.landscapes` (older projects stay
 * valid without migration). An instance is a re-editable prescription (preset id + version +
 * seed + footprint + a few parameters) plus the record of what it generated, so that a
 * regeneration can tell untouched generated content from the author's manual corrections.
 * Pure module (no Studio/Three.js import), validated by the project parser. */
import type {MaskLayerId} from '../geography/layers.ts';
import {MASK_LAYERS,validMaskString} from '../geography/layers.ts';

export const LANDSCAPE_PRESET_IDS=['forest-valley','river-bend','rocky-cliff','sandy-beach','marsh-basin','mountain-pass','waterfall-gorge','volcanic-field','ancient-ruins','village-clearing','castle-town','fishing-port','mountain-hamlet','mine-camp','forest-camp','landmark-site','woodland'] as const;
export type LandscapePresetId=typeof LANDSCAPE_PRESET_IDS[number];
export type LandscapeParams=Record<string,number|boolean>;
/** What an instance produced (ids → canonical hash at generation time) and, per sector and
 * layer, the mask codes it painted ('.' elsewhere). */
export interface LandscapeGenerated {
  revision:number;
  features:Record<string,string>;water:Record<string,string>;paths:Record<string,string>;entities:Record<string,string>;zones:Record<string,string>;
  /** Gameplay libraries owned by the instance (NPC routines, dialogues, quests, items). Optional. */
  behaviors?:Record<string,string>;dialogues?:Record<string,string>;objectives?:Record<string,string>;items?:Record<string,string>;interactions?:Record<string,string>;
  masks:Record<string,Partial<Record<MaskLayerId,string>>>;
}
export interface LandscapeInstanceV1 {
  id:string;presetId:LandscapePresetId;presetVersion:number;name:string;seed:number;
  center:{x:number;z:number};width:number;length:number;
  /** Radians, counter-clockwise from +X (same frame as LandscapeRegion). */
  rotation:number;
  params:LandscapeParams;
  generated?:LandscapeGenerated;
}
export const LANDSCAPE_LIMITS={instances:400,size:[40,3000] as [number,number],params:16,generatedIds:2000};
/** Canonical JSON (sorted keys) → stable fingerprint, independent of property order. */
export function canonical(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  const o=value as Record<string,unknown>;return '{'+Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(o[k])).join(',')+'}';
}
export function fingerprint(value:unknown):string{
  const text=canonical(value);let h1=0x811c9dc5,h2=0x01000193;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,0x5bd1e995)^(h2>>>15);}
  return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
}
export const emptyGenerated=():LandscapeGenerated=>({revision:0,features:{},water:{},paths:{},entities:{},zones:{},behaviors:{},dialogues:{},objectives:{},items:{},interactions:{},masks:{}});
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const ID=/^[a-zA-Z0-9_:.-]{1,48}$/;
/** Strict validation of one instance (bounds of the world, known preset, bounded params). */
export function validateLandscape(value:unknown,bounds:{minX:number;maxX:number;minZ:number;maxZ:number}):LandscapeInstanceV1{
  if(!record(value))throw Error('Paysage invalide');
  for(const key of Object.keys(value))if(!['id','presetId','presetVersion','name','seed','center','width','length','rotation','params','generated'].includes(key))throw Error('Paysage : champ inconnu '+key);
  const v=value as unknown as LandscapeInstanceV1;
  if(typeof v.id!=='string'||!ID.test(v.id))throw Error('Paysage : identifiant invalide');
  if(!(LANDSCAPE_PRESET_IDS as readonly string[]).includes(v.presetId))throw Error('Paysage : preset inconnu');
  if(!Number.isInteger(v.presetVersion)||v.presetVersion<1||v.presetVersion>99)throw Error('Paysage : version invalide');
  if(typeof v.name!=='string'||!v.name.trim()||v.name.length>100)throw Error('Paysage : nom requis');
  if(!Number.isSafeInteger(v.seed)||v.seed<0||v.seed>0xffffffff)throw Error('Paysage : graine invalide');
  if(!record(v.center)||Object.keys(v.center).some(k=>k!=='x'&&k!=='z')||!finite(v.center.x,bounds.minX,bounds.maxX)||!finite(v.center.z,bounds.minZ,bounds.maxZ))throw Error('Paysage : centre hors du monde');
  const [lo,hi]=LANDSCAPE_LIMITS.size;if(!finite(v.width,lo,hi)||!finite(v.length,lo,hi))throw Error('Paysage : emprise hors limites');
  if(!finite(v.rotation,-Math.PI*2,Math.PI*2))throw Error('Paysage : orientation invalide');
  if(!record(v.params)||Object.keys(v.params).length>LANDSCAPE_LIMITS.params)throw Error('Paysage : paramètres invalides');
  for(const [k,p]of Object.entries(v.params))if(!/^[a-zA-Z]{1,32}$/.test(k)||!(typeof p==='boolean'||finite(p,-1e6,1e6)))throw Error('Paysage : paramètre invalide '+k);
  if(v.generated!==undefined){
    const g=v.generated;if(!record(g))throw Error('Paysage : trace de génération invalide');
    for(const key of Object.keys(g))if(!['revision','features','water','paths','entities','zones','masks','behaviors','dialogues','objectives','items','interactions'].includes(key))throw Error('Paysage : trace inconnue '+key);
    if(!Number.isInteger(g.revision)||g.revision<0)throw Error('Paysage : révision invalide');
    let n=0;
    for(const key of ['features','water','paths','entities','zones','behaviors','dialogues','objectives','items','interactions'] as const){if(g[key]===undefined&&!['features','water','paths','entities','zones'].includes(key))continue;if(!record(g[key]))throw Error('Paysage : trace '+key);for(const [id,h]of Object.entries(g[key])){n++;if(typeof id!=='string'||!id.length||id.length>128||typeof h!=='string'||!/^[0-9a-f]{16}$/.test(h))throw Error('Paysage : empreinte invalide');}}
    if(n>LANDSCAPE_LIMITS.generatedIds)throw Error('Paysage : trop d’éléments générés');
    if(!record(g.masks))throw Error('Paysage : masques');
    for(const [chunk,layers]of Object.entries(g.masks)){if(!/^-?\d+:-?\d+$/.test(chunk)||!record(layers))throw Error('Paysage : masque de secteur');for(const [layer,mask]of Object.entries(layers))if(!(MASK_LAYERS as string[]).includes(layer)||!validMaskString(layer as MaskLayerId,mask))throw Error('Paysage : masque invalide');}
  }
  return v;
}
