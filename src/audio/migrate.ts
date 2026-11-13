/** AUD-V2 — pure, non-destructive V1 → V2 migration. The V1 object is never mutated; every V1
 * `soundId` becomes an event with the *same id*, so interaction actions and emitters keep working,
 * and the V1 day/night music and rain/water/night ambience keep the same audible behaviour. */
import {inspectWav} from './wav.ts';
import {base64Bytes,parseAudioDefinition,type AudioDefinition} from './schema.ts';
import {parseAudioDefinitionV2,type AudioAssetV2,type AudioDefinitionV2,type AmbienceLayer,type SoundEventV2} from './catalog.ts';

export type AnyAudioDefinition=AudioDefinition|AudioDefinitionV2;
/** Semantic events emitted by the game router, bound to V1 sounds when those exist. */
export const LEGACY_SEMANTIC_ALIASES:Record<string,{legacy:string;category:SoundEventV2['category'];description:string}>={
 'player.footstep':{legacy:'step',category:'movement',description:'Pas du joueur (repli vers le son V1 « step »)'},
 'interaction.collect':{legacy:'collect',category:'interaction',description:'Collecte (repli vers le son V1 « collect »)'},
 'interaction.lever':{legacy:'lever',category:'interaction',description:'Levier (repli vers le son V1 « lever »)'},
 'mission.progress':{legacy:'mission',category:'mission',description:'Étape de mission (repli vers le son V1 « mission »)'},
 'ambience.water.river':{legacy:'water',category:'ambience',description:'Eau proche (repli vers le son V1 « water »)'},
 'weather.rain':{legacy:'rain',category:'weather',description:'Pluie (repli vers le son V1 « rain »)'},
};
const legacyEvent=(id:string,patch:Partial<SoundEventV2>):SoundEventV2=>({id,category:'legacy',bus:'sfx',variants:[],gain:1,pitch:1,pitchJitter:0,gainJitter:0,cooldownMs:0,priority:4,maxInstances:16,steal:'oldest',spatial:true,radius:40,loop:false,repeat:'random',maxLatencyMs:0,...patch});

