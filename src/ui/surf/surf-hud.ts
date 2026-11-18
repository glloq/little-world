/** Small surf cue, pure presentation. Physics/score never reads this element. */
export interface SurfHudState {
 stage:'paddle'|'ride'|'air'|null;
 speedMps:number;
 crest:number|null;
 tubeActive?:boolean;
}
export function surfHudText(state:SurfHudState):string{
 const speed=Math.round(Math.max(0,state.speedMps)*3.6);
 if(state.tubeActive)return 'SURF · Dans le tube · '+speed+' km/h · Ressortez avant la fermeture !';
 if(state.stage==='air')return 'SURF · Saut · '+speed+' km/h · Préparez la réception';
 if(state.stage==='paddle')return 'SURF · Rame · '+speed+' km/h · Z / Shift : avancer · B : ranger';
 if(state.stage==='ride'){
   const crest=state.crest!==null&&state.crest>.72?'Crête : Espace pour sauter':state.crest!==null&&state.crest<.35?'Creux : conservez votre vitesse':'Virage : Q/D · Frein : Ctrl';
   return 'SURF · Glisse · '+speed+' km/h · '+crest;
 }
 return '';
}
export function createSurfHud(parent:HTMLElement){
 const el=document.createElement('div');
 el.className='surf-hud';
 el.setAttribute('role','status');
 el.setAttribute('aria-live','off');
 el.hidden=true;parent.append(el);
 return {
  update(state:SurfHudState|null){
   const text=state?surfHudText(state):'';
   el.hidden=!text;
   if(el.textContent!==text)el.textContent=text;
  },
  dispose(){el.remove();}
 };
}
