/** Start-up loading screen (doc 42 §H1). The world is built and streamed behind the start card;
 * this module only reports progress and keeps « Explorer » disabled until the area around the
 * spawn is ready (terrain tiles, near dressing, species models), or after a safety timeout so a
 * slow machine is never locked out. Progress is computed from real counters, never simulated. */
export interface LoadingSample {
  /** Boot phase reached (0 → 1) while reading and building the world. */boot:number;
  terrainPending:number;
  /** Dressing cells still missing near the spawn (−1 = not planned yet). */dressingPending:number;speciesState:'loading'|'ready'|'failed'|'none';
}
export interface LoadingState {fraction:number;label:string;ready:boolean}
/** Pure: progress and label from the counters; `maxPending` remembers the largest backlog seen. */
export function loadingState(s:LoadingSample,maxPending:{terrain:number;dressing:number},elapsedMs:number,timeoutMs=25000):LoadingState{
  maxPending.terrain=Math.max(maxPending.terrain,s.terrainPending);maxPending.dressing=Math.max(maxPending.dressing,s.dressingPending);
  const part=(pending:number,max:number)=>max>0?1-pending/max:pending>0?0:1;
  const terrain=part(s.terrainPending,maxPending.terrain),dressing=s.dressingPending<0?0:part(s.dressingPending,maxPending.dressing),species=s.speciesState==='loading'?0:1;
  const fraction=Math.min(1,s.boot*.35+terrain*.35+dressing*.2+species*.1);
  const ready=s.boot>=1&&s.terrainPending===0&&s.dressingPending===0&&species===1||s.boot>=1&&elapsedMs>timeoutMs;
  const label=s.boot<1?'Lecture du monde…':s.terrainPending>0?'Construction du relief…':s.speciesState==='loading'?'Arbres et plantes…':s.dressingPending>0?'Forêts et paysages…':'Prêt';
  return {fraction:ready?1:Math.min(.99,fraction),label:ready?'Prêt':label,ready};
}
export function createLoadingScreen(start:HTMLButtonElement,host:HTMLElement){
  const box=document.createElement('div');box.className='loading';box.setAttribute('role','progressbar');box.setAttribute('aria-valuemin','0');box.setAttribute('aria-valuemax','100');box.setAttribute('aria-label','Chargement du monde');
  const track=document.createElement('div');track.className='loading-track';const fill=document.createElement('span');fill.className='loading-fill';track.append(fill);
  const text=document.createElement('small');text.className='loading-text';box.append(track,text);host.insertBefore(box,start);
  const label=start.dataset.label??start.textContent??'',began=performance.now(),max={terrain:0,dressing:0};let boot=0,done=false;
  function show(st:LoadingState){
    const pct=Math.round(st.fraction*100);fill.style.width=pct+'%';box.setAttribute('aria-valuenow',String(pct));text.textContent=st.ready?'Monde prêt':`${st.label} ${pct} %`;
    if(st.ready&&!done){done=true;start.disabled=false;start.textContent=label+' ';const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='→';start.append(arrow);box.classList.add('loading-done');}
    else if(!st.ready){start.disabled=true;start.textContent=`Chargement… ${pct} %`;}
  }
  show({fraction:0,label:'Lecture du monde…',ready:false});
  return {
    /** Boot milestones (0 → 1) before the render loop starts. */
    boot(value:number,label?:string){boot=Math.max(boot,value);if(!done)show({fraction:boot*.35,label:label??'Lecture du monde…',ready:false});},
    /** Called each frame with live counters until ready. */
    update(s:Omit<LoadingSample,'boot'>){if(done)return true;const st=loadingState({...s,boot},max,performance.now()-began);show(st);return st.ready;},
    get ready(){return done;},
  };
}
