/** AUD-V2 — SoundContext: optional facts used to pick a take. Every property is optional:
 * gameplay code that does not know the surface (or anything else) still gets a generic take. */
export const SURFACES=['grass','tallGrass','dirt','mud','sand','gravel','stone','wood','metal','water','snow'] as const;
export const MATERIALS=['soil','softRock','hardRock','metalOre','crystal','wood','vegetation','metal','water','cloth'] as const;
export const MOVEMENTS=['idle','walk','run','jump','land','glide','swim','dive','slide','boat'] as const;
export const INTENSITIES=['light','medium','heavy'] as const;
export const WEATHERS=['clear','cloudy','rain','storm','snow','wind'] as const;
export const TIMES=['dawn','day','dusk','night'] as const;
export const PLACES=['outdoor','forest','plain','valley','village','farm','mine','cave','ruins','coast','beach','ocean','river','lake','waterfall','swamp','desert','mountain','volcano','interior','underwater','menu'] as const;
export const ACTIVITIES=['explore','mining','farming','sailing','mission','puzzle','dialogue','discovery','magic'] as const;
export type Surface=typeof SURFACES[number];
export type Material=typeof MATERIALS[number];
export type Movement=typeof MOVEMENTS[number];
export type Intensity=typeof INTENSITIES[number];
export type Weather=typeof WEATHERS[number];
export type TimeOfDay=typeof TIMES[number];
export type Place=typeof PLACES[number];
export type Activity=typeof ACTIVITIES[number];

export interface SoundContext {
 surface?:Surface;material?:Material;movement?:Movement;intensity?:Intensity;wet?:boolean;weather?:Weather;
 biome?:string;time?:TimeOfDay;place?:Place;activity?:Activity;nearWater?:boolean;
 tool?:string;objectKind?:string;species?:string;state?:string;distance?:number;
}
/** A condition lists accepted values per fact; a variant/cue/layer matches when every listed fact matches. */
export interface SoundCondition {
 surface?:Surface[];material?:Material[];movement?:Movement[];intensity?:Intensity[];wet?:boolean;weather?:Weather[];
 biome?:string[];time?:TimeOfDay[];place?:Place[];activity?:Activity[];nearWater?:boolean;
 tool?:string[];objectKind?:string[];species?:string[];state?:string[];maxDistance?:number;
}
const ENUMS={surface:SURFACES,material:MATERIALS,movement:MOVEMENTS,intensity:INTENSITIES,weather:WEATHERS,time:TIMES,place:PLACES,activity:ACTIVITIES} as const;
const FREE=['biome','tool','objectKind','species','state'] as const;
const FLAGS=['wet','nearWater'] as const;
export const CONDITION_KEYS=[...Object.keys(ENUMS),...FREE,...FLAGS,'maxDistance'] as readonly string[];
const blocked=new Set(['__proto__','prototype','constructor']);
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(v)&&!blocked.has(v);

/** -1 when the condition rejects the context, otherwise its specificity (number of facts tested). */
export function matchCondition(condition:SoundCondition|undefined,context:SoundContext):number {
 if(!condition)return 0;let score=0;
 for(const key of [...Object.keys(ENUMS),...FREE] as (keyof SoundCondition&keyof SoundContext)[]){const accepted=condition[key] as readonly string[]|undefined;if(!accepted)continue;const value=context[key];if(typeof value!=='string'||!accepted.includes(value))return -1;score++;}
 for(const key of FLAGS){const wanted=condition[key];if(wanted===undefined)continue;if((context[key]??false)!==wanted)return -1;score++;}
 if(condition.maxDistance!==undefined){if(context.distance!==undefined&&context.distance>condition.maxDistance)return -1;score++;}
 return score;
}
/** Strict author-side validation (Studio, catalogue files). Throws with an explicit path. */
export function parseCondition(raw:unknown,path:string):SoundCondition {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error(`${path} : condition invalide`);const v=raw as Record<string,unknown>,out:SoundCondition={};
 for(const key of Object.keys(v)){if(blocked.has(key)||!CONDITION_KEYS.includes(key))throw Error(`${path} : critère inconnu « ${key} »`);}
 for(const [key,allowed]of Object.entries(ENUMS)){const list=v[key];if(list===undefined)continue;if(!Array.isArray(list)||!list.length||list.length>allowed.length||!list.every(x=>(allowed as readonly string[]).includes(x as string))||new Set(list).size!==list.length)throw Error(`${path} : valeurs « ${key} » invalides`);(out as Record<string,unknown>)[key]=[...list];}
 for(const key of FREE){const list=v[key];if(list===undefined)continue;if(!Array.isArray(list)||!list.length||list.length>32||!list.every(ident)||new Set(list).size!==list.length)throw Error(`${path} : identifiants « ${key} » invalides`);out[key]=[...list] as string[];}
 for(const key of FLAGS){if(v[key]===undefined)continue;if(typeof v[key]!=='boolean')throw Error(`${path} : « ${key} » doit être booléen`);out[key]=v[key] as boolean;}
 if(v.maxDistance!==undefined){if(typeof v.maxDistance!=='number'||!Number.isFinite(v.maxDistance)||v.maxDistance<0||v.maxDistance>10000)throw Error(`${path} : distance invalide`);out.maxDistance=v.maxDistance;}
 if(!Object.keys(out).length)throw Error(`${path} : condition vide (omettre le champ)`);return out;
}
/** Runtime-side sanitiser: never throws, drops unknown or malformed facts (events must not crash the game). */
export function sanitizeContext(raw:unknown):SoundContext {
 const out:SoundContext={};if(!raw||typeof raw!=='object')return out;const v=raw as Record<string,unknown>;
 for(const [key,allowed]of Object.entries(ENUMS)){const value=v[key];if(typeof value==='string'&&(allowed as readonly string[]).includes(value))(out as Record<string,unknown>)[key]=value;}
 for(const key of FREE){if(ident(v[key]))out[key]=v[key] as string;}
 for(const key of FLAGS){if(typeof v[key]==='boolean')out[key]=v[key] as boolean;}
 if(typeof v.distance==='number'&&Number.isFinite(v.distance)&&v.distance>=0)out.distance=v.distance;
 return out;
}
export const MATERIAL_BY_MINE_KEY:Record<string,Material>={dirt:'soil',rock:'softRock',hard:'hardRock',iron:'metalOre',crystal:'crystal'};
