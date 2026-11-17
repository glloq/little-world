/** Accessible, progressive Studio welcome flow. Preview samples the production relief
 * generator from exactly the same in-memory draft saved at confirmation. */
import {button,field,input,node,numberInput,select} from './dom.ts';
import {buildWelcomeProject,DEFAULT_WELCOME_CONFIG,type WelcomeConfig,type WelcomeMode,type ReliefPreset} from '../studio-core/world-onboarding.ts';
import {generatorField} from '../terrain-generator.ts';
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
const modes:readonly {id:WelcomeMode;name:string;detail:string}[]=[
  {id:'island',name:'Grande île',detail:'Une île entourée de côtes et un relief central.'},
  {id:'archipelago',name:'Archipel',detail:'Une île principale et plusieurs îlots.'},
  {id:'chain',name:'Chaîne d’îlots',detail:'Des îles séparées à explorer.'},
  {id:'calm',name:'Paysage doux',detail:'Des côtes, des collines et peu de relief.'},
  {id:'blank',name:'Terrain simple',detail:'Une surface plane, sans objets ni relief imposé.'},
];
const reliefs:readonly {id:ReliefPreset;name:string;detail:string}[]=[
  {id:'gentle',name:'Doux',detail:'Quelques collines et pentes légères'},
  {id:'balanced',name:'Varié',detail:'Montagnes et relief équilibré'},
  {id:'rugged',name:'Accidenté',detail:'Falaises et relief marqué'},
];
function choice(title:string,detail:string,active:boolean,fn:()=>void){
  const e=button('',()=>{},'welcome-choice');e.textContent='';
  e.classList.toggle('active',active);e.setAttribute('aria-pressed',String(active));
  e.append(node('strong',title),node('span',detail,'muted'));
  e.onclick=fn;return e;
}
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
  const field=generatorField(def,{seed:project.world.seed,seaLevel:project.world.seaLevel,width,length},()=>0);
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
    const off=id*4;
    for(let k=0;k<3;k++)image.data[off+k]=Math.max(0,Math.min(255,Math.round(color[k]*shade)));
    image.data[off+3]=255;
  }
  tc.putImageData(image,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#e1edf0';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.drawImage(tmp,rect.x,rect.y,rect.w,rect.h);
  ctx.strokeStyle='#b4cbbf';ctx.lineWidth=2;ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
  ctx.font='15px system-ui';ctx.fillStyle='#294438';ctx.fillText('N',rect.x+rect.w/2-5,Math.max(16,rect.y-6));
  ctx.font='12px system-ui';ctx.fillText(Math.round(width/1000*10)/10+' × '+Math.round(length/1000*10)/10+' km',14,canvas.height-10);
  return rect;
}
export function mountWelcome(host:HTMLElement,actions:WelcomeActions){
  const testFixtures=new URLSearchParams(location.search).has('testFixtures');
  let config:WelcomeConfig={...DEFAULT_WELCOME_CONFIG};
  let step=0,section:'home'|'wizard'|'templates'|'projects'='home',name='Mon petit monde';
  let placing:'mountain'|'volcano'|null=null,renderId=0,busy=false,showAdvanced=false;
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
  const back=()=>{section='home';placing=null;render();};
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
      b.onclick=()=>{if(key==='templates')section='templates';else if(key==='projects')section='projects';else{section='wizard';step=0;config={...DEFAULT_WELCOME_CONFIG,...(key==='blank'?{mode:'blank' as const,volcano:false,relief:'gentle' as const,width:1000,length:1000}:{})};}render();};
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
    const page=top('Imaginez votre paysage','Trois étapes courtes. Aucun projet n’est créé avant votre confirmation.');
    page.append(button('← Accueil',back));
    const progress=node('div','','welcome-progress');
    for(let i=0;i<3;i++){
      const b=button((i+1)+'. '+['Choisir','Personnaliser','Créer'][i],()=>{step=i;render();},'welcome-step');
      b.classList.toggle('active',i===step);b.setAttribute('aria-current',i===step?'step':'false');progress.append(b);
    }
    page.append(progress);
    const main=node('div','','welcome-layout'),controls=node('section','','welcome-controls'),preview=node('section','','welcome-preview');
    const heading=(s:string)=>controls.append(node('h2',s));
      if(step===0){
      heading('Quel type de monde ?');
      controls.append(node('p','Choisissez une forme de départ : tous les reliefs seront ensuite éditables.','muted'));
      const grid=node('div','','welcome-mode-grid');for(const m of modes)grid.append(choice(m.name,m.detail,config.mode===m.id,()=>{const previous=config.mode;config.mode=m.id;if(m.id==='blank'||m.id==='calm'){config.volcano=false;config.volcanoAt=null;}else if(previous==='blank'||previous==='calm')config.volcano=true;if(m.id==='blank')config.mountain=null;render();}));controls.append(grid);
    }else if(step===1){
      heading('Quel relief souhaitez-vous ?');
      if(config.mode!=='blank'){
        const group=node('div','','welcome-mode-grid');
        for(const p of reliefs)group.append(choice(p.name,p.detail,config.relief===p.id,()=>{config.relief=p.id;render();}));
        controls.append(group);
        const toggle=node('label','','welcome-check'),check=node('input');check.type='checkbox';check.checked=config.volcano;
        check.onchange=()=>{config.volcano=check.checked;config.volcanoAt=null;render();};
        toggle.append(check,node('span','Ajouter un volcan'));controls.append(toggle);
      }else controls.append(node('p','Le terrain de départ restera plat. Vous ajouterez ses formes depuis le Studio.','muted'));
      controls.append(node('h3','Dimensions du monde'));
      const dimensions=String(config.width)+'x'+String(config.length);
      const sizes=select(['1000x1000','3000x3000','4000x3000','3000x8000','8000x8000'].includes(dimensions)?dimensions:'custom',[
        ['1000x1000','1 × 1 km — Compact'],['3000x3000','3 × 3 km — Moyen'],['4000x3000','4 × 3 km — Île officielle'],['3000x8000','3 × 8 km — Grand'],
        ['8000x8000','8 × 8 km — Très grand'],['custom','Dimensions personnalisées'],
      ],v=>{if(v!=='custom'){const [w,l]=v.split('x').map(Number);config.width=w;config.length=l;config.mountain=null;config.volcanoAt=null;showAdvanced=false;render();}else{showAdvanced=true;render();}});
      controls.append(field('Taille de la carte',sizes));
      const advanced=node('details'),summary=node('summary','Réglages avancés (facultatifs)');advanced.open=showAdvanced||sizes.value==='custom';
      advanced.append(summary);
      const width=numberInput(config.width,()=>{},500,8000,'1'),length=numberInput(config.length,()=>{},500,8000,'1');
      const seed=numberInput(config.seed,()=>{},1,9999999,'1');
      width.onchange=()=>{config.width=Number(width.value);config.mountain=null;config.volcanoAt=null;showAdvanced=true;render();};
      length.onchange=()=>{config.length=Number(length.value);config.mountain=null;config.volcanoAt=null;showAdvanced=true;render();};
      seed.onchange=()=>{config.seed=Number(seed.value);showAdvanced=true;render();};
      advanced.append(field('Largeur (m)',width),field('Longueur (m)',length),field('Graine de génération',seed));
      controls.append(advanced);
    }else{
      heading('Votre monde est prêt à être créé');
      controls.append(node('p','Le relief visible ici sera celui de votre nouveau projet. La décoration, les rivières et les biotopes pourront être ajoutés ensuite dans le Studio.','muted'));
      const projectName=input(name,v=>{name=v;});projectName.maxLength=100;
      controls.append(field('Nom du projet',projectName));
      if(config.mode!=='blank'){
        controls.append(node('h3','Composition rapide (facultative)'));
        const placeBar=node('div','','welcome-actions');
        const mountain=button(placing==='mountain'?'Cliquez sur la carte…':'Placer une montagne',()=>{placing='mountain';render();});
        const volcano=button(placing==='volcano'?'Cliquez sur la carte…':'Déplacer le volcan',()=>{placing='volcano';render();});
        volcano.disabled=!config.volcano;
        placeBar.append(mountain,volcano);controls.append(placeBar);
        if(config.mountain||config.volcanoAt)controls.append(button('Réinitialiser les placements',()=>{config.mountain=null;config.volcanoAt=null;placing=null;render();}));
        if(placing)controls.append(node('p','Cliquez sur la carte à droite pour '+(placing==='mountain'?'ajouter une montagne.':'déplacer le volcan.'),'muted'));
      }
    }
    const header=node('div','','welcome-between');
    header.append(node('h2','Aperçu du relief'),button('Autre variation',()=>{config.seed=Math.floor(Math.random()*9999999)+1;render();}));
    const canvas=node('canvas');canvas.width=600;canvas.height=420;
    canvas.className='welcome-terrain-canvas';canvas.setAttribute('aria-label','Aperçu topographique du terrain calculé');
    const note=node('p','Aperçu calculé à basse résolution avec le véritable générateur. Aucun enregistrement avant création.','muted');
    preview.append(header,canvas,note);
    if(step===2&&config.mode!=='blank'){
      canvas.classList.toggle('placing',placing!==null);
      canvas.onclick=e=>{
        if(!placing)return;
        const rect=previewRect(canvas,config),bounds=canvas.getBoundingClientRect();
        const px=(e.clientX-bounds.left)*canvas.width/bounds.width,py=(e.clientY-bounds.top)*canvas.height/bounds.height;
        if(px<rect.x||px>rect.x+rect.w||py<rect.y||py>rect.y+rect.h)return;
        const x=(px-rect.x)/rect.w*config.width-config.width/2,z=(py-rect.y)/rect.h*config.length-config.length/2;
        if(placing==='mountain')config.mountain={x,z};else config.volcanoAt={x,z};
        placing=null;render();
      };
    }
    main.append(controls,preview);page.append(main);
    const foot=node('div','','welcome-footer');
    if(step>0)foot.append(button('← Retour',()=>{step--;placing=null;render();}));
    else foot.append(node('span','Modifiez librement votre choix.','muted'));
    if(step<2)foot.append(button('Continuer →',()=>{step++;render();},'primary-button'));
    else {
      const create=button('Créer et ouvrir le monde',()=>{name=projectNameValue();void safe(async()=>{const p=buildWelcomeProject(config,name);await actions.create(p);})();},'primary-button');
      create.disabled=busy;foot.append(create);
    }
    function projectNameValue(){const el=controls.querySelector<HTMLInputElement>('input[aria-label="Nom du projet"]');return el?.value.trim()??name;}
    page.append(foot);host.replaceChildren(page);
    const token=++renderId;
    // Defer the synchronous sampling so the UI can paint the controls first.
    requestAnimationFrame(()=>{
      if(token!==renderId||!canvas.isConnected)return;
      try{
        const p=buildWelcomeProject(config,'Aperçu');
        const rect=drawWelcomePreview(canvas,p);
        const ctx=canvas.getContext('2d')!;
        const features=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features:[];
        const marker=(x:number,z:number,label:string)=>{
          const sx=rect.x+(x/config.width+.5)*rect.w,sy=rect.y+(z/config.length+.5)*rect.h;
          ctx.beginPath();ctx.fillStyle='#fff';ctx.strokeStyle='#324d3e';ctx.lineWidth=2;ctx.arc(sx,sy,6,0,Math.PI*2);ctx.fill();ctx.stroke();
          ctx.fillStyle='#243d2f';ctx.font='bold 12px system-ui';ctx.fillText(label,sx+10,sy+4);
        };
        if(step===2)for(const f of features)if(f.kind==='volcano'||(f.kind==='mountain'&&f.id==='welcome-mountain'))marker(f.x,f.z,f.kind==='volcano'?'Volcan':'Montagne');
      }catch(e){const ctx=canvas.getContext('2d');if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#9b493e';ctx.font='14px system-ui';ctx.fillText(e instanceof Error?e.message:String(e),18,40);}note.textContent='Corrigez les paramètres avant de continuer.';}
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
