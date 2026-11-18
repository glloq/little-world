/** Pure, low-resource fishing simulation. No DOM, Three.js, inventory or timers.
 *  The game owns the fixed-step clock, input, and atomic reward transaction. */
import {FISH_PROFILES,selectFish,type FishId,type WaterKind} from './fishing-data.ts';
export type {FishId,WaterKind} from './fishing-data.ts';
export type FishingPhase='idle'|'waiting'|'bite'|'reeling'|'landed';
export type FishingEvent='bite'|'lost'|'caught'|null;
export interface FishingState {
  phase:FishingPhase;water:WaterKind|null;until:number;castAt:{x:number;z:number}|null;
  fish:FishId|null;progress:number;tension:number;sessionId:number;
}
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const MAX_STEP=1/30;
const BITE_WINDOW=1.3;
export function createFishing(rand:()=>number=Math.random){
  const state:FishingState={phase:'idle',water:null,until:0,castAt:null,fish:null,progress:0,tension:0,sessionId:0};
  let lastTime=0,patternOffset=0,combatTime=0;
  function reset(){
    state.phase='idle';state.water=null;state.until=0;state.castAt=null;state.fish=null;
    state.progress=0;state.tension=0;combatTime=0;
  }
  function cast(water:WaterKind,at:{x:number;z:number},now:number):void{
    if(!Number.isFinite(now)||!Number.isFinite(at.x)||!Number.isFinite(at.z))return;
    reset();state.sessionId++;
    state.water=water;state.castAt={x:at.x,z:at.z};state.phase='waiting';
    state.until=now+2+clamp(rand(),0,1)*5;
    lastTime=now;
  }
  /** Hooking a bite starts the minigame, never grants a fish. A premature hook loses the bite. */
  function hook():boolean{
    if(state.phase!=='bite'){reset();return false;}
    state.fish=selectFish(state.water??'sea',rand());
    patternOffset=rand()*Math.PI*2;combatTime=0;
    state.progress=0;state.tension=.12;
    state.phase='reeling';return true;
  }
  function update(now:number,reelHeld=false):FishingEvent{
    if(!Number.isFinite(now))return null;
    const dt=clamp(now-lastTime,0,MAX_STEP);lastTime=now;
    if(state.phase==='waiting'&&now>=state.until){
      state.phase='bite';state.until=now+BITE_WINDOW;return 'bite';
    }
    if(state.phase==='bite'&&now>=state.until){reset();return 'lost';}
    if(state.phase!=='reeling'||!state.fish||dt===0)return null;
    const profile=FISH_PROFILES[state.fish];
    combatTime+=dt;
    // A smooth, deterministic sequence of calm periods and bursts; no RNG in the frame loop.
    const pulse=Math.sin(combatTime*profile.frequency+patternOffset);
    const surge=clamp((pulse+.28)/1.28,0,1);
    if(reelHeld){
      state.tension=clamp(state.tension+profile.pull*(.72+.95*surge)*dt,0,1);
      state.progress=clamp(state.progress+profile.gain*(1-.26*state.tension)*dt,0,1);
    }else{
      state.tension=clamp(state.tension-profile.relax*dt,0,1);
      state.progress=clamp(state.progress-.035*dt,0,1);
    }
    if(state.tension>=1){reset();return 'lost';}
    if(state.progress>=1){
      state.phase='landed';return 'caught';
    }
    return null;
  }
  /** One-shot claim: only the game can give an inventory item, and only after victory. */
  function takeCatch():FishId|null{
    if(state.phase!=='landed')return null;
    const fish=state.fish;reset();return fish;
  }
  return {state,cast,hook,update,takeCatch,cancel:reset};
}
export type Fishing=ReturnType<typeof createFishing>;
