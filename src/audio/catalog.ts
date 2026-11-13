/** AUD-V2 — versioned audio catalogue: resources (AudioAsset) ≠ semantic events (SoundEvent) ≠
 * music cues ≠ ambience profiles. Structural errors throw (author side); missing *resources*
 * (PLANNED/REJECTED, unreachable files) are only diagnostics and never block the game. */
import {inspectWav} from './wav.ts';
import {parseMidi} from './midi.ts';
import {base64Bytes,PATCHES,type AudioEmitter,type AudioScoreDefinition,type PatchId} from './schema.ts';
import {matchCondition,parseCondition,type SoundCondition,type SoundContext} from './context.ts';

export const ASSET_STATUSES=['PLANNED','GENERATED','VERIFIED','REJECTED'] as const;
export type AssetStatus=typeof ASSET_STATUSES[number];
export type AssetKind='sample'|'midi'|'procedural';
export type AssetFormat='wav'|'ogg'|'midi'|'procedural';
export type AssetUsage='sfx'|'ambience'|'music'|'ui';
/** Bounded allowlisted synthesis: no author code, only parameters. */
export interface ProceduralSpec {generator:'tone'|'noise';seconds:number;gain:number;attack:number;decay:number;frequency?:number;harmonics?:number[];notes?:number[];sweep?:number;color?:'white'|'brown';lowpass?:number;}
export interface AudioAssetV2 {
 id:string;name:string;kind:AssetKind;format:AssetFormat;status:AssetStatus;license:string;source:string;usage?:AssetUsage;
 /** Static file relative to the Vite base (`audio/...`), never an absolute or domain URL. */
 uri?:string;
 /** Portable user file embedded in the Studio project (WAV/MIDI only, bounded). */
 bytesBase64?:string;
 procedural?:ProceduralSpec;
 duration?:number;channels?:1|2;sampleRate?:number;loopStart?:number;loopEnd?:number;bytes?:number;estimatedDecodedBytes?:number;
 generatorVersion?:string;contentHash?:string;notes?:string;
}
export const EVENT_CATEGORIES=['movement','water','boat','mine','farm','npc','fauna','interaction','ui','mission','magic','ambience','weather','legacy'] as const;
export type EventCategory=typeof EVENT_CATEGORIES[number];
export const REPEAT_MODES=['random','avoid-repeat','shuffle','sequence'] as const;
export type RepeatMode=typeof REPEAT_MODES[number];
export interface SoundVariantV2 {assetId:string;weight:number;gain?:number;pitch?:number;when?:SoundCondition;}
export interface SoundEventV2 {
 id:string;category:EventCategory;description?:string;bus:'sfx'|'ambience';variants:SoundVariantV2[];fallback?:string;
 gain:number;pitch:number;/** ±semitones, bounded to 2 — never a substitute for real takes. */pitchJitter:number;/** ±fraction of gain. */gainJitter:number;
 cooldownMs:number;priority:number;maxInstances:number;steal:'oldest'|'none';spatial:boolean;radius:number;loop:boolean;repeat:RepeatMode;
 /** Drop a one-shot whose resource arrives later than this (0 = never). */maxLatencyMs:number;
 tags?:{gameplay?:boolean;caption?:string};
}
export interface MusicCue {id:string;scoreIds:string[];when?:SoundCondition;priority:number;kind:'loop'|'stinger';transition:'bar'|'immediate';/** Silence range (s) after a full non-looping playthrough. */silence?:[number,number];}
export interface MusicProfileV2 {cues:Record<string,MusicCue>;}
export interface AmbienceLayer {id:string;role:'bed'|'weather'|'source'|'oneshot';eventId:string;when?:SoundCondition;priority:number;gain:number;/** One-shots only: random interval range (s). */interval?:[number,number];}
/** `exclusive`: when this place profile wins, global profiles (weather, night…) are muted — mines, underwater. */
export interface AmbienceProfile {id:string;when?:SoundCondition;priority:number;global:boolean;exclusive?:boolean;fadeSeconds:number;layers:AmbienceLayer[];}
export interface AudioDefinitionV2 {
 schemaVersion:2;meta?:{catalogVersion:string;description?:string};patchIds:PatchId[];
 assets:Record<string,AudioAssetV2>;scores:Record<string,AudioScoreDefinition>;events:Record<string,SoundEventV2>;
 music:MusicProfileV2;ambience:Record<string,AmbienceProfile>;emitters:AudioEmitter[];
}
/** Limits depend on the asset kind and how it is loaded (embedded vs static file). */
export const AUDIO_V2_LIMITS={assets:512,embeddedAssets:64,embeddedBytes:4_194_304,embeddedFileBytes:1_048_576,staticSampleBytes:2_097_152,staticMidiBytes:1_048_576,sampleSeconds:12,proceduralSeconds:4,proceduralAssets:128,events:1024,variants:32,scores:64,cues:64,cueScores:8,profiles:64,layers:8,emitters:1000} as const;

