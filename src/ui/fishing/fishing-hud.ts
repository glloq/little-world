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
  const heading=root.querySelector<HTMLElement>('.fishing-heading strong')!;
  const progress=root.querySelector<HTMLElement>('.fishing-progress')!;
  const tension=root.querySelector<HTMLElement>('.fishing-tension')!;
  const progressText=root.querySelector<HTMLElement>('.fishing-progress-text')!;
  const tensionText=root.querySelector<HTMLElement>('.fishing-tension-text')!;
  const tip=root.querySelector<HTMLElement>('.fishing-tip')!;
  const bars=root.querySelectorAll<HTMLElement>('[role="progressbar"]');
  let lastProgress=-1,lastTension=-1;
  const setHidden=(hidden:boolean)=>{if(root.hidden!==hidden)root.hidden=hidden;};
  return {
    update(state:FishingState|null,touch=false,fishName?:string){
      const active=state?.phase==='reeling';
      setHidden(!active);
      if(!active||!state)return;
      const p=Math.round(state.progress*100),t=Math.round(state.tension*100);
      const title=fishName?'Au bout de la ligne : '+fishName:'Un poisson est au bout !';
      if(heading.textContent!==title)heading.textContent=title;
      if(p!==lastProgress){
        progress.style.width=p+'%';
        progressText.textContent=p+' %';
        bars[0].setAttribute('aria-valuenow',String(p));
        lastProgress=p;
      }
      if(t!==lastTension){
        tension.style.width=t+'%';
        tensionText.textContent=t+' %';
        bars[1].setAttribute('aria-valuenow',String(t));
        root.classList.toggle('fishing-danger',t>=75);
        lastTension=t;
      }
      const hint=t>=75?'Attention : relâcher !':touch?'Maintenez le bouton Mouliner':'Maintenez E pour mouliner';
      if(tip.textContent!==hint)tip.textContent=hint;
    },
    hide(){setHidden(true);},
    dispose(){root.remove();},
  };
}
