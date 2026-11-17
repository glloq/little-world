/** Start-up loading screen (doc 42 §H1). The world is built and streamed behind the start card;
 * this module reports live progress until the spawn is ready (terrain tiles, near
 * dressing, species models), or a safety timeout prevents a permanent loading screen.
 * Progress is computed from real counters, never simulated. */
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
/** Original, lightweight loading jokes; none requires an asset or fetch. */
export const LOADING_TIPS=["Pourquoi le fromage voyage-t-il ? Pour prendre le grand brie !","La patate voulait voler… mais elle avait la frite.","Le hamster connaît la vitesse : il a le vent dans les moustaches.","Un pet bien placé vaut parfois trois battements d’ailes.","Le gruyère a des trous ; le hamster a des projets.","Pourquoi la noisette se cache ? Elle est un peu à la coque.","La pomme de terre regarde le volcan : « Ça sent la purée ! »","Attention : turbo-pet activé. Le nez des voisins décline toute responsabilité.","Une journée sans noix ? Impossible, dit le hamster, c’est noisettable !","Le camembert ne se perd jamais : il suit son odorat.","Le hamster a pris un raccourci… par le tunnel des noisettes.","Patate pressée, purée assurée.","Plus le fromage est fait, moins le hamster est pressé.","La fusée du hamster carbure à la noisette… et au petit supplément gazeux.","Si une noix te parle, écoute-la : elle en connaît un rayon sur la forêt.","Un hamster qui pète en planant appelle ça de l’aérodynamique artisanale.","Les pommes de terre ont-elles peur du vide ? Non, elles gardent la patate.","Le fromage a demandé sa carte : il voulait rejoindre le grand brie."] as const;
export function createLoadingScreen(start:HTMLButtonElement,host:HTMLElement){
  const box=document.createElement('div');box.className='loading';box.setAttribute('role','progressbar');box.setAttribute('aria-valuemin','0');box.setAttribute('aria-valuemax','100');box.setAttribute('aria-label','Chargement du monde');
  const track=document.createElement('div');track.className='loading-track';const fill=document.createElement('span');fill.className='loading-fill';track.append(fill);
  const text=document.createElement('small');text.className='loading-text';
  const stages=document.createElement('ul');stages.className='loading-stages';stages.setAttribute('aria-label','Étapes de chargement');
  const tip=document.createElement('p');tip.className='loading-tip';tip.setAttribute('aria-live','off');
  // The joke is the main message; the progress bar always stays at the bottom.
  box.append(tip,stages,text,track);host.insertBefore(box,start);
  const began=performance.now(),max={terrain:0,dressing:0};
  let boot=0,done=false,tipTimer:ReturnType<typeof setTimeout>|null=null,lastTip=-1;
  let sample:Omit<LoadingSample,'boot'>={terrainPending:0,dressingPending:-1,speciesState:'none'};
  const stagesData=()=>[
    ['Lecture du monde',boot>=.45,boot>0],
    ['Construction du relief',sample.terrainPending===0&&boot>=.7,boot>=.45],
    ['Arbres et végétation',sample.speciesState!=='loading'&&boot>=1,boot>=.7],
    ['Paysages proches',sample.dressingPending===0&&boot>=1,sample.dressingPending>=0],
  ] as const;
  function showStages(){
    const next=stagesData().map(([label,completed,started])=>({label,state:completed?'done':started?'active':'pending'}));
    const key=next.map(x=>x.label+':'+x.state).join('|');
    if(stages.dataset.key===key)return;
    stages.dataset.key=key;stages.replaceChildren();
    for(const item of next){const li=document.createElement('li');li.dataset.state=item.state;
      li.textContent=(item.state==='done'?'✓ ':item.state==='active'?'… ':'· ')+item.label;stages.append(li);}
  }
  function nextTip(){if(done)return;let index=Math.floor(Math.random()*LOADING_TIPS.length);
    if(index===lastTip)index=(index+1)%LOADING_TIPS.length;lastTip=index;tip.textContent=LOADING_TIPS[index];
    tipTimer=setTimeout(nextTip,5000+Math.random()*10000);
  }
  function show(st:LoadingState){
    const pct=Math.round(st.fraction*100);fill.style.width=pct+'%';box.setAttribute('aria-valuenow',String(pct));text.textContent=st.ready?'Monde prêt':`${st.label} ${pct} %`;
    showStages();
    if(st.ready&&!done){done=true;if(tipTimer!==null)clearTimeout(tipTimer);start.disabled=false;box.classList.add('loading-done');}
    else if(!st.ready){start.disabled=true;}
  }
  show({fraction:0,label:'Lecture du monde…',ready:false});nextTip();
  return {
    /** Boot milestones (0 → 1) before the render loop starts. */
    boot(value:number,label?:string){boot=Math.max(boot,value);if(!done)show({fraction:boot*.35,label:label??'Lecture du monde…',ready:false});},
    /** Called each frame with live counters until ready. */
    update(s:Omit<LoadingSample,'boot'>){if(done)return true;sample=s;const st=loadingState({...s,boot},max,performance.now()-began);show(st);return st.ready;},
    get ready(){return done;},
  };
}
