import type {FishingState} from '../../gameplay/fishing.ts';
import './fishing-hud.css';
/** Lightweight, non-blocking overlay: no rendering loop, no controls and no game authority. */
export function createFishingHud(){
  const root=document.createElement('section');root.className='fishing-minigame';root.hidden=true;
  root.setAttribute('aria-label','Mini-jeu de pêche');
  root.innerHTML=`<div class="fishing-heading"><strong>Un poisson est au bout !</strong><span class="fishing-tip"></span></div>
    <div class="fishing-meter-label"><span>Capture</span><span class="fishing-progress-text">0 %</span></div>
    <div class="fishing-meter" role="progressbar" aria-label="Capture" aria-valuemin="0" aria-valuemax="100"><div class="fishing-progress"></div></div>
    <div class="fishing-meter-label"><span>Tension de la ligne</span><span class="fishing-tension-text">0 %</span></div>
    <div class="fishing-meter fishing-tension-track" role="progressbar" aria-label="Tension de la ligne" aria-valuemin="0" aria-valuemax="100"><div class="fishing-tension"></div></div>`;
  document.body.append(root);
  const progress=root.querySelector<HTMLElement>('.fishing-progress')!;
  const tension=root.querySelector<HTMLElement>('.fishing-tension')!;
  const progressText=root.querySelector<HTMLElement>('.fishing-progress-text')!;
  const tensionText=root.querySelector<HTMLElement>('.fishing-tension-text')!;
  const tip=root.querySelector<HTMLElement>('.fishing-tip')!;
  const bars=root.querySelectorAll<HTMLElement>('[role="progressbar"]');
  return {
    update(state:FishingState|null,touch=false){
      const active=state?.phase==='reeling';
      root.hidden=!active;
      if(!active||!state)return;
      const p=Math.round(state.progress*100),t=Math.round(state.tension*100);
      progress.style.width=p+'%';tension.style.width=t+'%';
      if(progressText.textContent!==p+' %')progressText.textContent=p+' %';
      if(tensionText.textContent!==t+' %')tensionText.textContent=t+' %';
      bars[0].setAttribute('aria-valuenow',String(p));bars[1].setAttribute('aria-valuenow',String(t));
      root.classList.toggle('fishing-danger',t>=75);
      tip.textContent=t>=75?'Attention : relâcher !':touch?'Maintenez Agir pour mouliner':'Maintenez E pour mouliner';
    },
    hide(){root.hidden=true;},
    dispose(){root.remove();},
  };
}
