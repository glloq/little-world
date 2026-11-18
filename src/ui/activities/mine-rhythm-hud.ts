/** Lightweight real-time mining slider. Only DOM/CSS; no canvas, texture, Three.js
 * mesh, additional render loop or global keyboard handler.
 * Quality is a hint passed to the gameplay authority, never inventory access.
 */
import {MINE_RHYTHMS,mineRhythmAccuracy,mineRhythmPosition,type StrikeAccuracy} from '../../mine/mine-rhythm.ts';

export interface MineRhythmTarget {key:string;material:number;name:string;hitsToReward:number}
export interface MineRhythmSample {key:string;quality:StrikeAccuracy}
export function createMineRhythmHud(parent:HTMLElement,onStrike:(sample:MineRhythmSample)=>void){
  const root=document.createElement('aside');root.className='mine-rhythm-hud';root.hidden=true;
  root.setAttribute('aria-label','Minage de précision');
  const heading=document.createElement('div');heading.className='mine-rhythm-heading';
  const title=document.createElement('strong'),counter=document.createElement('span');
  heading.append(title,counter);
  const track=document.createElement('div');track.className='mine-rhythm-track';
  const good=document.createElement('span');good.className='mine-rhythm-good';
  const perfect=document.createElement('span');perfect.className='mine-rhythm-perfect';
  const marker=document.createElement('span');marker.className='mine-rhythm-marker';
  track.append(good,perfect,marker);
  const bottom=document.createElement('div');bottom.className='mine-rhythm-bottom';
  const hint=document.createElement('span');hint.textContent='F / E au centre · F maintenu = automatique';
  const hit=document.createElement('button');hit.type='button';hit.className='mine-rhythm-hit';
  hit.textContent='Frapper';hit.setAttribute('aria-label','Frapper au bon moment');
  bottom.append(hint,hit);root.append(heading,track,bottom);parent.append(root);
  let current:MineRhythmTarget|null=null,start=0,lastStrike=-Infinity;
  function setTarget(next:MineRhythmTarget|null,now:number){
    if(!next){current=null;root.hidden=true;return;}
    const changed=next.key!==current?.key;
    if(changed){
      start=now;const config=MINE_RHYTHMS[next.material]??MINE_RHYTHMS[2];
      good.style.width=config.goodWindow*200+'%';
      perfect.style.width=config.window*200+'%';
      title.textContent=next.name;root.hidden=false;
      root.dataset.material=String(next.material);
    }
    if(changed||current?.hitsToReward!==next.hitsToReward)
      counter.textContent='Récolte dans '+next.hitsToReward+' coup(s)';
    current=next;
  }
  function sample(now:number):MineRhythmSample|null{
    if(!current||root.hidden)return null;
    return {key:current.key,quality:mineRhythmAccuracy(current.material,now-start)};
  }
  function tick(now:number){
    if(!current||root.hidden)return;
    marker.style.left=mineRhythmPosition(current.material,now-start)*100+'%';
  }
  hit.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    const now=performance.now();
    if(now-lastStrike<125)return;
    const result=sample(now);if(!result)return;
    lastStrike=now;onStrike(result);
  });
  return {root,setTarget,sample,tick,dispose(){root.remove();}};
}