const blocked=new Set(['__proto__','prototype','constructor']);
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=128):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!blocked.has(v);
const num=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function keys(v:Record<string,unknown>,allowed:readonly string[],path:string){for(const k of Object.keys(v))if(blocked.has(k)||!allowed.includes(k))throw Error(`${path} : champ inconnu « ${k} »`);}
function need(ok:boolean,message:string):asserts ok {if(!ok)throw Error(message);}
function range(v:unknown,min:number,max:number,path:string):[number,number]{need(Array.isArray(v)&&v.length===2&&num(v[0],min,max)&&num(v[1],min,max)&&v[0]<=v[1],`${path} : intervalle invalide`);return [v[0],v[1]] as [number,number];}
const URI=/^audio\/[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*){0,4}$/;
const EXT:Record<string,AssetFormat>={wav:'wav',ogg:'ogg',mid:'midi',midi:'midi'};
export const playableStatus=(s:AssetStatus)=>s==='GENERATED'||s==='VERIFIED';
/** True when the runtime may try to load/play the asset (it can still fail to download). */
export const assetPlayable=(a:AudioAssetV2|undefined):a is AudioAssetV2=>!!a&&playableStatus(a.status)&&(a.uri!==undefined||a.bytesBase64!==undefined||a.procedural!==undefined);
export function validAudioUri(uri:unknown):uri is string {return typeof uri==='string'&&uri.length<=200&&URI.test(uri)&&!uri.includes('..')&&!uri.includes('//');}

