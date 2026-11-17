/** Browser-assisted landscape preference; a web page cannot force rotation universally.
 * Try fullscreen + ScreenOrientation.lock on the player's Start gesture; present a fallback
 * rotate prompt on browsers that reject the lock (notably iOS Safari). */
export function isPhoneTouchDevice(view:Pick<Window,'matchMedia'>&{screen:Pick<Screen,'width'|'height'>} = window):boolean{
  return view.matchMedia('(pointer: coarse)').matches&&Math.min(view.screen.width,view.screen.height)<=750;
}
export function createMobileLandscape(onBlockingChange:(blocked:boolean)=>void){
  const overlay=document.createElement('div');overlay.className='touch-portrait-guide';overlay.hidden=true;
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Orientation de l’écran recommandée');
  const content=document.createElement('div');content.className='touch-portrait-content';
  const symbol=document.createElement('div');symbol.className='touch-rotate-glyph';symbol.textContent='↻';symbol.setAttribute('aria-hidden','true');
  const title=document.createElement('h2');title.textContent='Tournez votre téléphone';
  const message=document.createElement('p');message.textContent='Little World est optimisé pour jouer en paysage.';
  const retry=document.createElement('button');retry.type='button';retry.textContent='Essayer le mode paysage';
  const continueButton=document.createElement('button');continueButton.type='button';continueButton.textContent='Continuer en portrait';
  continueButton.className='touch-continue-portrait';
  content.append(symbol,title,message,retry,continueButton);overlay.append(content);document.body.append(overlay);
  let started=false,portraitAllowed=false,blocked=false,enteredFullscreen=false;
  const portrait=()=>window.innerHeight>window.innerWidth;
  const update=()=>{
    if(!portrait())portraitAllowed=false;
    const next=started&&portrait()&&!portraitAllowed;
    overlay.hidden=!next;
    if(blocked!==next){blocked=next;onBlockingChange(next);}
  };
  async function tryLandscape():Promise<boolean>{
    if(!started)return false;
    try{
      if(!document.fullscreenElement&&document.documentElement.requestFullscreen){
        await document.documentElement.requestFullscreen();enteredFullscreen=true;
      }
      if(screen.orientation?.lock){await screen.orientation.lock('landscape');update();return true;}
    }catch{/* Fullscreen and orientation lock are permission/browser-dependent. */}
    update();return false;
  }
  retry.addEventListener('click',()=>{void tryLandscape();});
  continueButton.addEventListener('click',()=>{portraitAllowed=true;update();});
  window.addEventListener('resize',update);
  screen.orientation?.addEventListener?.('change',update);
  return {
    get blocked(){return blocked;},
    start(){started=true;update();void tryLandscape();},
    stop(){started=false;portraitAllowed=false;update();if(enteredFullscreen&&document.fullscreenElement){void document.exitFullscreen().catch(()=>{});enteredFullscreen=false;}},
    dispose(){started=false;update();window.removeEventListener('resize',update);screen.orientation?.removeEventListener?.('change',update);overlay.remove();},
  };
}
