/** Accessible, progressive Studio welcome flow. Preview samples the production relief
 * generator from exactly the same in-memory draft saved at confirmation. */
import {button,field,input,node,numberInput,select} from './dom.ts';
import {buildWelcomeProject,DEFAULT_WELCOME_CONFIG,type WelcomeConfig,type ReliefPreset} from '../studio-core/world-onboarding.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {projectGeography} from '../studio-core/geo-context.ts';
import {BIOMES_V} from '../geography/layers.ts';
import {composeWorld,projectFromComposition,type WorldComposition} from '../studio-core/world-composition.ts';
import {DEFAULT_MAP_REQUIREMENTS,LANDSCAPES,type Landscape,type MapRequirements} from '../studio-core/map-requirements.ts';
import {createGuidedWorld,type WorldStartMode} from '../studio-core/world-start.ts';
import {createProject} from '../studio-core/schema.ts';
import type {ProjectDocument} from '../studio-core/types.ts';
import type {ProjectSummary} from '../studio-core/project-store.ts';

export interface WelcomeActions {
  projects:ProjectSummary[];
  create(project:ProjectDocument):Promise<void>;
  open(id:string):Promise<void>;
  template(file:string):Promise<void>;
  importFile():void;
  report(message:string,error?:boolean):void;
}
/** The only official showcase; smaller technical worlds remain isolated test fixtures. */
const templates=[
  {file:'island.project.json',title:'Île du volcan — 4 × 3 km',desc:'Explorer et modifier le monde officiel : reliefs, falaises, biomes, villages et activités.'},
];
const fixtureShortcuts=[
  ['Ouvrir le scénario de référence','beta.project.json'],
  ['Scène de référence géographique','reference.project.json'],
  ['Scène de référence World Production','production-reference.project.json'],
  ['Scène de référence Falaises','cliff-reference.project.json'],
  ['Scène de référence Déplacements','motion-reference.project.json'],
  ['Démonstration B1 (mine, eau, parcelles)','b1-demo.project.json'],
] as const;
const reliefs:readonly {id:ReliefPreset;name:string;detail:string}[]=[
  {id:'gentle',name:'Doux',detail:'Quelques collines et pentes légères'},
  {id:'balanced',name:'Varié',detail:'Montagnes et relief équilibré'},
  {id:'rugged',name:'Accidenté',detail:'Falaises et relief marqué'},
];
function previewRect(c:HTMLCanvasElement,config:WelcomeConfig){
  const margin=25,scale=Math.min((c.width-margin*2)/config.width,(c.height-margin*2)/config.length);
  const w=config.width*scale,h=config.length*scale;
  return {x:(c.width-w)/2,y:(c.height-h)/2,w,h};
}
/** An intentionally small Canvas2D preview, not a heavyweight second WebGL scene. */
export function drawWelcomePreview(canvas:HTMLCanvasElement,project:ProjectDocument){
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Aperçu 2D indisponible');
  const bounds=project.world.bounds,width=bounds.maxX-bounds.minX,length=bounds.maxZ-bounds.minZ;
  const config:WelcomeConfig={...DEFAULT_WELCOME_CONFIG,width,length};
  const rect=previewRect(canvas,config),resolution=128;
  const nx=Math.max(28,Math.round(resolution*width/Math.max(width,length))),nz=Math.max(28,Math.round(resolution*length/Math.max(width,length)));
  const tmp=document.createElement('canvas');tmp.width=nx;tmp.height=nz;
  const tc=tmp.getContext('2d');if(!tc)throw Error('Aperçu 2D indisponible');
  const image=tc.createImageData(nx,nz),heights=new Float32Array(nx*nz);
  const def=project.world.terrain;if(!def)throw Error('Relief non disponible');
  const field=projectGeography(project).ctx;
  for(let y=0;y<nz;y++)for(let x=0;x<nx;x++){
    const wx=bounds.minX+(x+.5)/nx*width,wz=bounds.minZ+(y+.5)/nz*length;
    heights[y*nx+x]=field.height(wx,wz);
  }
  const sea=project.world.seaLevel;
  for(let y=0;y<nz;y++)for(let x=0;x<nx;x++){
    const id=y*nx+x,h=heights[id]-sea;
    const left=heights[y*nx+Math.max(0,x-1)],right=heights[y*nx+Math.min(nx-1,x+1)];
    const up=heights[Math.max(0,y-1)*nx+x],down=heights[Math.min(nz-1,y+1)*nx+x];
    const shade=Math.max(.72,Math.min(1.18,1+(left-right+up-down)*.008));
    let color:[number,number,number];
    if(h<-.5)color=h< -15?[48,103,143]:[69,145,170];
    else if(h<3)color=[213,196,144];
    else if(h<24)color=[127,167,110];
    else if(h<95)color=[89,137,93];
    else if(h<220)color=[118,129,100];
    else if(h<400)color=[142,145,136];
    else color=[207,209,204];
    const wx=bounds.minX+(x+.5)/nx*width,wz=bounds.minZ+(y+.5)/nz*length;
    const biome=BIOMES_V.find(b=>b.code===field.mask('biome',wx,wz));
    if(biome&&h>0)color=color.map((v,k)=>Math.round(v*.45+((biome.color>>((2-k)*8))&255)*.55)) as [number,number,number];
    const off=id*4;
    for(let k=0;k<3;k++)image.data[off+k]=Math.max(0,Math.min(255,Math.round(color[k]*shade)));
    image.data[off+3]=255;
  }
  tc.putImageData(image,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#e1edf0';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.drawImage(tmp,rect.x,rect.y,rect.w,rect.h);
  ctx.strokeStyle='#b4cbbf';ctx.lineWidth=2;ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
  const projectPoint=(p:{x:number;z:number})=>({x:rect.x+(p.x-bounds.minX)/width*rect.w,y:rect.y+(p.z-bounds.minZ)/length*rect.h});
  const line=(points:{x:number;z:number}[],color:string,closed=false)=>{ctx.beginPath();points.forEach((p,i)=>{const q=projectPoint(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});if(closed)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();};
  if(def.kind==='archipelago')for(const f of def.archipelago.features){
    if(f.kind==='plateau'){ctx.setLineDash([3,3]);line(f.polygon,'#795e40',true);ctx.setLineDash([]);}
    if(f.kind==='ridge'||f.kind==='valley')line(f.points,f.kind==='valley'?'#927443':'#5d5550');
    if(f.kind==='mountain'||f.kind==='volcano'){const q=projectPoint(f);ctx.fillStyle='#504c48';ctx.fillText(f.kind==='volcano'?'▲ V':'▲',q.x,q.y);}
  }
  for(const w of Object.values(project.libraries.water)){line(w.points,'#1677c4',w.kind==='lake');if(w.kind==='lake'){ctx.fillStyle='#459bd8';ctx.fill();}for(const fall of w.falls??[]){const q=projectPoint(w.points[fall.at]);ctx.fillStyle='#fff';ctx.fillRect(q.x-2,q.y-2,5,5);}}
  ctx.font='15px system-ui';ctx.fillStyle='#294438';ctx.fillText('N',rect.x+rect.w/2-5,Math.max(16,rect.y-6));
  ctx.font='12px system-ui';ctx.fillText(Math.round(width/1000*10)/10+' × '+Math.round(length/1000*10)/10+' km',14,canvas.height-10);
  return rect;
}
export function mountWelcome(host:HTMLElement,actions:WelcomeActions){
  const testFixtures=new URLSearchParams(location.search).has('testFixtures');
  let config:WelcomeConfig={...DEFAULT_WELCOME_CONFIG};
  let step=0,section:'home'|'wizard'|'templates'|'projects'='home',name='Mon petit monde';
  let renderId=0,busy=false;
  let requirements=structuredClone(DEFAULT_MAP_REQUIREMENTS),cachedKey='',cachedPlan:WorldComposition|null=null;
  const title=(text:string,description:string)=>{
    const h=node('div','','welcome-heading');
    h.append(node('div','LITTLE WORLD STUDIO','kicker'),node('h1',text),node('p',description,'muted'));return h;
  };
  const safe=(fn:()=>Promise<unknown>)=>async()=>{
    if(busy)return;busy=true;
    try{await fn();}catch(e){actions.report(e instanceof Error?e.message:String(e),true);busy=false;render();}
  };
  const top=(heading:string,description:string)=>{
    const page=node('div','','home welcome-home');
    page.append(title(heading,description));
    return page;
  };
  const back=()=>{section='home';render();};
  function showHome(){
    const page=top('Des idées aux petits mondes','Choisissez un point de départ. Vous pourrez tout modifier ensuite.');
    const choices=node('div','','welcome-entry-grid');
    const cards=[
      ['Créer un monde','Choisissez le paysage et voyez le résultat avant de commencer.','create'],
      ['Explorer un monde prêt','Ouvrez une démonstration ou un monde à personnaliser.','templates'],
      ['Partir de zéro','Un terrain simple, sans objets ni constructions.','blank'],
      ['Reprendre un projet','Retrouvez vos mondes enregistrés dans ce navigateur.','projects'],
    ];
    for(const [label,description,key] of cards){
      const b=button('',()=>{},'welcome-entry');
      b.setAttribute('aria-label',label);b.append(node('span',key==='create'?'◒':key==='templates'?'▤':key==='blank'?'▱':'↺','welcome-entry-icon'),node('strong',label),node('span',description,'muted'));
      b.onclick=()=>{if(key==='templates')section='templates';else if(key==='projects')section='projects';else{section='wizard';step=0;requirements=structuredClone(DEFAULT_MAP_REQUIREMENTS);config={...DEFAULT_WELCOME_CONFIG,...(key==='blank'?{mode:'blank' as const,volcano:false,relief:'gentle' as const,width:1000,length:1000}:{})};}render();};
      choices.append(b);
    }
    page.append(choices);
    if(actions.projects.length){
      const recent=node('section','','welcome-recent');
      const row=node('div','','welcome-between');row.append(node('h2','Vos derniers mondes'),button('Tout voir',()=>{section='projects';render();}));recent.append(row);
      for(const p of actions.projects.slice(0,3)){
        const b=button(p.name,()=>{void safe(()=>actions.open(p.projectId))();},'welcome-project-link');
        b.append(node('span','Révision '+p.revision+' · '+new Date(p.updatedAt).toLocaleDateString('fr-FR'),'muted'));recent.append(b);
        recent.append(button('Ouvrir le monde',()=>{void safe(()=>actions.open(p.projectId))();}));
      }
      page.append(recent);
    }
    page.append(button('Importer un projet JSON / ZIP',actions.importFile,'light-button'));
    // Keep direct access for existing authors and browser test recipes. This is
    // deliberately below the visual beginner flow, not the primary creation UI.
    const advanced=node('section','','welcome-legacy');
    advanced.append(node('h2','Accès avancé · création directe'),node('p','Pour les anciens modèles et les utilisateurs qui connaissent déjà leurs paramètres.','muted'));
    const form=node('form','','welcome-direct');
    const directName=input('Mon petit monde',()=>{}),size=select('1000',[
      ['island','Île volcanique · 4 000 × 3 000 m'],
      ['archipelago','Archipel éditable (île, volcan, îlots) · personnalisable'],
      ['chain','Chapelet d’îlots · personnalisable'],
      ['calm','Île douce sans relief majeur · personnalisable'],
      // Compact user-created terrain, not an installed showcase map (water authoring regressions).
      ['200','Terrain compact · 200 × 600 m'],
      ['1000','Terrain libre · 1 000 × 1 000 m'],
    ],()=>{}),seed=numberInput(4242,()=>{},1,9999999,'1');
    const width=numberInput(4000,()=>{},500,8000,'1'),length=numberInput(3000,()=>{},500,8000,'1'),cliffs=numberInput(.35,()=>{},0,1,'0.05');
    const volcano=node('input');volcano.type='checkbox';volcano.checked=true;
    const opts=node('details'); // Keep legacy click-to-expand behavior for authoring workflows.
    opts.append(node('summary','Dimensions et géographie initiale'),
      field('Largeur du monde (m)',width),field('Longueur du monde (m)',length),
      field('Proportion de falaises (0–1)',cliffs),field('Générer un volcan',volcano));
    const submit=node('button','Créer le projet','primary-button');submit.type='submit';
    form.append(field('Nom du projet',directName),field('Modèle et dimensions',size),opts,field('Graine du relief',seed),submit);
    form.onsubmit=e=>{e.preventDefault();void safe(async()=>{
      const value=Math.round(Number(seed.value));
      const p=['island','archipelago','chain','calm'].includes(size.value)
        ?createGuidedWorld({name:directName.value,mode:size.value as WorldStartMode,width:Number(width.value),length:Number(length.value),seed:value,cliffs:Number(cliffs.value),volcano:volcano.checked})
        :createProject({name:directName.value,width:Number(size.value),length:size.value==='200'?600:1000,seed:value});
      await actions.create(p);
    })();};
    const references=node('div','','welcome-quick-templates');
    const shortcuts:readonly (readonly [string,string])[]=testFixtures
      ?[['Ouvrir l’île officielle (4 × 3 km)','island.project.json'],...fixtureShortcuts]
      :[['Ouvrir l’île officielle (4 × 3 km)','island.project.json']];
    for(const [label,file] of shortcuts)references.append(button(label,()=>{void safe(()=>actions.template(file))();}));
    advanced.append(form,node('h3',testFixtures?'Scénarios techniques de régression':'Carte de référence'),references);
    page.append(advanced);
    host.replaceChildren(page);
  }
  function showCatalog(which:'projects'|'templates'){
    const page=top(which==='projects'?'Mes projets':'Mondes de départ',which==='projects'?'Vos mondes restent dans ce navigateur jusqu’à export ou suppression des données locales.':'Ces démonstrations sont éditables après ouverture.');
    page.append(button('← Accueil',back));
    const grid=node('div','','welcome-entry-grid');
    if(which==='templates'){
      for(const t of (testFixtures?[...templates,...fixtureShortcuts.map(([title,file])=>({file,title,desc:'Fixture technique réservée aux tests automatisés.'}))]:templates)){
        const card=node('article','','welcome-template');
        card.append(node('div','MONDE PRÉPARÉ','kicker'),node('h2',t.title),node('p',t.desc,'muted'),button('Ouvrir ce monde',()=>{void safe(()=>actions.template(t.file))();},'primary-button'));grid.append(card);
      }
    } else if(!actions.projects.length)grid.append(node('p','Aucun projet enregistré. Créez votre premier monde !','muted'));
    else for(const p of actions.projects){
      const card=node('article','','welcome-template');card.append(node('h2',p.name),node('p','Révision '+p.revision+' · '+new Date(p.updatedAt).toLocaleString('fr-FR'),'muted'),button('Continuer',()=>{void safe(()=>actions.open(p.projectId))();},'primary-button'));grid.append(card);
    }
    page.append(grid,button('Importer un projet JSON / ZIP',actions.importFile));host.replaceChildren(page);
  }
  function showWizard(){
    const page=top('Imaginez votre paysage','Quatre étapes. Le plan affiché est enregistré uniquement après confirmation.');
    page.append(button('← Accueil',back));
    const blank=config.mode==='blank';
    const progress=node('div','','welcome-progress');
    ['Monde','Paysages','Organisation','Aperçu et création'].forEach((label,i)=>{
      const b=button((i+1)+'. '+label,()=>{step=i;render();},'welcome-step');b.classList.toggle('active',i===step);b.setAttribute('aria-current',i===step?'step':'false');progress.append(b);
    });page.append(progress);
    const main=node('div','','welcome-layout'),controls=node('section','','welcome-controls'),preview=node('section','','welcome-preview');
    const change=<K extends keyof MapRequirements>(key:K,value:MapRequirements[K])=>{requirements={...requirements,[key]:value};render();};
    const checkbox=(label:string,checked:boolean,fn:(v:boolean)=>void)=>{const el=node('input');el.type='checkbox';el.checked=checked;el.onchange=()=>fn(el.checked);return field(label,el);};
    if(blank&&(step===1||step===2)){controls.append(node('h2','Terrain simple'),node('p','Sans régions ni eau générées. Vous pourrez les créer avec les outils du Studio.','muted'));}
    else if(step===0){
      controls.append(node('h2','Choisir le monde'));
      if(!blank)controls.append(field('Type géographique',select(requirements.type,[['island','Grande île'],['archipelago','Archipel'],['valley','Grande vallée — non prise en charge'],['continental','Région continentale — non prise en charge']],v=>change('type',v as MapRequirements['type']))));
      else controls.append(node('p','Terrain simple sans composition automatique.'));
      controls.append(field('Largeur (m)',numberInput(blank?config.width:requirements.width,v=>{config.width=v;change('width',v);},500,8000,'1')),
        field('Longueur (m)',numberInput(blank?config.length:requirements.length,v=>{config.length=v;change('length',v);},500,8000,'1')));
      if(!blank)controls.append(field('Relief général',select(requirements.relief,reliefs.map(r=>[r.id,r.name] as const),v=>change('relief',v as ReliefPreset))));
    }else if(step===1){
      controls.append(node('h2','Choisir les paysages'),node('p','Les paysages obligatoires manquants empêchent la création.','muted'));
      for(const [kind,label]of Object.entries(LANDSCAPES) as [Landscape,string][]){
        const selected=requirements.landscapes.find(l=>l.kind===kind),row=node('div','','welcome-between');
        row.append(checkbox(label,!!selected,v=>{
          const landscapes=requirements.landscapes.filter(l=>l.kind!==kind);if(v)landscapes.push({kind,required:false});
          requirements={...requirements,landscapes,sequence:v?[...requirements.sequence,kind]:requirements.sequence.filter(k=>k!==kind)};render();
        }));
        if(selected)row.append(checkbox(label+' obligatoire',selected.required,v=>change('landscapes',requirements.landscapes.map(l=>l.kind===kind?{...l,required:v}:l))));
        controls.append(row);
      }
    }else if(step===2){
      controls.append(node('h2','Organiser les paysages'),field('Organisation des biomes',select(requirements.biomeMode,[['automatic','Automatique'],['custom','Succession personnalisée']],v=>change('biomeMode',v as MapRequirements['biomeMode']))));
      if(requirements.biomeMode==='custom')requirements.sequence.forEach((kind,i)=>{
        const row=node('div','','welcome-between');row.append(node('span',LANDSCAPES[kind]));
        for(const [delta,label]of [[-1,'Monter'],[1,'Descendre']] as const){const b=button(label+' '+LANDSCAPES[kind],()=>{const order=[...requirements.sequence];[order[i],order[i+delta]]=[order[i+delta],order[i]];change('sequence',order);});b.disabled=i+delta<0||i+delta>=requirements.sequence.length;row.append(b);}controls.append(row);
      });
      controls.append(field('Rivières principales',numberInput(requirements.rivers,v=>change('rivers',v),0,6,'1')),
        field('Niveaux de terrasses',numberInput(requirements.terraces,v=>change('terraces',v),1,6,'1')),
        field('Importance des falaises',numberInput(requirements.cliffs,v=>change('cliffs',v),0,1,'.05')));
      const advanced=node('details');advanced.append(node('summary','Réglages avancés (facultatifs)'),
        field('Affluents raccordés',numberInput(requirements.tributaries,v=>change('tributaries',v),0,6,'1')),
        field('Diversité géographique',numberInput(requirements.diversity,v=>change('diversity',v),0,1,'.05')),
        checkbox('Souhaiter un lac',requirements.lakes,v=>change('lakes',v)),checkbox('Souhaiter des cascades',requirements.waterfalls,v=>change('waterfalls',v)));
      controls.append(advanced);
    }else{
      controls.append(node('h2','Aperçu et création'),field('Nom du projet',input(name,v=>{name=v;})),node('p','Relief, eau et régions restent éditables dans le Studio. Les végétaux sont procéduraux et instanciés.','muted'));
    }
    const seed=numberInput(blank?config.seed:requirements.seed,v=>{config.seed=v;change('seed',v);},1,9999999,'1');
    controls.append(field('Graine de génération',seed));
    const header=node('div','','welcome-between');header.append(node('h2','Aperçu du monde'),button('Autre variation',()=>{config.seed=Math.floor(Math.random()*9999999)+1;change('seed',config.seed);}));
    const canvas=node('canvas');canvas.width=600;canvas.height=420;canvas.className='welcome-terrain-canvas';canvas.setAttribute('aria-label','Aperçu topographique du terrain calculé');
    const note=node('p','Calcul du plan…','muted'),messages=node('div');messages.setAttribute('role','status');
    const details=node('details'),statistics=node('p','','muted');details.append(node('summary','Détails du calcul'),statistics);
    preview.append(header,canvas,note,messages,details);
    const legend=node('p','Altitude ombrée · Bleu : eau · Pointillés bruns : terrasses et escarpements · ▲ : massifs','muted');preview.append(legend);
    const colors=node('div','','welcome-legend');for(const biome of BIOMES_V.slice(0,7)){const item=node('span',biome.label);item.style.borderLeft='12px solid #'+biome.color.toString(16).padStart(6,'0');item.style.padding='0 8px';colors.append(item);}preview.append(colors);
    main.append(controls,preview);page.append(main);
    const foot=node('div','','welcome-footer');
    if(step>0)foot.append(button('← Retour',()=>{step--;render();}));
    let create:HTMLButtonElement|null=null;
    if(step<3)foot.append(button('Continuer →',()=>{step++;render();},'primary-button'));
    else{
      create=button('Créer et ouvrir le monde',()=>{void safe(async()=>{
        if(blank){await actions.create(buildWelcomeProject(config,name));return;}
        if(!cachedPlan||cachedKey!==JSON.stringify(requirements))throw Error('Attendre le nouvel aperçu');
        await actions.create(projectFromComposition(cachedPlan,name));
      })();},'primary-button');create.disabled=true;foot.append(create);
    }
    page.append(foot);host.replaceChildren(page);
    const token=++renderId;
    requestAnimationFrame(()=>{
      if(token!==renderId||!canvas.isConnected)return;
      try{
        let project:ProjectDocument;
        if(blank)project=buildWelcomeProject(config,'Aperçu');
        else{
          const key=JSON.stringify(requirements);
          if(key!==cachedKey||!cachedPlan){cachedPlan=composeWorld(requirements);cachedKey=key;}
          project=cachedPlan.project;
          messages.replaceChildren(...cachedPlan.diagnostics.map(d=>node('p',d.message,'diagnostic '+d.severity)));
        }
        const start=performance.now();drawWelcomePreview(canvas,project);
        canvas.dataset.planSeed=String(project.world.seed);
        canvas.dataset.planHash=fingerprint({terrain:project.world.terrain,water:project.libraries.water,regions:project.libraries.regions});
        canvas.dataset.waterCount=String(Object.keys(project.libraries.water).length);
        const metrics=!blank?cachedPlan?.metrics:null;
        statistics.textContent=metrics?`Plan ${Math.round(metrics.generationMs)} ms · Aperçu ${Math.round(performance.now()-start)} ms · ${metrics.features}/64 formes · ${metrics.sectors} secteurs · ${Math.round(metrics.sourceBytes/1024)} Kio de sources${metrics.coverage?' · Biomes hors rivière '+Math.round(metrics.coverage.offRiverBiomeCoverage*100)+' %':''}`:'Terrain simple sans composition automatique.';
        const families:Record<string,string>={'central-valley':'Vallée centrale','winding-valley':'Vallée sinueuse','split-plateau':'Plateau découpé','multiple-massifs':'Massifs multiples'};
        note.textContent=blank?'Aucun enregistrement avant confirmation.':`${families[cachedPlan!.family]} · Graine ${project.world.seed} · Eau et biomes du projet calculé.`;
        if(create)create.disabled=busy||(!blank&&!cachedPlan?.ready);
      }catch(e){note.textContent=e instanceof Error?e.message:String(e);if(create)create.disabled=true;}
    });
  }
  function render(){
    renderId++;
    if(section==='home')showHome();
    else if(section==='wizard')showWizard();
    else showCatalog(section);
  }
  render();
}
