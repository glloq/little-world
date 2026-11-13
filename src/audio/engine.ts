import {positionListener,positionPanner} from './positions.ts';
import {AudioEmitterIndex} from './spatial.ts';
import {inspectWav} from './wav.ts';
import {audioBudgetForLevel,type AudioBudget} from './budget.ts';
import {base64Bytes,PATCHES,type PatchId} from './schema.ts';
import {parseMidi,type MidiScore} from './midi.ts';
import {toAudioCatalog,type AnyAudioDefinition} from './migrate.ts';
import {assetPlayable,AUDIO_V2_LIMITS,validAudioUri,type AudioAssetV2,type AudioDefinitionV2} from './catalog.ts';
import {resolveSound,type Resolution} from './resolve.ts';
import {CooldownGate,VariantPicker,type Random} from './variants.ts';
import {MusicDirector} from './music.ts';
import {AmbienceMixer} from './ambience.ts';
import {renderProcedural} from './procedural.ts';
import {sanitizeContext,type SoundContext} from './context.ts';
import type {StateLoop} from './router.ts';
export interface AudioLevels {master:number;music:number;sfx:number;ambience:number;muted:boolean;}
export const DEFAULT_LEVELS:AudioLevels={master:.55,music:.4,sfx:.65,ambience:.3,muted:false};
type Bus='music'|'sfx'|'ambience';
type Point={x:number;y:number;z:number};
interface Voice {id:number;source:AudioScheduledSourceNode;gain:GainNode;panner?:PannerNode;bus:Bus;priority:number;start:number;end:number;retiring:boolean;group?:number;assetId?:string;eventId?:string;baseGain?:number;scale?:number;rampEnd?:number;fade?:number;}
interface Transport {id:string;score:MidiScore;origin:number;cursor:number;cycle:number;group:number;loop:boolean;}
interface AmbientEntry {id:string;soundId:string;position?:Point;radius:number;priority:number;loop:boolean;bus:'sfx'|'ambience';gain:number;fade:number;}
export interface PlayEventOptions {context?:SoundContext;position?:Point;bus?:'sfx'|'ambience';radius?:number;loop?:boolean;priority?:number;source?:'player'|'world'|'ui';gainScale?:number;fadeIn?:number;}
export interface EngineOptions {baseUrl?:string;fetch?:(url:string)=>Promise<Response>;random?:Random;}
/** Scene facts for music/ambience; V1 callers may omit it (derived from night/rain/water). */
export interface SceneExtra {context?:SoundContext;loops?:StateLoop[];}
const SETTINGS='little-world:audio:v1';
export class AudioEngine {
 readonly catalog:AudioDefinitionV2;
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private analyser:AnalyserNode|null=null;
 private buses:Partial<Record<Bus,GainNode>>={};
 private voices=new Map<number,Voice>();
 private buffers=new Map<string,{buffer:AudioBuffer;bytes:number;used:number}>();
 private decoding=new Map<string,Promise<AudioBuffer|null>>();
 private decodeQueue:(()=>void)[]=[];
 private decodeActive=0;
 private transport:Transport|null=null;
 private parsed=new Map<string,MidiScore>();
 private loadingScores=new Map<string,Promise<MidiScore|null>>();
 private pending:{id:string;at:number;loop:boolean}|null=null;
 /** Score requested while its static MIDI was still downloading: started as soon as it is parsed. */
 private awaited:{id:string;options:{loop?:boolean;immediate?:boolean}}|null=null;
 private interval:ReturnType<typeof setInterval>|null=null;
 private levels:AudioLevels={...DEFAULT_LEVELS};
 private budget:AudioBudget=audioBudgetForLevel(0);
 private nextId=0;
 private group=0;
 private disposed=false;
 private hidden=false;
 private enabled=false;
 private listener={x:0,y:0,z:0};
 private ambient=new Map<string,number>();
 private emitterIndex:AudioEmitterIndex;
 private playedEntries=new Set<string>();
 private desiredAmbient:AmbientEntry[]=[];
 private status='Audio prêt à activer';
 private dropped=0;
 private stolen=0;
 private late=0;
 private scheduled=0;
 private contextCount=0;
 private samples=new Float32Array(256);
 private readonly picker:VariantPicker;
 private readonly cooldowns=new CooldownGate();
 private readonly director:MusicDirector;
 private readonly mixer:AmbienceMixer;
 private readonly unavailable=new Set<string>();
 private readonly diagnosticLog:string[]=[];
 private readonly eventStats={requested:0,played:0,culled:0,cooldown:0,instanceLimited:0,missing:0,late:0};
 private readonly baseUrl:string;
 private readonly fetcher:(url:string)=>Promise<Response>;
 private lastContext:SoundContext={};
 private factory:()=>AudioContext;
 constructor(raw:AnyAudioDefinition|unknown,privateFactory?:()=>AudioContext,options:EngineOptions={}){
  this.catalog=toAudioCatalog(raw);this.emitterIndex=new AudioEmitterIndex(this.catalog.emitters);this.factory=privateFactory??(()=>new AudioContext({latencyHint:'interactive'}));
  this.baseUrl=(options.baseUrl??'/').replace(/\/?$/,'/');this.fetcher=options.fetch??((url:string)=>fetch(url));const random=options.random??Math.random;
  this.picker=new VariantPicker(random);this.director=new MusicDirector(this.catalog,id=>this.scoreAvailable(id),random);this.mixer=new AmbienceMixer(this.catalog,id=>this.eventPlayable(id),random);
  try{const raw=JSON.parse(localStorage.getItem(SETTINGS)??'null');if(raw&&typeof raw==='object')for(const key of ['master','music','sfx','ambience'] as const)if(Number.isFinite(raw[key]))this.levels[key]=Math.max(0,Math.min(1,raw[key]));if(typeof raw?.muted==='boolean')this.levels.muted=raw.muted;}catch{/* Optional device preference. */}
 }
 /** Compatibility alias: the engine always works on the V2 catalogue (V1 input is migrated). */
 get definition():AudioDefinitionV2 {return this.catalog;}
 audition(patch:PatchId){if(!this.catalog.patchIds.includes(patch))throw Error('Timbre non disponible');if(this.context)this.note(patch,patch==='soft-drum'?45:72,.6,this.context.currentTime+.03,.7,0);}
 get settings(){return {...this.levels};}
 get ready(){return !!this.context&&this.context.state==='running'&&this.enabled&&!this.hidden&&!this.levels.muted&&this.levels.master>0;}
 /** Called directly in the user gesture, before any await. Reuses the same context. */
 async unlock():Promise<boolean>{
  if(this.disposed)return false;this.enabled=true;if(this.levels.muted){this.status='Son coupé';return false;}
  try{if(!this.context){const c=this.factory();this.context=c;this.contextCount++;this.master=c.createGain();this.analyser=c.createAnalyser();this.analyser.fftSize=256;this.master.connect(this.analyser);this.analyser.connect(c.destination);for(const bus of ['music','sfx','ambience'] as const){const gain=c.createGain();gain.connect(this.master);this.buses[bus]=gain;}this.applyLevels();}
   if(!this.hidden&&this.context.state!=='running')await this.context.resume();if(this.disposed)return false;this.status=this.context.state==='running'?'Audio actif':'Audio suspendu — réactiver';this.startTimer();return this.context.state==='running';
  }catch{this.status='Audio indisponible — mode silencieux';return false;}
 }
 setLevels(patch:Partial<AudioLevels>){for(const key of ['master','music','sfx','ambience'] as const)if(patch[key]!==undefined){const n=patch[key]!;if(!Number.isFinite(n)||n<0||n>1)throw Error('Volume entre 0 et 1');this.levels[key]=n;}if(patch.muted!==undefined)this.levels.muted=!!patch.muted;this.applyLevels();if(this.levels.muted||this.levels.master===0){this.stopAll();this.transport=null;this.pending=null;}try{localStorage.setItem(SETTINGS,JSON.stringify(this.levels));}catch{/* Optional. */}}
 private applyLevels(){if(!this.context||!this.master)return;const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);this.master.gain.setTargetAtTime(this.levels.muted?0:this.levels.master,now,.005);for(const bus of ['music','sfx','ambience'] as const)this.buses[bus]!.gain.setTargetAtTime(this.levels[bus],now,.01);}
 applyBudget(level:number){this.budget=audioBudgetForLevel(level);const active=()=>[...this.voices.values()].filter(v=>!v.retiring);while(active().length>this.budget.maxTotalVoices){const victim=active().sort((a,b)=>a.priority-b.priority||a.end-b.end)[0];if(!victim)break;this.stop(victim);}
  for(const bus of ['music'] as const){const list=active().filter(v=>v.bus===bus).sort((a,b)=>a.end-b.end);while(list.length>this.budget.maxMusicVoices)this.stop(list.shift()!);}if(!this.trimBuffers(0))for(const v of active().filter(v=>v.bus==='ambience').sort((a,b)=>a.priority-b.priority))this.stop(v);
 }
 private startTimer(){if(!this.interval&&!this.disposed)this.interval=setInterval(()=>this.pump(),25);}
 /** `fade` > 0 = slow ambience fade-out (s); otherwise the historic 4 ms anti-click fade. */
 private stop(v:Voice,at=this.context?.currentTime??0,fade=0){if(v.retiring)return;v.retiring=true;const tau=fade>0?fade/3:.004;v.fade=fade;try{v.gain.gain.cancelScheduledValues(at);v.gain.gain.setTargetAtTime(0,at,tau);v.source.stop(at+Math.max(.02,tau*6));}catch{/* Already ended. */}}
 private stopAll(){for(const v of this.voices.values())this.stop(v);this.ambient.clear();this.playedEntries.clear();}
 private clean(v:Voice){if(!this.voices.delete(v.id))return;v.source.disconnect();v.gain.disconnect();v.panner?.disconnect();for(const [key,id]of this.ambient)if(id===v.id)this.ambient.delete(key);this.trimBuffers(0);}
 /** Nodes counted against the hard cap; slow ambience fades (≤ 2 layers) do not block gameplay sounds. */
 private nodeCount(){let n=0;for(const v of this.voices.values())if(!(v.retiring&&v.fade))n++;return n;}
 private allocate(bus:Bus,priority:number,at:number):number|null {
  if(!this.ready||!this.context)return null;
  const active=[...this.voices.values()].filter(v=>!v.retiring),same=active.filter(v=>v.bus==='music');let victim:Voice|undefined;const nodes=this.nodeCount();
  if(bus==='music'&&same.length>=this.budget.maxMusicVoices)victim=same.sort((a,b)=>a.end-b.end)[0];
  else if(active.length>=this.budget.maxTotalVoices)victim=active.filter(v=>v.priority<=priority).sort((a,b)=>a.priority-b.priority||a.end-b.end)[0];
  if((victim||active.length>=this.budget.maxTotalVoices)&&(!victim||nodes>=this.budget.maxTotalVoices+2)){this.dropped++;return null;}
  if(nodes>=this.budget.maxTotalVoices+2){this.dropped++;return null;}
  if(victim){this.stolen++;this.stop(victim);at=Math.max(at,this.context.currentTime+.025);}return at;
 }
 private register(source:AudioScheduledSourceNode,gain:GainNode,bus:Bus,priority:number,start:number,end:number,extra:Partial<Voice>={}):Voice {
  const v:Voice={id:++this.nextId,source,gain,bus,priority,start,end,retiring:false,...extra};this.voices.set(v.id,v);source.onended=()=>this.clean(v);return v;
 }
 private note(patchId:PatchId,note:number,velocity:number,at:number,duration:number,group:number,gain=1){
  if(gain<=0||velocity<=0||this.levels.music===0)return;const c=this.context,start=this.allocate('music',2,at);if(!c||start===null)return;const patch=PATCHES[patchId],source=c.createOscillator(),volume=c.createGain(),off=start+Math.max(.02,Math.min(1800,duration)),peak=patch.gain*velocity*gain;
  source.type=patch.wave;source.frequency.setValueAtTime(440*2**((note-69)/12),start);if(patchId==='soft-drum')source.frequency.exponentialRampToValueAtTime(55,start+.06);
  volume.gain.setValueAtTime(0,start);const attackEnd=Math.min(off,start+patch.attack);volume.gain.linearRampToValueAtTime(peak,attackEnd);volume.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*patch.sustain),Math.min(off,attackEnd+patch.decay));volume.gain.setTargetAtTime(0,off,Math.max(.004,patch.release/4));source.connect(volume);volume.connect(this.buses.music!);this.register(source,volume,'music',2,start,off+patch.release,{group});source.start(start);source.stop(off+patch.release+.02);this.scheduled++;
 }
 private diagnose(message:string){if(this.diagnosticLog.includes(message))return;this.diagnosticLog.push(message);if(this.diagnosticLog.length>40)this.diagnosticLog.shift();}
 private usable=(a:AudioAssetV2)=>assetPlayable(a)&&!this.unavailable.has(a.id);
 private scoreAvailable(id:string){const s=this.catalog.scores[id];return !!s&&this.usable(this.catalog.assets[s.assetId]);}
 private eventPlayable(id:string){let at:AudioDefinitionV2['events'][string]|undefined=this.catalog.events[id],guard=0;while(at&&guard++<8){if(at.variants.some(v=>this.usable(this.catalog.assets[v.assetId])))return true;at=at.fallback?this.catalog.events[at.fallback]:undefined;}return false;}
 /** Static files are resolved from the Vite/GitHub Pages base, never from an absolute domain URL. */
 private async fetchBytes(asset:AudioAssetV2,maxBytes:number):Promise<Uint8Array|null>{
  if(!validAudioUri(asset.uri)){this.unavailable.add(asset.id);return null;}
  try{const response=await this.fetcher(this.baseUrl+asset.uri);if(!response.ok)throw Error('HTTP '+response.status);const length=Number(response.headers.get('content-length')??0);if(length>maxBytes)throw Error('fichier trop volumineux');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>maxBytes||bytes.length<4)throw Error('taille invalide');return bytes;}
  catch(error){this.unavailable.add(asset.id);this.diagnose(`Ressource audio indisponible « ${asset.id} » (${asset.uri}) : ${error instanceof Error?error.message:String(error)} — repli/silence.`);return null;}
 }
 private parseScore(id:string,bytes:Uint8Array):MidiScore|null{try{const parsed=parseMidi(bytes);this.parsed.set(id,parsed);return parsed;}catch(error){this.unavailable.add(this.catalog.scores[id].assetId);this.diagnose(`Partition « ${id} » illisible : ${error instanceof Error?error.message:String(error)}`);return null;}}
 /** Embedded MIDI is parsed synchronously (V1 behaviour); static MIDI is fetched once and cached. */
 private score(id:string):MidiScore|null {
  const definition=this.catalog.scores[id];if(!definition)return null;const cached=this.parsed.get(id);if(cached)return cached;const asset=this.catalog.assets[definition.assetId];if(!this.usable(asset))return null;
  if(asset.bytesBase64!==undefined)return this.parseScore(id,base64Bytes(asset.bytesBase64));
  if(!this.loadingScores.has(id))this.loadingScores.set(id,this.fetchBytes(asset,AUDIO_V2_LIMITS.staticMidiBytes).then(bytes=>bytes?this.parseScore(id,bytes):null).then(parsed=>{const wanted=this.awaited;if(parsed&&wanted?.id===id&&!this.disposed){this.awaited=null;this.requestScore(id,wanted.options);}return parsed;}).finally(()=>this.loadingScores.delete(id)));
  return null;
 }
 requestScore(id:string|undefined,options:{loop?:boolean;immediate?:boolean}={}){if(!id||!this.catalog.scores[id]||!this.context||!this.ready)return;const loop=options.loop??this.catalog.scores[id].loop;if(this.transport?.id===id){this.pending=null;this.transport.loop=loop;return;}if(this.pending?.id===id)return;const score=this.score(id);if(!score){this.awaited={id,options};return;}this.awaited=null;const now=this.context.currentTime;
  if(!this.transport){this.transport={id,score,origin:now+.1,cursor:0,cycle:0,group:++this.group,loop};this.pump();}
  else{const t=this.transport,bar=240/t.score.bpm;this.pending={id,loop,at:options.immediate?now+.12:t.origin+Math.max(1,Math.ceil((now+.12-t.origin)/bar))*bar};}
 }
 /** Ends the current phrase on the next bar (music cues with silence periods). */
 requestSilence(){if(!this.context||!this.transport||this.pending?.id==='')return;const t=this.transport,bar=240/t.score.bpm,now=this.context.currentTime;this.pending={id:'',loop:false,at:t.origin+Math.max(1,Math.ceil((now+.12-t.origin)/bar))*bar};}
 /** One-shot musical cue (discovery, mission success…) through the MusicDirector. */
 triggerCue(cueId:string,context:SoundContext={}):boolean{return this.director.trigger(cueId,{...this.lastContext,...sanitizeContext(context)});}
 private pump(){
  if(!this.ready||!this.context)return;const now=this.context.currentTime,horizon=now+.15;let t=this.transport;if(!t)return;
  if(now>t.origin+t.cycle*t.score.duration+.5&&t.cursor===0){t.origin=now+.05;t.cycle=0;this.late++;}
  let count=0;
  while(t&&count++<256){
   const event=t.score.notes[t.cursor],at=event?t.origin+t.cycle*t.score.duration+event.start:Infinity;
   if(this.pending&&this.pending.at<=horizon&&at>=this.pending.at){const pending=this.pending;for(const v of this.voices.values())if(v.bus==='music'&&v.group===t.group)this.stop(v,pending.at);this.pending=null;const score=pending.id?this.score(pending.id):null;if(!score){this.transport=null;break;}t={id:pending.id,score,origin:pending.at,cursor:0,cycle:0,group:++this.group,loop:pending.loop};this.transport=t;continue;}
   if(!event){if(!t.loop||!t.score.notes.length){if(!this.pending){this.transport=null;break;}const p=this.pending;this.pending={...p,at:Math.min(p.at,Math.max(now+.05,t.origin+(t.cycle+1)*t.score.duration))};if(this.pending.at>horizon)break;continue;}if(t.origin+(t.cycle+1)*t.score.duration>horizon)break;t.cycle++;t.cursor=0;continue;}
   if(at>horizon)break;t.cursor++;if(at<now-.03){this.late++;continue;}
   const definition=this.catalog.scores[t.id],mapped=event.channel===9?'soft-drum':definition.programMap[String(event.program)]??this.catalog.patchIds[0];const patch=this.catalog.patchIds.includes(mapped)?mapped:this.catalog.patchIds[0];this.note(patch,event.note,event.velocity,Math.max(now+.003,at),event.duration,t.group,definition.gain);
  }
 }
 private trimBuffers(extra:number){let total=[...this.buffers.values()].reduce((n,b)=>n+b.bytes,0);const used=new Set([...this.voices.values()].map(v=>v.assetId));for(const [id,b]of [...this.buffers].sort((a,b)=>a[1].used-b[1].used)){if(total+extra<=this.budget.maxPcmBytes)break;if(used.has(id))continue;this.buffers.delete(id);total-=b.bytes;}return total+extra<=this.budget.maxPcmBytes;}
 /** Raw sample bytes or procedural PCM. Embedded WAV keeps the V1 pre-decode checks. */
 private async sourceFor(asset:AudioAssetV2,c:AudioContext):Promise<{bytes?:Uint8Array;pcm?:Float32Array}|null>{
  if(asset.procedural)return {pcm:renderProcedural(asset.procedural,c.sampleRate)};
  if(asset.bytesBase64!==undefined){const bytes=base64Bytes(asset.bytesBase64),info=inspectWav(bytes);if(info.duration*c.sampleRate*info.channels*4>this.budget.maxPcmBytes)return null;return {bytes};}
  if(asset.duration&&asset.duration*c.sampleRate*(asset.channels??1)*4>this.budget.maxPcmBytes)return null;
  const bytes=await this.fetchBytes(asset,AUDIO_V2_LIMITS.staticSampleBytes);if(!bytes)return null;const magic=String.fromCharCode(...bytes.subarray(0,4));
  if((asset.format==='wav'&&magic!=='RIFF')||(asset.format==='ogg'&&magic!=='OggS')){this.unavailable.add(asset.id);this.diagnose(`Ressource audio « ${asset.id} » : contenu incompatible avec le format ${asset.format}.`);return null;}
  return {bytes};
 }
 private buffer(id:string):Promise<AudioBuffer|null>{
  const cached=this.buffers.get(id);if(cached&&cached.bytes>this.budget.maxPcmBytes){this.dropped++;return Promise.resolve(null);}if(cached){cached.used=performance.now();return Promise.resolve(cached.buffer);}const pending=this.decoding.get(id);if(pending)return pending;
  const asset=this.catalog.assets[id];if(!this.context||!asset||asset.kind==='midi'||!this.usable(asset)||this.disposed)return Promise.resolve(null);
  const maxSeconds=asset.kind==='procedural'?AUDIO_V2_LIMITS.proceduralSeconds:asset.bytesBase64!==undefined?8:AUDIO_V2_LIMITS.sampleSeconds;
  const task=new Promise<AudioBuffer|null>(resolve=>{const decode=()=>{if(this.disposed){resolve(null);return;}this.decodeActive++;const c=this.context!;
   const finish=()=>{this.decodeActive--;this.decoding.delete(id);this.decodeQueue.shift()?.();};
   void this.sourceFor(asset,c).then(source=>{if(!source){this.dropped++;return null;}if(source.pcm){const b=c.createBuffer(1,source.pcm.length,c.sampleRate);b.copyToChannel(source.pcm as Float32Array<ArrayBuffer>,0);return b;}return c.decodeAudioData(source.bytes!.slice().buffer as ArrayBuffer);})
    .then(buffer=>{if(!buffer){resolve(null);return;}const bytes=buffer.length*buffer.numberOfChannels*4;if(this.disposed||buffer.duration>maxSeconds+.01||buffer.numberOfChannels>2||!this.trimBuffers(bytes)){this.dropped++;resolve(null);return;}this.buffers.set(id,{buffer,bytes,used:performance.now()});resolve(buffer);})
    .catch(()=>{this.status='Un échantillon ne peut pas être décodé';this.unavailable.add(id);this.diagnose(`Ressource audio « ${id} » : décodage impossible dans ce navigateur.`);resolve(null);}).finally(finish);};
   if(this.decodeActive<2)decode();else this.decodeQueue.push(decode);});
  this.decoding.set(id,task);void task.finally(()=>this.decoding.delete(id));return task;
 }
 /** Resolution only (Studio preview, tests): which take would play, through which fallback path. */
 resolve(eventId:string,context:SoundContext={}):Resolution {return resolveSound(this.catalog,eventId,sanitizeContext(context),this.picker,this.usable);}
 /** Semantic sound event. Unknown events, planned resources and failures are silent diagnostics, never exceptions. */
 async playEvent(eventId:string,options:PlayEventOptions={}):Promise<number|null>{
  this.eventStats.requested++;const event=this.catalog.events[eventId];
  if(!event){this.eventStats.missing++;this.diagnose(`Événement audio absent du catalogue : « ${String(eventId).slice(0,80)} »`);return null;}
  const bus=options.bus??event.bus;if(!this.ready||event.gain===0||this.levels[bus]===0)return null;
  const radius=options.radius??event.radius,p=event.spatial?options.position:undefined;
  if(p&&Math.hypot(p.x-this.listener.x,p.y-this.listener.y,p.z-this.listener.z)>radius){this.dropped++;this.eventStats.culled++;return null;}
  const requestedAt=performance.now();if(!this.cooldowns.allow(event.id,requestedAt,event.cooldownMs)){this.eventStats.cooldown++;return null;}
  const resolution=resolveSound(this.catalog,eventId,{...this.lastContext,...sanitizeContext(options.context),...(p?{distance:Math.hypot(p.x-this.listener.x,p.y-this.listener.y,p.z-this.listener.z)}:{})},this.picker,this.usable);
  if(!resolution.ok){this.eventStats.missing++;this.diagnose(`« ${eventId} » : aucune ressource disponible (${resolution.path.join(' → ')}) — silence.`);return null;}
  const sound=resolution.sound,loop=options.loop??event.loop,buffer=await this.buffer(sound.asset.id);if(!buffer||!this.ready||!this.context)return null;
  if(!loop&&event.maxLatencyMs>0&&performance.now()-requestedAt>event.maxLatencyMs){this.eventStats.late++;return null;}
  const sameEvent=[...this.voices.values()].filter(v=>!v.retiring&&v.eventId===event.id);
  if(sameEvent.length>=event.maxInstances){if(event.steal==='none'){this.eventStats.instanceLimited++;return null;}this.stop(sameEvent.sort((a,b)=>a.start-b.start)[0]);this.stolen++;}
  const c=this.context,priority=options.priority??Math.min(10,event.priority+(options.source==='player'?1:0)),start=this.allocate(bus,priority,c.currentTime+.005);if(start===null)return null;
  if(p&&[...this.voices.values()].filter(v=>v.panner&&!v.retiring).length>=this.budget.maxSpatial){this.dropped++;return null;}
  const source=c.createBufferSource(),gain=c.createGain(),level=sound.gain*(options.gainScale??1),fadeIn=Math.max(.02,options.fadeIn??.02);source.buffer=buffer;source.loop=loop;
  if(loop&&sound.asset.loopStart!==undefined&&sound.asset.loopEnd!==undefined){source.loopStart=sound.asset.loopStart;source.loopEnd=sound.asset.loopEnd;}
  source.playbackRate.value=sound.pitch;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+fadeIn);source.connect(gain);let panner:PannerNode|undefined;
  if(p){panner=c.createPanner();panner.panningModel='equalpower';panner.distanceModel='linear';panner.refDistance=1;panner.maxDistance=radius;panner.rolloffFactor=1;positionPanner(panner,p);gain.connect(panner);panner.connect(this.buses[bus]!);}else gain.connect(this.buses[bus]!);
  const end=loop?Infinity:start+buffer.duration/sound.pitch;if(!loop)gain.gain.setTargetAtTime(0,Math.max(start+.02,end-.025),.005);const voice=this.register(source,gain,bus,priority,start,end,{panner,assetId:sound.asset.id,eventId:event.id,baseGain:sound.gain,scale:options.gainScale??1,rampEnd:start+fadeIn});source.start(start);if(!loop)source.stop(end+.02);this.eventStats.played++;return voice.id;
 }
 /** V1 API: a soundId is now an event id (migration keeps the same ids and parameters). */
 playSound(id:string,options:{bus?:'sfx'|'ambience';position?:Point;radius?:number;loop?:boolean;priority?:number;gainScale?:number;fadeIn?:number;context?:SoundContext;source?:'player'|'world'|'ui'}={}):Promise<number|null>{return this.playEvent(id,options);}
 updateScene(position:Point,entityPosition:(id:string)=>Point|undefined,state:{night:boolean;rain:boolean;water:boolean},level:number,forward={x:0,y:0,z:1},extra:SceneExtra={}){
  this.listener={...position};this.applyBudget(level);if(this.context){const listener=this.context.listener;positionListener(listener,{x:position.x,y:position.y+1.4,z:position.z},forward);}
  const context=extra.context?sanitizeContext(extra.context):{time:state.night?'night' as const:'day' as const,weather:state.rain?'rain' as const:'clear' as const,nearWater:state.water};this.lastContext=context;
  if(this.ready&&this.context){const music=this.director.update(this.context.currentTime,context,this.transport?.id??null);if(music.type==='play')this.requestScore(music.scoreId,{loop:music.loop,immediate:music.immediate});else if(music.type==='silence')this.requestSilence();}
  const layers=this.mixer.loops(context,this.budget.ambienceLayers).map(l=>({id:l.key,soundId:l.eventId,radius:1,priority:l.priority,loop:true,bus:'ambience' as const,gain:l.gain,fade:l.fadeSeconds}));
  const emitters=this.emitterIndex.audible(position,entityPosition,this.budget.maxSpatial).map(({emitter:e,position:p})=>({id:e.id,soundId:e.soundId,position:p,radius:e.radius,priority:e.priority,loop:e.loop,bus:'ambience' as const,gain:1,fade:0}));
  const loops=(extra.loops??[]).filter(l=>this.catalog.events[l.eventId]).map(l=>({id:l.key,soundId:l.eventId,radius:1,priority:2,loop:true,bus:l.bus,gain:l.gain,fade:.4}));
  this.desiredAmbient=[...layers,...emitters,...loops];const wanted=new Map(this.desiredAmbient.map(e=>[e.id,e]));for(const [key,id]of this.ambient)if(!wanted.has(key)){const v=this.voices.get(id);if(v)this.stop(v,undefined,v.fade??0);this.ambient.delete(key);}for(const key of this.playedEntries)if(!wanted.has(key))this.playedEntries.delete(key);
  for(const emitter of this.desiredAmbient){const current=this.voices.get(this.ambient.get(emitter.id)??-1);if(current&&this.context){if(current.panner&&emitter.position)positionPanner(current.panner,emitter.position,this.context.currentTime);const now=this.context.currentTime;if(!current.retiring&&current.baseGain!==undefined&&current.scale!==undefined&&Math.abs(current.scale-emitter.gain)>.02&&now>(current.rampEnd??0)){current.scale=emitter.gain;current.gain.gain.cancelScheduledValues(now);current.gain.gain.setTargetAtTime(current.baseGain*emitter.gain,now,.25);}}
   if(this.ambient.has(emitter.id)||!this.ready||!emitter.loop&&this.playedEntries.has(emitter.id))continue;if(!emitter.loop)this.playedEntries.add(emitter.id);this.ambient.set(emitter.id,-1);
   void this.playEvent(emitter.soundId,{bus:emitter.bus,position:emitter.position,radius:emitter.radius,loop:emitter.loop,priority:Math.min(1,emitter.priority/10),gainScale:emitter.gain,fadeIn:emitter.fade,context}).then(id=>{if(!this.desiredAmbient.some(e=>e.id===emitter.id)||this.disposed){if(id){const v=this.voices.get(id);if(v)this.stop(v,undefined,emitter.fade);}this.ambient.delete(emitter.id);}else if(id){const v=this.voices.get(id);if(v)v.fade=emitter.fade;this.ambient.set(emitter.id,id);}else this.ambient.delete(emitter.id);});}
  if(this.ready&&this.context)for(const shot of this.mixer.due(context,this.context.currentTime))void this.playEvent(shot.eventId,{bus:'ambience',gainScale:shot.gain,priority:.1,context});
 }
 async setHidden(hidden:boolean){this.hidden=hidden;if(!this.context)return;if(hidden){if(this.interval)clearInterval(this.interval);this.interval=null;this.stopAll();for(const v of [...this.voices.values()]){try{v.source.stop(this.context.currentTime);}catch{}this.clean(v);}this.transport=null;this.pending=null;try{await this.context.suspend();}catch{/* Silent fallback. */}}else if(this.enabled){await this.unlock();}}
 get diagnostics():readonly string[]{return [...this.diagnosticLog];}
 get metrics(){let rms=0;if(this.analyser&&this.context?.state==='running'){this.analyser.getFloatTimeDomainData(this.samples);for(const n of this.samples)rms+=n*n;rms=Math.sqrt(rms/this.samples.length);}const voices=[...this.voices.values()];const music=this.director.status;
  return {status:this.status,contexts:this.contextCount,audioTime:this.context?.currentTime??0,state:this.context?.state??'not-created',muted:this.levels.muted,voices:voices.filter(v=>!v.retiring).length,retiring:voices.filter(v=>v.retiring).length,nodes:voices.length,musicVoices:voices.filter(v=>v.bus==='music'&&!v.retiring).length,spatial:voices.filter(v=>v.panner&&!v.retiring).length,pcmBytes:[...this.buffers.values()].reduce((s,b)=>s+b.bytes,0),cachedAssets:this.buffers.size,decoding:this.decodeActive,dropped:this.dropped,stolen:this.stolen,lateNotes:this.late,scheduledNotes:this.scheduled,rms,score:this.transport?.id??null,cue:music.cueId,ambience:[...this.ambient.keys()].filter(k=>k.startsWith('amb:')||k.startsWith('state:')),events:{...this.eventStats},unavailable:this.unavailable.size,diagnostics:this.diagnosticLog.length,catalogVersion:this.catalog.meta?.catalogVersion??null,budget:{...this.budget}};}
 async dispose(){if(this.disposed)return;this.disposed=true;if(this.interval)clearInterval(this.interval);this.interval=null;this.stopAll();try{await this.context?.close();}catch{/* Already closed. */}for(const voice of [...this.voices.values()])this.clean(voice);this.buffers.clear();for(const cancel of this.decodeQueue)cancel();this.decodeQueue=[];this.decoding.clear();this.buses={};this.master?.disconnect();this.analyser?.disconnect();this.transport=null;this.mixer.reset();this.cooldowns.clear();}
}
