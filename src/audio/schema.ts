import {inspectWav} from './wav.ts';
import {parseMidi} from './midi.ts';
export const PATCHES={flute:{name:'Flûte douce',wave:'triangle',attack:.04,decay:.08,sustain:.6,release:.16,gain:.12},pluck:{name:'Cordes pincées',wave:'triangle',attack:.006,decay:.18,sustain:.12,release:.1,gain:.16},harp:{name:'Harpe',wave:'sine',attack:.004,decay:.3,sustain:.1,release:.22,gain:.2},bell:{name:'Clochette',wave:'sine',attack:.003,decay:.25,sustain:.06,release:.3,gain:.14},'soft-drum':{name:'Percussion douce',wave:'sine',attack:.003,decay:.06,sustain:.02,release:.04,gain:.2}} as const;
export type PatchId=keyof typeof PATCHES;
export interface AudioAsset {id:string;name:string;kind:'midi'|'sample';mime:'audio/midi'|'audio/wav';bytesBase64:string;license:string;source:string;}
export interface AudioScoreDefinition {id:string;assetId:string;programMap:Record<string,PatchId>;loop:boolean;gain:number;}
export interface SoundDefinition {id:string;assetId:string;gain:number;pitch:number;}
export interface AudioEmitter {id:string;entityId?:string;position?:{x:number;y:number;z:number};soundId:string;radius:number;loop:boolean;priority:number;}
export interface AudioDefinition {schemaVersion:1;patchIds:PatchId[];assets:Record<string,AudioAsset>;scores:Record<string,AudioScoreDefinition>;sounds:Record<string,SoundDefinition>;music:{day?:string;night?:string};ambience:{water?:string;rain?:string;night?:string};emitters:AudioEmitter[];}
const blocked=new Set(['__proto__','prototype','constructor']);
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=128):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!blocked.has(v);
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>blocked.has(k)||!allowed.includes(k)))throw Error('Champ audio inconnu');}
export function base64Bytes(value:string):Uint8Array {if(value.length>1_400_000||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Données audio base64 invalides');const raw=atob(value);return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export function encodeBase64(bytes:Uint8Array):string {let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
export function parseAudioDefinition(raw:unknown):AudioDefinition {
 if(!obj(raw)||raw.schemaVersion!==1)throw Error('Définition audio version 1 requise');keys(raw,['schemaVersion','patchIds','assets','scores','sounds','music','ambience','emitters']);
 if(!Array.isArray(raw.patchIds)||raw.patchIds.length<1||raw.patchIds.length>10||new Set(raw.patchIds).size!==raw.patchIds.length||!raw.patchIds.every(id=>typeof id==='string'&&Object.hasOwn(PATCHES,id)))throw Error('Palette MIDI invalide (1 à 10 timbres, cinq presets disponibles)');
 for(const name of ['assets','scores','sounds','music','ambience'])if(!obj(raw[name]))throw Error('Registre audio invalide : '+name);
 const assets=raw.assets as Record<string,AudioAsset>,scores=raw.scores as Record<string,AudioScoreDefinition>,sounds=raw.sounds as Record<string,SoundDefinition>;let total=0;
 if(Object.keys(assets).length>32||Object.keys(scores).length>16||Object.keys(sounds).length>32)throw Error('Catalogue audio trop grand');
 for(const [id,asset]of Object.entries(assets)){
  if(!obj(asset)||asset.id!==id||!text(id)||!text(asset.name,200)||!text(asset.license,200)||!text(asset.source,500)||!['midi','sample'].includes(asset.kind)||!text(asset.bytesBase64,1_400_000))throw Error('Asset audio ou licence invalide');keys(asset,['id','name','kind','mime','bytesBase64','license','source']);const bytes=base64Bytes(asset.bytesBase64);total+=bytes.length;if(total>4_194_304)throw Error('Sources audio limitées à 4 Mio par projet');
  if(asset.kind==='midi'){if(asset.mime!=='audio/midi')throw Error('Type MIDI invalide');parseMidi(bytes);}else{if(asset.mime!=='audio/wav')throw Error('Importer un WAV PCM court ; les codecs compressés ne sont pas encore qualifiés');inspectWav(bytes);}
 }
 for(const [id,score]of Object.entries(scores)){if(!obj(score)||score.id!==id||!text(id)||assets[score.assetId]?.kind!=='midi'||!obj(score.programMap)||Object.keys(score.programMap).length>128||!Object.entries(score.programMap).every(([p,patch])=>/^(0|[1-9]\d{0,2})$/.test(p)&&Number(p)<=127&&raw.patchIds instanceof Array&&raw.patchIds.includes(patch))||typeof score.loop!=='boolean'||!number(score.gain,0,1))throw Error('Partition audio invalide');keys(score,['id','assetId','programMap','loop','gain']);}
 for(const [id,sound]of Object.entries(sounds)){if(!obj(sound)||sound.id!==id||!text(id)||assets[sound.assetId]?.kind!=='sample'||!number(sound.gain,0,1)||!number(sound.pitch,.5,2))throw Error('Bruitage invalide');keys(sound,['id','assetId','gain','pitch']);}
 const music=raw.music as AudioDefinition['music'],ambience=raw.ambience as AudioDefinition['ambience'];keys(music,['day','night']);keys(ambience,['water','rain','night']);for(const id of Object.values(music))if(!text(id)||!Object.hasOwn(scores,id))throw Error('Partition référencée absente');for(const id of Object.values(ambience))if(!text(id)||!Object.hasOwn(sounds,id))throw Error('Ambiance référencée absente');
 if(!Array.isArray(raw.emitters)||raw.emitters.length>1000)throw Error('Trop d’émetteurs audio');const ids=new Set<string>();for(const e of raw.emitters){if(!obj(e)||!text(e.id)||ids.has(e.id)||(!text(e.soundId)||!Object.hasOwn(sounds,e.soundId))||!number(e.radius,1,200)||!number(e.priority,0,10)||typeof e.loop!=='boolean'||(e.entityId!==undefined&&!text(e.entityId))||(!e.entityId&&!e.position))throw Error('Émetteur audio invalide');keys(e,['id','entityId','position','soundId','radius','loop','priority']);if(e.position!==undefined&&(!obj(e.position)||!['x','y','z'].every(k=>number((e.position as Record<string,unknown>)[k],-100000,100000))))throw Error('Position audio invalide');ids.add(e.id);}
 return structuredClone(raw) as unknown as AudioDefinition;
}
/** Author-side link check (V1 sounds or V2 events). Missing *resources* are diagnostics elsewhere;
 * a broken authored reference is refused here with an explicit message. */
export function validateAudioLinks(audio:{schemaVersion:number;emitters:readonly AudioEmitter[];sounds?:Record<string,unknown>;events?:Record<string,unknown>}|undefined,entityIds:Iterable<string>,soundIds:Iterable<string>){
 const entities=new Set(entityIds),registry=audio?(audio.schemaVersion===2?audio.events:audio.sounds)??{}:{};for(const e of audio?.emitters??[])if(e.entityId&&!entities.has(e.entityId))throw Error('Entité audio absente : '+e.entityId);
 for(const id of soundIds)if(!audio||!Object.hasOwn(registry,id))throw Error('Son d’action absent : '+id);
}
