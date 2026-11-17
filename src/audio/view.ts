import {AudioEngine} from './engine.ts';
import {AudioEventRouter,type AudioFrame} from './router.ts';
import type {AnyAudioDefinition} from './migrate.ts';
import type {SoundContext} from './context.ts';
import './view.css';
type Point={x:number;y:number;z:number};
/** A single AudioEngine and a single mixer DOM panel, reparented between quick HUD and settings. */
export function createAudioController(definition:AnyAudioDefinition,options:{baseUrl?:string}={}){
 const engine=new AudioEngine(definition,undefined,{baseUrl:options.baseUrl}),panel=document.createElement('details'),
  summary=document.createElement('summary'),status=document.createElement('p');
 panel.className='audio-controls';summary.textContent='Son';status.className='audio-status';panel.append(summary);
 const mixer=document.createElement('div');mixer.className='audio-mixer';
 const mute=document.createElement('input');mute.type='checkbox';mute.checked=engine.settings.muted;mute.setAttribute('aria-label','Couper le son');
 const muteLabel=document.createElement('label');muteLabel.className='audio-mute';muteLabel.append(mute,document.createTextNode('Couper le son'));
 mute.onchange=()=>{engine.setLevels({muted:mute.checked});if(!mute.checked)void engine.unlock();};
 const volumeLabel=(key:'master'|'music'|'sfx'|'ambience',title:string)=>{
  const label=document.createElement('label'),input=document.createElement('input'),value=document.createElement('output');
  label.className='audio-volume';input.type='range';input.min='0';input.max='1';input.step='.01';input.value=String(engine.settings[key]);input.setAttribute('aria-label',title);
  value.textContent=Math.round(engine.settings[key]*100)+' %';value.setAttribute('aria-hidden','true');
  input.oninput=()=>{engine.setLevels({[key]:Number(input.value)});value.textContent=Math.round(Number(input.value)*100)+' %';};
  label.append(document.createTextNode(title),input,value);return label;
 };
 mixer.append(muteLabel,volumeLabel('master','Volume général'));
 const advanced=document.createElement('details'),advancedTitle=document.createElement('summary');
 advanced.className='audio-mixer-advanced';advancedTitle.textContent='Mixage avancé';advanced.append(advancedTitle);
 for(const [key,title] of [['music','Musique'],['sfx','Effets'],['ambience','Ambiance']] as const)advanced.append(volumeLabel(key,title));
 mixer.append(advanced);
 // The Play gesture, the HUD speaker and unmute resume the engine.
 // Do not show a redundant "resume audio" button in the compact mixer.
 mixer.append(status);panel.append(mixer);document.body.append(panel);
  // Business events → semantic sound events; the engine stays the only owner of voices and budgets.
 const router=new AudioEventRouter(sound=>{void engine.playEvent(sound.eventId,{context:sound.context,position:sound.position,source:sound.source});});
 const visibility=()=>{void engine.setHidden(document.hidden);};document.addEventListener('visibilitychange',visibility);let lastUpdate=0;
 return {engine,router,panel,start:()=>engine.unlock(),
  /** Declarative `playSound` actions (V1 ids and V2 event ids). */
  playSound:(id:string,position?:Point)=>{void engine.playEvent(id,{position,context:router.context});},
  /** Gameplay event with optional context (mine material, crop, species…). */
  emit:(eventId:string,params:{context?:SoundContext;position?:Point;source?:'player'|'world'|'ui'}={})=>router.emit(eventId,params),
  cue:(cueId:string)=>engine.triggerCue(cueId,router.context),
  update(now:number,frame:AudioFrame,entityPosition:(id:string)=>Point|undefined,level:number,forward={x:0,y:0,z:1}){
   const loops=router.observe(frame);
   if(now-lastUpdate>200){lastUpdate=now;engine.updateScene(frame.player.position,entityPosition,{night:frame.world.time==='night',rain:frame.world.weather==='rain',water:frame.world.nearWater},level,forward,{context:router.context,loops});const m=engine.metrics;status.textContent=m.muted?'Son coupé':`${m.status} · ${m.voices} voix · ${Math.round(m.pcmBytes/1024)} Kio PCM${m.cue?' · '+m.cue:''}`;}
  },async dispose(){document.removeEventListener('visibilitychange',visibility);panel.remove();await engine.dispose();}
 };
}
export type AudioController=ReturnType<typeof createAudioController>;
