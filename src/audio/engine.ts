import {AudioEmitterIndex} from './spatial.ts';
import {inspectWav} from './wav.ts';
import {audioBudgetForLevel,type AudioBudget} from './budget.ts';
import {base64Bytes,parseAudioDefinition,PATCHES,type AudioDefinition,type PatchId} from './schema.ts';
import {parseMidi,type MidiScore} from './midi.ts';
export interface AudioLevels {master:number;music:number;sfx:number;ambience:number;muted:boolean;}
export const DEFAULT_LEVELS:AudioLevels={master:.55,music:.4,sfx:.65,ambience:.3,muted:false};
type Bus='music'|'sfx'|'ambience';
interface Voice {id:number;source:AudioScheduledSourceNode;gain:GainNode;panner?:PannerNode;bus:Bus;priority:number;start:number;end:number;retiring:boolean;group?:number;assetId?:string;}
interface Transport {id:string;score:MidiScore;origin:number;cursor:number;cycle:number;group:number;}
const SETTINGS='little-world:audio:v1';
export class AudioEngine {
 readonly definition:AudioDefinition;
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
 private pending:{id:string;at:number}|null=null;
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
 private desiredAmbient:{id:string;soundId:string;position?:{x:number;y:number;z:number};radius:number;priority:number;loop:boolean}[]=[];
 private status='Audio prêt à activer';
 private dropped=0;
 private stolen=0;
 private late=0;
 private scheduled=0;
 private contextCount=0;
 private samples=new Float32Array(256);
 constructor(raw:AudioDefinition,privateFactory?:()=>AudioContext){
  this.definition=parseAudioDefinition(raw);this.emitterIndex=new AudioEmitterIndex(this.definition.emitters);this.factory=privateFactory??(()=>new AudioContext({latencyHint:'interactive'}));
  try{const raw=JSON.parse(localStorage.getItem(SETTINGS)??'null');if(raw&&typeof raw==='object')for(const key of ['master','music','sfx','ambience'] as const)if(Number.isFinite(raw[key]))this.levels[key]=Math.max(0,Math.min(1,raw[key]));if(typeof raw?.muted==='boolean')this.levels.muted=raw.muted;}catch{/* Optional device preference. */}
 }
 private factory:()=>AudioContext;
 audition(patch:PatchId){if(!this.definition.patchIds.includes(patch))throw Error('Timbre non disponible');if(this.context)this.note(patch,patch==='soft-drum'?45:72,.6,this.context.currentTime+.03,.7,0);}
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
 private stop(v:Voice,at=this.context?.currentTime??0){if(v.retiring)return;v.retiring=true;try{v.gain.gain.cancelScheduledValues(at);v.gain.gain.setTargetAtTime(0,at,.004);v.source.stop(at+.02);}catch{/* Already ended. */}}
 private stopAll(){for(const v of this.voices.values())this.stop(v);this.ambient.clear();this.playedEntries.clear();}
 private clean(v:Voice){if(!this.voices.delete(v.id))return;v.source.disconnect();v.gain.disconnect();v.panner?.disconnect();for(const [key,id]of this.ambient)if(id===v.id)this.ambient.delete(key);this.trimBuffers(0);}
 private allocate(bus:Bus,priority:number,at:number):number|null {
  if(!this.ready||!this.context)return null;
  const active=[...this.voices.values()].filter(v=>!v.retiring),same=active.filter(v=>v.bus==='music');let victim:Voice|undefined;
  if(bus==='music'&&same.length>=this.budget.maxMusicVoices)victim=same.sort((a,b)=>a.end-b.end)[0];
  else if(active.length>=this.budget.maxTotalVoices)victim=active.filter(v=>v.priority<=priority).sort((a,b)=>a.priority-b.priority||a.end-b.end)[0];
  if((victim||active.length>=this.budget.maxTotalVoices)&&(!victim||this.voices.size>=this.budget.maxTotalVoices+2)){this.dropped++;return null;}
  if(this.voices.size>=this.budget.maxTotalVoices+2){this.dropped++;return null;}
  if(victim){this.stolen++;this.stop(victim);at=Math.max(at,this.context.currentTime+.025);}return at;
 }
 private register(source:AudioScheduledSourceNode,gain:GainNode,bus:Bus,priority:number,start:number,end:number,extra:Partial<Voice>={}):Voice {
  const v:Voice={id:++this.nextId,source,gain,bus,priority,start,end,retiring:false,...extra};this.voices.set(v.id,v);source.onended=()=>this.clean(v);return v;
 }
 private note(patchId:PatchId,note:number,velocity:number,at:number,duration:number,group:number,gain=1){
  if(gain<=0||velocity<=0||this.levels.music===0)return;const c=this.context,start=this.allocate('music',2,at);if(!c||start===null)return;const patch=PATCHES[patchId],source=c.createOscillator(),volume=c.createGain(),off=start+Math.max(.02,Math.min(8,duration)),peak=patch.gain*velocity*gain;
  source.type=patch.wave;source.frequency.setValueAtTime(440*2**((note-69)/12),start);if(patchId==='soft-drum')source.frequency.exponentialRampToValueAtTime(55,start+.06);
  volume.gain.setValueAtTime(0,start);const attackEnd=Math.min(off,start+patch.attack);volume.gain.linearRampToValueAtTime(peak,attackEnd);volume.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*patch.sustain),Math.min(off,attackEnd+patch.decay));volume.gain.setTargetAtTime(0,off,Math.max(.004,patch.release/4));source.connect(volume);volume.connect(this.buses.music!);this.register(source,volume,'music',2,start,off+patch.release,{group});source.start(start);source.stop(off+patch.release+.02);this.scheduled++;
 }
 private score(id:string):MidiScore|null {const definition=this.definition.scores[id];if(!definition)return null;let parsed=this.parsed.get(id);if(!parsed){parsed=parseMidi(base64Bytes(this.definition.assets[definition.assetId].bytesBase64));this.parsed.set(id,parsed);}return parsed;}
 requestScore(id:string|undefined){if(!id||!this.definition.scores[id]||!this.context||!this.ready)return;if(this.transport?.id===id){this.pending=null;return;}if(this.pending?.id===id)return;const now=this.context.currentTime;
  if(!this.transport){const score=this.score(id)!;this.transport={id,score,origin:now+.1,cursor:0,cycle:0,group:++this.group};this.pump();}
  else{const t=this.transport,bar=240/t.score.bpm;this.pending={id,at:t.origin+Math.max(1,Math.ceil((now+.12-t.origin)/bar))*bar};}
 }
 private pump(){
  if(!this.ready||!this.context)return;const now=this.context.currentTime,horizon=now+.15;let t=this.transport;if(!t)return;
  if(now>t.origin+t.cycle*t.score.duration+.5&&t.cursor===0){t.origin=now+.05;t.cycle=0;this.late++;}
  let count=0;
  while(t&&count++<256){
   const event=t.score.notes[t.cursor],at=event?t.origin+t.cycle*t.score.duration+event.start:Infinity;
   if(this.pending&&this.pending.at<=horizon&&at>=this.pending.at){const pending=this.pending;for(const v of this.voices.values())if(v.bus==='music'&&v.group===t.group)this.stop(v,pending.at);const score=this.score(pending.id)!;t={id:pending.id,score,origin:pending.at,cursor:0,cycle:0,group:++this.group};this.transport=t;this.pending=null;continue;}
   if(!event){if(!this.definition.scores[t.id].loop||!t.score.notes.length){this.transport=null;break;}if(t.origin+(t.cycle+1)*t.score.duration>horizon)break;t.cycle++;t.cursor=0;continue;}
   if(at>horizon)break;t.cursor++;if(at<now-.03){this.late++;continue;}
   const definition=this.definition.scores[t.id],mapped=event.channel===9?'soft-drum':definition.programMap[String(event.program)]??this.definition.patchIds[0];const patch=this.definition.patchIds.includes(mapped)?mapped:this.definition.patchIds[0];this.note(patch,event.note,event.velocity,Math.max(now+.003,at),event.duration,t.group,definition.gain);
  }
 }
 private trimBuffers(extra:number){let total=[...this.buffers.values()].reduce((n,b)=>n+b.bytes,0);const used=new Set([...this.voices.values()].map(v=>v.assetId));for(const [id,b]of [...this.buffers].sort((a,b)=>a[1].used-b[1].used)){if(total+extra<=this.budget.maxPcmBytes)break;if(used.has(id))continue;this.buffers.delete(id);total-=b.bytes;}return total+extra<=this.budget.maxPcmBytes;}
 private buffer(id:string):Promise<AudioBuffer|null>{
  const cached=this.buffers.get(id);if(cached&&cached.bytes>this.budget.maxPcmBytes){this.dropped++;return Promise.resolve(null);}if(cached){cached.used=performance.now();return Promise.resolve(cached.buffer);}const pending=this.decoding.get(id);if(pending)return pending;
  const asset=this.definition.assets[id];if(!this.context||asset?.kind!=='sample'||this.disposed)return Promise.resolve(null);
  const task=new Promise<AudioBuffer|null>(resolve=>{const decode=()=>{if(this.disposed){resolve(null);return;}this.decodeActive++;const c=this.context!,bytes=base64Bytes(asset.bytesBase64),info=inspectWav(bytes);if(info.duration*c.sampleRate*info.channels*4>this.budget.maxPcmBytes){this.decodeActive--;this.dropped++;resolve(null);this.decoding.delete(id);this.decodeQueue.shift()?.();return;}void Promise.resolve().then(()=>c.decodeAudioData(bytes.slice().buffer as ArrayBuffer)).then(buffer=>{const bytes=buffer.length*buffer.numberOfChannels*4;if(this.disposed||buffer.duration>8||buffer.numberOfChannels>2||!this.trimBuffers(bytes)){this.dropped++;resolve(null);return;}this.buffers.set(id,{buffer,bytes,used:performance.now()});resolve(buffer);}).catch(()=>{this.status='Un échantillon ne peut pas être décodé';resolve(null);}).finally(()=>{this.decodeActive--;this.decoding.delete(id);this.decodeQueue.shift()?.();});};if(this.decodeActive<2)decode();else this.decodeQueue.push(decode);});this.decoding.set(id,task);void task.finally(()=>this.decoding.delete(id));return task;
 }
 async playSound(id:string,options:{bus?:'sfx'|'ambience';position?:{x:number;y:number;z:number};radius?:number;loop?:boolean;priority?:number}={}):Promise<number|null>{
  const definition=this.definition.sounds[id];if(!definition||!this.ready||definition.gain===0||this.levels[options.bus??'sfx']===0)return null;const radius=options.radius??40,p=options.position;if(p&&Math.hypot(p.x-this.listener.x,p.y-this.listener.y,p.z-this.listener.z)>radius){this.dropped++;return null;}
  const buffer=await this.buffer(definition.assetId);if(!buffer||!this.ready||!this.context)return null;const c=this.context,bus=options.bus??'sfx',priority=options.priority??4,start=this.allocate(bus,priority,c.currentTime+.005);if(start===null)return null;
  if(p&&[...this.voices.values()].filter(v=>v.panner&&!v.retiring).length>=this.budget.maxSpatial){this.dropped++;return null;}
  const source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;source.loop=!!options.loop;source.playbackRate.value=definition.pitch;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(definition.gain,start+.02);source.connect(gain);let panner:PannerNode|undefined;
  if(p){panner=c.createPanner();panner.panningModel='equalpower';panner.distanceModel='linear';panner.refDistance=1;panner.maxDistance=radius;panner.rolloffFactor=1;panner.positionX.value=p.x;panner.positionY.value=p.y;panner.positionZ.value=p.z;gain.connect(panner);panner.connect(this.buses[bus]!);}else gain.connect(this.buses[bus]!);
  const end=source.loop?Infinity:start+buffer.duration/definition.pitch;if(!source.loop)gain.gain.setTargetAtTime(0,Math.max(start+.02,end-.025),.005);const voice=this.register(source,gain,bus,priority,start,end,{panner,assetId:definition.assetId});source.start(start);if(!source.loop)source.stop(end+.02);return voice.id;
 }
 updateScene(position:{x:number;y:number;z:number},entityPosition:(id:string)=>{x:number;y:number;z:number}|undefined,state:{night:boolean;rain:boolean;water:boolean},level:number,forward={x:0,y:0,z:1}){
  this.listener={...position};this.applyBudget(level);if(this.context){const listener=this.context.listener;listener.positionX.value=position.x;listener.positionY.value=position.y+1.4;listener.positionZ.value=position.z;listener.forwardX.value=forward.x;listener.forwardY.value=forward.y;listener.forwardZ.value=forward.z;}
  this.requestScore(state.night?this.definition.music.night:this.definition.music.day);
  const emitters=this.emitterIndex.audible(position,entityPosition,this.budget.maxSpatial).map(({emitter:e,position:p})=>({id:e.id,soundId:e.soundId,position:p,radius:e.radius,priority:e.priority,loop:e.loop}));
  const global:{id:string;soundId:string;radius:number;priority:number;loop:boolean}[]=[];for(const kind of ['rain','water','night'] as const)if(state[kind]&&this.definition.ambience[kind])global.push({id:'global:'+kind,soundId:this.definition.ambience[kind]!,radius:1,priority:kind==='rain'?2:1,loop:true});
  this.desiredAmbient=[...global.slice(0,this.budget.ambienceLayers),...emitters];const wanted=new Set(this.desiredAmbient.map(e=>e.id));for(const [key,id]of this.ambient)if(!wanted.has(key)){const v=this.voices.get(id);if(v)this.stop(v);this.ambient.delete(key);}for(const key of this.playedEntries)if(!wanted.has(key))this.playedEntries.delete(key);
  for(const emitter of this.desiredAmbient){const current=this.voices.get(this.ambient.get(emitter.id)??-1);if(current?.panner&&emitter.position&&this.context){current.panner.positionX.setTargetAtTime(emitter.position.x,this.context.currentTime,.03);current.panner.positionY.setTargetAtTime(emitter.position.y,this.context.currentTime,.03);current.panner.positionZ.setTargetAtTime(emitter.position.z,this.context.currentTime,.03);}if(this.ambient.has(emitter.id)||!this.ready||!emitter.loop&&this.playedEntries.has(emitter.id))continue;if(!emitter.loop)this.playedEntries.add(emitter.id);this.ambient.set(emitter.id,-1);void this.playSound(emitter.soundId,{bus:'ambience',position:emitter.position,radius:emitter.radius,loop:emitter.loop,priority:Math.min(1,emitter.priority/10)}).then(id=>{if(!this.desiredAmbient.some(e=>e.id===emitter.id)||this.disposed){if(id){const v=this.voices.get(id);if(v)this.stop(v);}this.ambient.delete(emitter.id);}else if(id)this.ambient.set(emitter.id,id);else this.ambient.delete(emitter.id);});}
 }
 async setHidden(hidden:boolean){this.hidden=hidden;if(!this.context)return;if(hidden){if(this.interval)clearInterval(this.interval);this.interval=null;this.stopAll();for(const v of [...this.voices.values()]){try{v.source.stop(this.context.currentTime);}catch{}this.clean(v);}this.transport=null;this.pending=null;try{await this.context.suspend();}catch{/* Silent fallback. */}}else if(this.enabled){await this.unlock();}}
 get metrics(){let rms=0;if(this.analyser&&this.context?.state==='running'){this.analyser.getFloatTimeDomainData(this.samples);for(const n of this.samples)rms+=n*n;rms=Math.sqrt(rms/this.samples.length);}const voices=[...this.voices.values()];return {status:this.status,contexts:this.contextCount,state:this.context?.state??'not-created',muted:this.levels.muted,voices:voices.filter(v=>!v.retiring).length,retiring:voices.filter(v=>v.retiring).length,nodes:voices.length,musicVoices:voices.filter(v=>v.bus==='music'&&!v.retiring).length,spatial:voices.filter(v=>v.panner&&!v.retiring).length,pcmBytes:[...this.buffers.values()].reduce((s,b)=>s+b.bytes,0),decoding:this.decodeActive,dropped:this.dropped,stolen:this.stolen,lateNotes:this.late,scheduledNotes:this.scheduled,rms,score:this.transport?.id??null,budget:{...this.budget}};}
 async dispose(){if(this.disposed)return;this.disposed=true;if(this.interval)clearInterval(this.interval);this.interval=null;this.stopAll();try{await this.context?.close();}catch{/* Already closed. */}for(const voice of [...this.voices.values()])this.clean(voice);this.buffers.clear();for(const cancel of this.decodeQueue)cancel();this.decodeQueue=[];this.decoding.clear();this.buses={};this.master?.disconnect();this.analyser?.disconnect();this.transport=null;}
}
