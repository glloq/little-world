/**
 * Visible progress for every long Studio operation (doc 105): stage label,
 * determinate bar, elapsed time and an optional cancel button. Never leave the
 * author in front of a frozen page without feedback.
 */
import {node,button} from './dom.ts';
import type {CompositionProgress} from '../studio-core/composition-client.ts';

export function createProgress(title:string,onCancel?:()=>void){
 const box=node('div','','studio-progress');box.setAttribute('role','status');box.setAttribute('aria-live','polite');
 const label=node('span',title,'studio-progress-label'),bar=node('div','','studio-progress-bar'),fill=node('div','','studio-progress-fill'),time=node('span','','muted studio-progress-time');
 bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.append(fill);
 box.append(label,bar,time);if(onCancel)box.append(button('Annuler',onCancel,'light-button'));
 const started=performance.now();let timer=setInterval(()=>{time.textContent=Math.round((performance.now()-started)/100)/10+' s';},250);
 return {
  element:box,
  update(p:CompositionProgress){const pct=Math.round(p.index/Math.max(1,p.total)*100);fill.style.width=pct+'%';bar.setAttribute('aria-valuenow',String(pct));label.textContent=`${title} · ${p.label} (${p.index+1}/${p.total})`;box.dataset.stage=p.stage;},
  done(){clearInterval(timer);fill.style.width='100%';bar.setAttribute('aria-valuenow','100');box.dataset.done='true';},
  fail(message:string){clearInterval(timer);label.textContent=message;box.dataset.failed='true';},
  dispose(){clearInterval(timer);timer=0 as unknown as ReturnType<typeof setInterval>;box.remove();},
 };
}