export function migrateAudioV1toV2(input:AudioDefinition):AudioDefinitionV2 {
 const v1=parseAudioDefinition(input),assets:Record<string,AudioAssetV2>={};
 for(const a of Object.values(v1.assets)){
  const asset:AudioAssetV2={id:a.id,name:a.name,kind:a.kind,format:a.kind==='midi'?'midi':'wav',status:'GENERATED',license:a.license,source:a.source,usage:a.kind==='midi'?'music':'sfx',bytesBase64:a.bytesBase64,notes:'Migré depuis le schéma audio V1.'};
  if(a.kind==='sample'){const info=inspectWav(base64Bytes(a.bytesBase64));Object.assign(asset,{duration:Math.round(info.duration*1e4)/1e4,channels:info.channels as 1|2,sampleRate:info.sampleRate,estimatedDecodedBytes:Math.ceil(info.duration*48000)*info.channels*4});}
  assets[a.id]=asset;
 }
 const events:Record<string,SoundEventV2>={};
 // V1 played every sound with gain/pitch from its definition, priority 4, radius 40 when positioned.
 for(const s of Object.values(v1.sounds))events[s.id]=legacyEvent(s.id,{description:'Son V1 migré',variants:[{assetId:s.assetId,weight:1}],gain:s.gain,pitch:s.pitch});
 for(const [id,alias]of Object.entries(LEGACY_SEMANTIC_ALIASES))if(events[alias.legacy]&&!events[id])events[id]=legacyEvent(id,{category:alias.category,description:alias.description,fallback:alias.legacy,bus:alias.category==='ambience'||alias.category==='weather'?'ambience':'sfx'});
 const cues:AudioDefinitionV2['music']['cues']={};
 if(v1.music.day)cues['explore.day']={id:'explore.day',scoreIds:[v1.music.day],when:{time:['dawn','day','dusk']},priority:1,kind:'loop',transition:'bar'};
 if(v1.music.night)cues['explore.night']={id:'explore.night',scoreIds:[v1.music.night],when:{time:['night']},priority:1,kind:'loop',transition:'bar'};
 // V1 order and priorities: rain (2) before water (1) before night (1), capped by the budget's ambienceLayers.
 const layers:AmbienceLayer[]=[];
 if(v1.ambience.rain)layers.push({id:'rain',role:'weather',eventId:v1.ambience.rain,when:{weather:['rain']},priority:2,gain:1});
 if(v1.ambience.water)layers.push({id:'water',role:'source',eventId:v1.ambience.water,when:{nearWater:true},priority:1,gain:1});
 if(v1.ambience.night)layers.push({id:'night',role:'bed',eventId:v1.ambience.night,when:{time:['night']},priority:1,gain:1});
 const ambience:AudioDefinitionV2['ambience']=layers.length?{legacy:{id:'legacy',priority:0,global:true,fadeSeconds:.05,layers}}:{};
 return parseAudioDefinitionV2({schemaVersion:2,meta:{catalogVersion:'migrated-v1'},patchIds:[...v1.patchIds],assets,scores:structuredClone(v1.scores),events,music:{cues},ambience,emitters:structuredClone(v1.emitters)});
}
/** Reads either version without converting (Studio keeps V1 projects until the author migrates). */
export function parseAnyAudioDefinition(raw:unknown):AnyAudioDefinition {
 const version=raw&&typeof raw==='object'?(raw as {schemaVersion?:unknown}).schemaVersion:undefined;
 if(version===2)return parseAudioDefinitionV2(raw);if(version===1)return parseAudioDefinition(raw);throw Error('Version de définition audio inconnue');
}
/** Runtime entry point: any supported version → validated V2 catalogue. */
export function toAudioCatalog(raw:unknown):AudioDefinitionV2 {const parsed=parseAnyAudioDefinition(raw);return parsed.schemaVersion===2?parsed:migrateAudioV1toV2(parsed);}
/** IDs accepted by `playSound` actions and emitters, whatever the version. */
export function audioSoundIds(audio:AnyAudioDefinition|undefined):string[] {return !audio?[]:audio.schemaVersion===2?Object.keys(audio.events):Object.keys(audio.sounds);}
/** Non-destructive merge used by Studio « Installer le catalogue » on an existing project:
 * everything already in `base` (author data, migrated V1 sounds) wins; only missing ids are added.
 * A migrated V1 `legacy` ambience already covers rain/water/night, so the built-in global
 * profiles are not added on top of it (no doubled layers). */
export function mergeAudioCatalogs(base:AudioDefinitionV2,addition:AudioDefinitionV2):AudioDefinitionV2 {
 const out=structuredClone(base),add=structuredClone(addition);
 for(const key of ['assets','scores','events'] as const)for(const [id,value]of Object.entries(add[key]))if(!Object.hasOwn(out[key],id))(out[key] as Record<string,unknown>)[id]=value;
 // Untouched aliases created by the migration (no take, fallback to the V1 sound) give way to the
 // richer built-in event, whose fallback chain still ends on the same V1 sound.
 for(const [id,alias]of Object.entries(LEGACY_SEMANTIC_ALIASES)){const mine=out.events[id],theirs=add.events[id];if(mine&&theirs&&!mine.variants.length&&mine.fallback===alias.legacy&&theirs.fallback===alias.legacy)out.events[id]=theirs;}
 for(const [id,cue]of Object.entries(add.music.cues))if(!Object.hasOwn(out.music.cues,id)&&!(Object.values(out.music.cues).some(c=>c.kind==='loop'&&JSON.stringify(c.when)===JSON.stringify(cue.when))))out.music.cues[id]=cue;
 const legacy=Object.hasOwn(out.ambience,'legacy');for(const [id,profile]of Object.entries(add.ambience))if(!Object.hasOwn(out.ambience,id)&&!(legacy&&profile.global))out.ambience[id]=profile;
 out.patchIds=[...new Set([...out.patchIds,...add.patchIds])].slice(0,10);out.meta={catalogVersion:add.meta?.catalogVersion??'merged',description:'Catalogue fusionné : données du projet conservées, entrées manquantes ajoutées.'};
 return parseAudioDefinitionV2(out);
}