function parseProcedural(v:unknown,path:string):ProceduralSpec {
 need(obj(v),path+' : synthèse invalide');keys(v,['generator','seconds','gain','attack','decay','frequency','harmonics','notes','sweep','color','lowpass'],path);
 need(v.generator==='tone'||v.generator==='noise',path+' : générateur inconnu');need(num(v.seconds,.01,AUDIO_V2_LIMITS.proceduralSeconds)&&num(v.gain,0,1)&&num(v.attack,0,.5)&&num(v.decay,0,80),path+' : paramètres hors limites');
 if(v.generator==='tone')need(num(v.frequency,40,8000),path+' : fréquence requise (40–8000 Hz)');else need(v.frequency===undefined,path+' : fréquence réservée au générateur tone');
 if(v.harmonics!==undefined)need(Array.isArray(v.harmonics)&&v.harmonics.length<=4&&v.harmonics.every(h=>num(h,0,1)),path+' : harmoniques invalides');
 if(v.notes!==undefined)need(Array.isArray(v.notes)&&v.notes.length>=1&&v.notes.length<=6&&v.notes.every(n=>Number.isInteger(n)&&num(n,-24,24)),path+' : notes invalides');
 if(v.sweep!==undefined)need(num(v.sweep,-24,24),path+' : glissando invalide');
 if(v.color!==undefined)need(v.color==='white'||v.color==='brown',path+' : couleur de bruit invalide');
 if(v.lowpass!==undefined)need(num(v.lowpass,.001,1),path+' : filtre invalide');
 return structuredClone(v) as unknown as ProceduralSpec;
}
function parseAsset(id:string,v:unknown,totals:{embedded:number;embeddedCount:number;procedural:number}):AudioAssetV2 {
 const p='Ressource audio '+id;need(obj(v)&&v.id===id&&text(id),p+' : identifiant invalide');
 keys(v,['id','name','kind','format','status','license','source','usage','uri','bytesBase64','procedural','duration','channels','sampleRate','loopStart','loopEnd','bytes','estimatedDecodedBytes','generatorVersion','contentHash','notes'],p);
 need(text(v.name,200)&&text(v.license,200)&&text(v.source,500),p+' : nom, licence et provenance requis');
 need((ASSET_STATUSES as readonly unknown[]).includes(v.status),p+' : statut inconnu');
 need(['sample','midi','procedural'].includes(v.kind as string),p+' : type inconnu');
 const formats:Record<string,string[]>={sample:['wav','ogg'],midi:['midi'],procedural:['procedural']};need(formats[v.kind as string].includes(v.format as string),p+' : format incompatible avec le type');
 if(v.usage!==undefined)need(['sfx','ambience','music','ui'].includes(v.usage as string),p+' : usage inconnu');
 const sources=['uri','bytesBase64','procedural'].filter(k=>v[k]!==undefined);need(sources.length<=1,p+' : une seule source (fichier, données intégrées ou synthèse)');
 if(v.status==='PLANNED')need(sources.length===0,p+' : une ressource PLANNED ne peut pas référencer de fichier fictif');
 if(v.status==='GENERATED'||v.status==='VERIFIED')need(sources.length===1,p+' : ressource disponible sans source');
 if(v.uri!==undefined){need(validAudioUri(v.uri),p+' : chemin relatif « audio/… » requis (aucune URL absolue)');const ext=(v.uri as string).split('.').pop()!;need(EXT[ext]===v.format,p+' : extension et format incohérents');
  if(v.bytes!==undefined)need(Number.isInteger(v.bytes)&&num(v.bytes,1,v.kind==='midi'?AUDIO_V2_LIMITS.staticMidiBytes:AUDIO_V2_LIMITS.staticSampleBytes),p+' : fichier trop volumineux');}
 if(v.bytesBase64!==undefined){need(text(v.bytesBase64,1_400_000),p+' : données intégrées invalides');need(v.format==='wav'||v.format==='midi',p+' : seuls WAV PCM et MIDI peuvent être intégrés au projet');const bytes=base64Bytes(v.bytesBase64 as string);
  totals.embedded+=bytes.length;totals.embeddedCount++;need(bytes.length<=AUDIO_V2_LIMITS.embeddedFileBytes,p+' : fichier intégré limité à 1 Mio');need(totals.embedded<=AUDIO_V2_LIMITS.embeddedBytes&&totals.embeddedCount<=AUDIO_V2_LIMITS.embeddedAssets,'Fichiers audio intégrés limités à 4 Mio / 64 ressources par projet');
  if(v.kind==='midi')parseMidi(bytes);else inspectWav(bytes);}
 if(v.procedural!==undefined){need(v.kind==='procedural',p+' : synthèse réservée au type procedural');parseProcedural(v.procedural,p);need(++totals.procedural<=AUDIO_V2_LIMITS.proceduralAssets,'Trop de sons procéduraux');}
 if(v.duration!==undefined)need(num(v.duration,.005,v.kind==='midi'?1800:v.kind==='procedural'?AUDIO_V2_LIMITS.proceduralSeconds:AUDIO_V2_LIMITS.sampleSeconds),p+' : durée hors limites');
 if(v.channels!==undefined)need(v.channels===1||v.channels===2,p+' : canaux 1 ou 2');
 if(v.sampleRate!==undefined)need(Number.isInteger(v.sampleRate)&&num(v.sampleRate,8000,96000),p+' : fréquence d’échantillonnage invalide');
 if(v.loopStart!==undefined||v.loopEnd!==undefined)need(num(v.loopStart,0,AUDIO_V2_LIMITS.sampleSeconds)&&num(v.loopEnd,0,AUDIO_V2_LIMITS.sampleSeconds)&&(v.loopStart as number)<(v.loopEnd as number)&&(v.duration===undefined||(v.loopEnd as number)<=(v.duration as number)+1e-6),p+' : boucle invalide');
 if(v.estimatedDecodedBytes!==undefined)need(Number.isInteger(v.estimatedDecodedBytes)&&num(v.estimatedDecodedBytes,0,67_108_864),p+' : estimation PCM invalide');
 if(v.generatorVersion!==undefined)need(text(v.generatorVersion,64),p+' : version de générateur invalide');
 if(v.contentHash!==undefined)need(typeof v.contentHash==='string'&&/^sha256-[0-9a-f]{64}$/.test(v.contentHash),p+' : empreinte sha256 attendue');
 if(v.notes!==undefined)need(text(v.notes,500),p+' : notes invalides');
 return v as unknown as AudioAssetV2;
}
function parseEvent(id:string,v:unknown,assets:Record<string,AudioAssetV2>):SoundEventV2 {
 const p='Événement sonore '+id;need(obj(v)&&v.id===id&&text(id),p+' : identifiant invalide');
 keys(v,['id','category','description','bus','variants','fallback','gain','pitch','pitchJitter','gainJitter','cooldownMs','priority','maxInstances','steal','spatial','radius','loop','repeat','maxLatencyMs','tags'],p);
 need((EVENT_CATEGORIES as readonly unknown[]).includes(v.category),p+' : catégorie inconnue');need(v.bus==='sfx'||v.bus==='ambience',p+' : bus sfx ou ambience');
 if(v.description!==undefined)need(text(v.description,300),p+' : description invalide');
 need(num(v.gain,0,1)&&num(v.pitch,.5,2)&&num(v.pitchJitter,0,2)&&num(v.gainJitter,0,.5),p+' : gain/hauteur hors limites (jitter ≤ 2 demi-tons)');
 need(num(v.cooldownMs,0,60000)&&num(v.priority,0,10)&&Number.isInteger(v.maxInstances)&&num(v.maxInstances,1,16)&&num(v.radius,1,200)&&num(v.maxLatencyMs,0,2000),p+' : limites de lecture invalides');
 need(v.steal==='oldest'||v.steal==='none',p+' : politique de vol invalide');need(typeof v.spatial==='boolean'&&typeof v.loop==='boolean',p+' : spatial/loop booléens');need((REPEAT_MODES as readonly unknown[]).includes(v.repeat),p+' : politique de répétition inconnue');
 need(Array.isArray(v.variants)&&v.variants.length<=AUDIO_V2_LIMITS.variants,p+' : 32 variantes maximum');
 v.variants.forEach((variant,i)=>{const vp=`${p} variante ${i+1}`;need(obj(variant),vp+' invalide');keys(variant,['assetId','weight','gain','pitch','when'],vp);need(text(variant.assetId)&&Object.hasOwn(assets,variant.assetId as string),vp+' : ressource absente « '+String(variant.assetId)+' »');
  need(assets[variant.assetId as string].kind!=='midi',vp+' : une partition MIDI n’est pas un bruitage');need(num(variant.weight,.001,100),vp+' : poids invalide');
  if(variant.gain!==undefined)need(num(variant.gain,0,1.5),vp+' : gain invalide');if(variant.pitch!==undefined)need(num(variant.pitch,.5,2),vp+' : hauteur invalide');if(variant.when!==undefined)parseCondition(variant.when,vp);});
 if(v.fallback!==undefined)need(text(v.fallback)&&v.fallback!==id,p+' : repli invalide');
 if(v.tags!==undefined){need(obj(v.tags),p+' : tags invalides');keys(v.tags,['gameplay','caption'],p);if(v.tags.gameplay!==undefined)need(typeof v.tags.gameplay==='boolean',p+' : tag gameplay');if(v.tags.caption!==undefined)need(text(v.tags.caption,120),p+' : légende invalide');}
 return v as unknown as SoundEventV2;
}
export function parseAudioDefinitionV2(raw:unknown):AudioDefinitionV2 {
 need(obj(raw)&&raw.schemaVersion===2,'Catalogue audio version 2 requis');keys(raw,['schemaVersion','meta','patchIds','assets','scores','events','music','ambience','emitters'],'Catalogue audio');
 if(raw.meta!==undefined){need(obj(raw.meta),'Métadonnées audio invalides');keys(raw.meta,['catalogVersion','description'],'Métadonnées audio');need(text(raw.meta.catalogVersion,64)&&(raw.meta.description===undefined||text(raw.meta.description,500)),'Métadonnées audio invalides');}
 need(Array.isArray(raw.patchIds)&&raw.patchIds.length>=1&&raw.patchIds.length<=10&&new Set(raw.patchIds).size===raw.patchIds.length&&raw.patchIds.every(id=>typeof id==='string'&&Object.hasOwn(PATCHES,id)),'Palette MIDI invalide (1 à 10 timbres allowlistés)');
 for(const name of ['assets','scores','events','ambience','music'])need(obj(raw[name]),'Registre audio invalide : '+name);
 const rawAssets=raw.assets as Record<string,unknown>,rawEvents=raw.events as Record<string,unknown>,rawScores=raw.scores as Record<string,unknown>;
 need(Object.keys(rawAssets).length<=AUDIO_V2_LIMITS.assets&&Object.keys(rawEvents).length<=AUDIO_V2_LIMITS.events&&Object.keys(rawScores).length<=AUDIO_V2_LIMITS.scores,'Catalogue audio trop grand');
 const totals={embedded:0,embeddedCount:0,procedural:0},assets:Record<string,AudioAssetV2>={};for(const [id,a]of Object.entries(rawAssets))assets[id]=parseAsset(id,a,totals);
 const patchIds=raw.patchIds as PatchId[];
 for(const [id,s]of Object.entries(rawScores)){need(obj(s)&&s.id===id&&text(id),'Partition invalide : '+id);keys(s,['id','assetId','programMap','loop','gain'],'Partition '+id);need(assets[s.assetId as string]?.kind==='midi','Partition '+id+' : ressource MIDI absente');
  need(obj(s.programMap)&&Object.keys(s.programMap).length<=128&&Object.entries(s.programMap).every(([prog,patch])=>/^(0|[1-9]\d{0,2})$/.test(prog)&&Number(prog)<=127&&patchIds.includes(patch as PatchId)),'Partition '+id+' : mapping hors palette');need(typeof s.loop==='boolean'&&num(s.gain,0,1),'Partition '+id+' : boucle/gain invalides');}
 const events:Record<string,SoundEventV2>={};for(const [id,e]of Object.entries(rawEvents))events[id]=parseEvent(id,e,assets);
 for(const e of Object.values(events)){if(e.fallback===undefined)continue;need(Object.hasOwn(events,e.fallback),`Événement sonore ${e.id} : repli absent « ${e.fallback} »`);const seen=new Set([e.id]);let at:SoundEventV2|undefined=e;while(at?.fallback!==undefined){need(!seen.has(at.fallback),`Événement sonore ${e.id} : boucle de replis`);seen.add(at.fallback);at=events[at.fallback];need(seen.size<=8,`Événement sonore ${e.id} : chaîne de replis trop longue (8 max)`);}}
 const music=raw.music as Record<string,unknown>;keys(music,['cues'],'Musique');need(obj(music.cues)&&Object.keys(music.cues).length<=AUDIO_V2_LIMITS.cues,'Profils musicaux invalides');
 for(const [id,c]of Object.entries(music.cues as Record<string,unknown>)){const p='Thème musical '+id;need(obj(c)&&c.id===id&&text(id),p+' invalide');keys(c,['id','scoreIds','when','priority','kind','transition','silence'],p);
  need(Array.isArray(c.scoreIds)&&c.scoreIds.length>=1&&c.scoreIds.length<=AUDIO_V2_LIMITS.cueScores&&c.scoreIds.every(s=>typeof s==='string'&&Object.hasOwn(rawScores,s)),p+' : partitions absentes');
  need(num(c.priority,0,10)&&(c.kind==='loop'||c.kind==='stinger')&&(c.transition==='bar'||c.transition==='immediate'),p+' : priorité/type/transition invalides');if(c.when!==undefined)parseCondition(c.when,p);if(c.silence!==undefined)range(c.silence,0,600,p+' silence');}
 const ambience=raw.ambience as Record<string,unknown>;need(Object.keys(ambience).length<=AUDIO_V2_LIMITS.profiles,'Trop de profils d’ambiance');
 for(const [id,a]of Object.entries(ambience)){const p='Profil d’ambiance '+id;need(obj(a)&&a.id===id&&text(id),p+' invalide');keys(a,['id','when','priority','global','exclusive','fadeSeconds','layers'],p);need(num(a.priority,0,10)&&typeof a.global==='boolean'&&(a.exclusive===undefined||(typeof a.exclusive==='boolean'&&!a.global))&&num(a.fadeSeconds,.05,10),p+' : paramètres invalides');if(a.when!==undefined)parseCondition(a.when,p);
  need(Array.isArray(a.layers)&&a.layers.length>=1&&a.layers.length<=AUDIO_V2_LIMITS.layers,p+' : 1 à 8 couches');const ids=new Set<string>();
  for(const l of a.layers){need(obj(l)&&text(l.id)&&!ids.has(l.id as string),p+' : couche invalide');ids.add(l.id as string);const lp=p+' couche '+String(l.id);keys(l,['id','role','eventId','when','priority','gain','interval'],lp);need(['bed','weather','source','oneshot'].includes(l.role as string),lp+' : rôle inconnu');
   need(text(l.eventId)&&Object.hasOwn(events,l.eventId as string),lp+' : événement absent « '+String(l.eventId)+' »');need(num(l.priority,0,10)&&num(l.gain,0,1),lp+' : priorité/gain invalides');if(l.when!==undefined)parseCondition(l.when,lp);
   if(l.role==='oneshot')range(l.interval,.5,600,lp+' intervalle');else need(l.interval===undefined,lp+' : intervalle réservé aux sons ponctuels');}}
 need(Array.isArray(raw.emitters)&&raw.emitters.length<=AUDIO_V2_LIMITS.emitters,'Trop d’émetteurs audio');const emitterIds=new Set<string>();
 for(const e of raw.emitters){need(obj(e)&&text(e.id)&&!emitterIds.has(e.id as string)&&text(e.soundId)&&Object.hasOwn(events,e.soundId as string)&&num(e.radius,1,200)&&num(e.priority,0,10)&&typeof e.loop==='boolean'&&(e.entityId===undefined||text(e.entityId))&&(!!e.entityId||!!e.position),'Émetteur audio invalide');keys(e,['id','entityId','position','soundId','radius','loop','priority'],'Émetteur audio');
  if(e.position!==undefined)need(obj(e.position)&&['x','y','z'].every(k=>num((e.position as Record<string,unknown>)[k],-100000,100000)),'Position audio invalide');emitterIds.add(e.id as string);}
 return structuredClone(raw) as unknown as AudioDefinitionV2;
}

