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
 const activate=document.createElement('button');activate.textContent='Activer / reprendre le son';activate.type='button';activate.onclick=()=>void engine.unlock();
 mixer.append(activate,status);panel.append(mixer);document.body.append(panel);

