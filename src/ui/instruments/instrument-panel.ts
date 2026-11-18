/** Compact playable keyboard: equipped item controls the patch; never a synthesizer selector. */
import type {InstrumentDefinition} from '../../instruments/definitions.ts';
import type {PatchId} from '../../audio/schema.ts';
import {el,button} from '../shared/dom.ts';
import './instrument.css';

type Layout='grid'|'piano';
const LAYOUT_KEY='little-world:instrument-layout:v1';
const WHITE=[0,2,4,5,7,9,11,12,14,16,17,19,21,23,24] as const;
const BLACK=[{semi:1,after:0},{semi:3,after:1},{semi:6,after:3},{semi:8,after:4},{semi:10,after:5},
 {semi:13,after:7},{semi:15,after:8},{semi:18,after:10},{semi:20,after:11},{semi:22,after:12}] as const;
// Physical key codes: AZERTY and QWERTY preserve the same key positions.
const WHITE_CODES=['Digit1','Digit2','Digit3','Digit4','Digit5','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyA','KeyS','KeyD','KeyF','KeyG'];
const BLACK_CODES=['Digit6','Digit7','Digit8','Digit9','Digit0','KeyH','KeyJ','KeyK','KeyL','Semicolon'];
const NAMES=['Do','Do♯','Ré','Ré♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
const label=(midi:number)=>NAMES[midi%12]+(Math.floor(midi/12)-1);

export interface InstrumentPanelDeps {
  equipped():InstrumentDefinition|null;
  noteOn(patch:PatchId,note:number):boolean;
  noteOff(note:number):void;
  allNotesOff():void;
  unlock():Promise<boolean>;
}
export function createInstrumentPanel(deps:InstrumentPanelDeps){
 let layout:Layout='grid';
 try{if(localStorage.getItem(LAYOUT_KEY)==='piano')layout='piano';}catch{/* optional */}
 let octave=0,active=false,root:HTMLElement|null=null,status:HTMLElement|null=null;
 const held=new Map<string,number>(),playing=new Set<number>();
 function highlight(){
  root?.querySelectorAll<HTMLButtonElement>('[data-midi]').forEach(key=>{
   const on=playing.has(Number(key.dataset.midi));
   key.classList.toggle('lw-note-down',on);key.setAttribute('aria-pressed',String(on));
  });
 }
 function release(source:string){
  const note=held.get(source);if(note===undefined)return;
  held.delete(source);
  if(![...held.values()].includes(note)){playing.delete(note);deps.noteOff(note);}
  highlight();
 }
 function releaseAll(){
  held.clear();playing.clear();deps.allNotesOff();highlight();
 }
 function press(source:string,semitone:number){
  if(!active||held.has(source))return;
  const instrument=deps.equipped(),note=60+octave*12+semitone;
  if(!instrument||note<instrument.minNote||note>instrument.maxNote)return;
  held.set(source,note);
  if(playing.has(note)){highlight();return;}
  // The first click can unlock the browser audio context; ignore its completion
  // if the note was released or the instrument changed during the await.
  const begin=()=>{
   if(!active||held.get(source)!==note||deps.equipped()?.itemId!==instrument.itemId||playing.has(note))return;
   if(deps.noteOn(instrument.patchId,note)){playing.add(note);highlight();if(status)status.textContent='';}
   else if(status)status.textContent='Son indisponible ou volume musical coupé.';
  };
  if(!deps.noteOn(instrument.patchId,note)){
   void deps.unlock().then(begin).catch(()=>{if(status)status.textContent='Impossible de démarrer le son.';});
  }else{playing.add(note);highlight();if(status)status.textContent='';}
 }
 function stop(){
  active=false;releaseAll();root=null;status=null;
  window.removeEventListener('keydown',onKeyDown,true);
  window.removeEventListener('keyup',onKeyUp,true);
  window.removeEventListener('blur',onBlur);
  document.removeEventListener('visibilitychange',onVisibility);
 }
 function keyOffset(code:string):number|undefined{
  const white=WHITE_CODES.indexOf(code);
  if(white>=0)return WHITE[white];
  if(layout==='piano'){const black=BLACK_CODES.indexOf(code);if(black>=0)return BLACK[black].semi;}
  return undefined;
 }
 function onKeyDown(e:KeyboardEvent){
  if(!active||e.ctrlKey||e.altKey||e.metaKey)return;
  const offset=keyOffset(e.code);
  if(offset===undefined)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!e.repeat)press('key:'+e.code,offset);
 }
 function onKeyUp(e:KeyboardEvent){
  if(!active)return;
  if(keyOffset(e.code)===undefined)return;
  e.preventDefault();e.stopImmediatePropagation();release('key:'+e.code);
 }
 const onBlur=()=>releaseAll();
 const onVisibility=()=>{if(document.hidden)releaseAll();};
 function makeNote(semitone:number,code:string|undefined,kind:'white'|'black'|'grid'){
  const b=button('',()=>{},'lw-note lw-note-'+kind);
  const midi=60+octave*12+semitone;b.dataset.midi=String(midi);
  b.setAttribute('aria-label',label(midi)+(code?' · '+code.replace('Key',''):''));
  b.setAttribute('aria-pressed','false');
  b.textContent=label(midi);
  if(code){const hint=el('small','lw-note-hint',code.replace('Digit','').replace('Key',''));b.append(hint);}
  b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);press('ptr:'+e.pointerId,semitone);});
  b.addEventListener('pointerup',e=>release('ptr:'+e.pointerId));
  b.addEventListener('pointercancel',e=>release('ptr:'+e.pointerId));
  b.addEventListener('lostpointercapture',e=>release('ptr:'+e.pointerId));
  // Keyboard input is owned by the global handler, not the button's implicit click.
  return b;
 }
 function draw(body:HTMLElement){
  releaseAll();root=body;body.replaceChildren();
  const instrument=deps.equipped();
  if(!instrument){body.append(el('p','ui-muted','Équipez un instrument depuis le sac avant de jouer.'));return;}
  const top=el('div','lw-instrument-head');
  top.append(el('p','',instrument.name+' · '+(layout==='grid'?'15 notes':'Clavier chromatique')));
  const switcher=el('div','lw-instrument-switch');
  for(const [value,name] of [['grid','Grille 3 × 5'],['piano','Piano']] as const){
   const b=button(name,()=>{layout=value;try{localStorage.setItem(LAYOUT_KEY,layout);}catch{/* optional */}draw(body);},'ui-button');
   b.classList.toggle('ui-primary',layout===value);b.setAttribute('aria-pressed',String(layout===value));switcher.append(b);
  }
  body.append(top,switcher);
  const oct=el('div','lw-octave'),less=button('−1 octave',()=>{octave=Math.max(-1,octave-1);draw(body);},'ui-button'),more=button('+1 octave',()=>{octave=Math.min(1,octave+1);draw(body);},'ui-button');
  less.disabled=octave<=-1;more.disabled=octave>=1;
  oct.append(less,el('span','',octave===0?'Octave normale':(octave>0?'+1':'−1')+' octave'),more);body.append(oct);
  if(layout==='grid'){
   const grid=el('div','lw-notes-grid');
   WHITE.forEach((offset,i)=>grid.append(makeNote(offset,WHITE_CODES[i],'grid')));
   body.append(grid);
  }else{
   const scroll=el('div','lw-piano-scroll'),piano=el('div','lw-piano'),whites=el('div','lw-piano-whites');
   WHITE.forEach((offset,i)=>whites.append(makeNote(offset,WHITE_CODES[i],'white')));
   piano.append(whites);
   BLACK.forEach((black,i)=>{const b=makeNote(black.semi,BLACK_CODES[i],'black');b.style.left=((black.after+1)/15*100)+'%';piano.append(b);});
   scroll.append(piano);body.append(scroll);
  }
  status=el('p','ui-muted');status.setAttribute('aria-live','polite');
  body.append(el('p','ui-muted','Maintenez une touche pour jouer ; plusieurs notes peuvent être jouées ensemble.'),
    button('Relâcher les notes',releaseAll,'ui-button'),status);
  highlight();
 }
 return {
  render(body:HTMLElement){
   stop();active=true;octave=0;
   window.addEventListener('keydown',onKeyDown,true);window.addEventListener('keyup',onKeyUp,true);
   window.addEventListener('blur',onBlur);document.addEventListener('visibilitychange',onVisibility);
   draw(body);
  },
  close:stop,
  releaseAll,
 };
}