/** Variants that may be chosen for this context (most specific matching group, playable resources). */
export function eligibleVariants(event:SoundEventV2,assets:Record<string,AudioAssetV2>,context:SoundContext,usable:(a:AudioAssetV2)=>boolean=assetPlayable):{variants:SoundVariantV2[];specificity:number}{
 let best=-1,out:SoundVariantV2[]=[];
 for(const v of event.variants){const score=matchCondition(v.when,context);if(score<0||!usable(assets[v.assetId]))continue;if(score>best){best=score;out=[v];}else if(score===best)out.push(v);}
 return {variants:out,specificity:best};
}
export interface EventAvailability {expected:number;available:number;viaFallback:string|null;playable:boolean;}
export function eventAvailability(def:AudioDefinitionV2,eventId:string):EventAvailability {
 const event=def.events[eventId];if(!event)return {expected:0,available:0,viaFallback:null,playable:false};
 const available=event.variants.filter(v=>assetPlayable(def.assets[v.assetId])).length;let viaFallback:string|null=null,at=event.fallback,guard=0;
 if(!available)while(at&&guard++<8){const next=def.events[at];if(!next)break;if(next.variants.some(v=>assetPlayable(def.assets[v.assetId]))){viaFallback=at;break;}at=next.fallback;}
 return {expected:event.variants.length,available,viaFallback,playable:available>0||viaFallback!==null};
}
export interface AudioDiagnostic {level:'error'|'warning'|'info';code:string;ref:string;message:string;}
/** Non-blocking report used by Studio, compiler output and the production manifest. */
export function diagnoseAudioCatalog(def:AudioDefinitionV2):AudioDiagnostic[] {
 const out:AudioDiagnostic[]=[],used=new Set<string>();
 for(const e of Object.values(def.events)){for(const v of e.variants)used.add(v.assetId);const a=eventAvailability(def,e.id);
  if(!a.playable)out.push({level:'warning',code:'event-silent',ref:e.id,message:`« ${e.id} » n’a encore aucune ressource disponible : l’événement reste silencieux.`});
  else if(a.viaFallback)out.push({level:'info',code:'event-fallback',ref:e.id,message:`« ${e.id} » utilise provisoirement le repli « ${a.viaFallback} ».`});
  else if(a.available<a.expected)out.push({level:'info',code:'event-partial',ref:e.id,message:`« ${e.id} » : ${a.available}/${a.expected} prises disponibles.`});
  if(e.variants.length===1&&e.pitchJitter>1)out.push({level:'warning',code:'pitch-substitute',ref:e.id,message:`« ${e.id} » : une seule prise et un jitter de hauteur élevé ; prévoir de vraies prises.`});}
 for(const c of Object.values(def.music.cues)){for(const s of c.scoreIds)used.add(def.scores[s].assetId);if(!c.scoreIds.some(s=>assetPlayable(def.assets[def.scores[s].assetId])))out.push({level:'info',code:'cue-planned',ref:c.id,message:`Thème « ${c.id} » : partition à produire, le thème précédent continue.`});}
 for(const p of Object.values(def.ambience))for(const l of p.layers)if(!eventAvailability(def,l.eventId).playable)out.push({level:'info',code:'layer-planned',ref:`${p.id}/${l.id}`,message:`Ambiance « ${p.id} » : couche « ${l.id} » sans ressource disponible.`});
 for(const s of Object.values(def.scores))used.add(s.assetId);
 for(const a of Object.values(def.assets)){if(a.status==='REJECTED')out.push({level:'info',code:'asset-rejected',ref:a.id,message:`Ressource « ${a.id} » rejetée : jamais jouée.`});if(!used.has(a.id))out.push({level:'info',code:'asset-unused',ref:a.id,message:`Ressource « ${a.id} » non référencée.`});}
 return out;
}
