import {AudioEngine} from './engine.ts';
import type {AudioDefinition} from './schema.ts';
import './view.css';
export function createAudioController(definition:AudioDefinition){
 const engine=new AudioEngine(definition),panel=document.createElement('details'),summary=document.createElement('summary'),status=document.createElement('p');panel.className='audio-controls';summary.textContent='Son';panel.append(summary,status);
 const mute=document.createElement('input');mute.type='checkbox';mute.checked=engine.settings.muted;mute.setAttribute('aria-label','Couper le son');const muteLabel=document.createElement('label');muteLabel.textContent='Couper le son';muteLabel.append(mute);panel.append(muteLabel);
 mute.onchange=()=>{engine.setLevels({muted:mute.checked});if(!mute.checked)void engine.unlock();};
 for(const [key,title]of [['master','Volume général'],['music','Musique'],['sfx','Effets'],['ambience','Ambiance']] as const){const label=document.createElement('label'),input=document.createElement('input');input.type='range';input.min='0';input.max='1';input.step='.01';input.value=String(engine.settings[key]);input.setAttribute('aria-label',title);input.oninput=()=>engine.setLevels({[key]:Number(input.value)});label.textContent=title;label.append(input);panel.append(label);}
 const activate=document.createElement('button');activate.textContent='Activer / reprendre le son';activate.type='button';activate.onclick=()=>void engine.unlock();panel.append(activate);document.body.append(panel);
 const visibility=()=>{void engine.setHidden(document.hidden);};document.addEventListener('visibilitychange',visibility);let lastUpdate=0,lastStep=0,lastPosition:{x:number;z:number}|null=null;
 return {engine,start:()=>engine.unlock(),playSound:(id:string,position?:{x:number;y:number;z:number})=>{void engine.playSound(id,{position});},
  update(now:number,position:{x:number;y:number;z:number},entityPosition:(id:string)=>{x:number;y:number;z:number}|undefined,state:{night:boolean;rain:boolean;water:boolean},level:number,movingOnGround:boolean,forward={x:0,y:0,z:1}){
   if(now-lastUpdate>200){lastUpdate=now;engine.updateScene(position,entityPosition,state,level,forward);const m=engine.metrics;status.textContent=m.muted?'Son coupé':`${m.status} · ${m.voices} voix · ${Math.round(m.pcmBytes/1024)} Kio PCM`;}
   if(lastPosition&&movingOnGround&&Math.hypot(position.x-lastPosition.x,position.z-lastPosition.z)>.9&&now-lastStep>220){lastStep=now;lastPosition={x:position.x,z:position.z};void engine.playSound('step',{priority:4});}else if(!lastPosition||!movingOnGround)lastPosition={x:position.x,z:position.z};
  },async dispose(){document.removeEventListener('visibilitychange',visibility);panel.remove();await engine.dispose();}
 };
}
export type AudioController=ReturnType<typeof createAudioController>;
