import './studio.css';
import {button,field,input,node,numberInput,select,download} from './dom.ts';
import {ProjectStore} from '../studio-core/project-store.ts';
import {parseProject,chunkAt} from '../studio-core/schema.ts';
import {migrateWorldToV3,toRuntimeWorld} from '../studio-core/migration.ts';
import {readProjectArchive,writeProjectArchive,writeFilesArchive} from '../studio-core/archive.ts';
import {resolveEntity} from '../studio-core/references.ts';
import {createCharacter} from '../studio-core/character-authoring.ts';
import type {ProjectDocument} from '../studio-core/types.ts';
import {StudioSession} from './session.ts';
import {elementAnchor,elementsAt} from '../studio-core/elements.ts';
import {renderInspector,editQueue} from './inspector.ts';
import {mountEntityList} from './entity-list.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';

/** Studio shell: one persistent 3D editing space per project. Tools change what the left
 * button does; panels (map, dialogues, water…) cover the workspace without destroying the
 * scene, so camera, selection and scene survive every tool or panel change. */
const store=new ProjectStore(),$=(id:string)=>document.getElementById(id)!;
let session:StudioSession|null=null,viewport:StudioViewport|null=null,unsubscribe=()=>{},disposePanel=()=>{},generation=0,activeModule='scene';
let inspectorOpen=true,returnModule='scene',lastAsset='props.crate';
const status=(message:string,error=false)=>{$('status').textContent=message;$('status').classList.toggle('status-error',error);};
const run=(action:()=>Promise<unknown>|unknown)=>async()=>{try{await action();}catch(e){status(String(e instanceof Error?e.message:e),true);}};
const action=(title:string,fn:()=>Promise<unknown>|unknown,className?:string)=>button(title,run(fn),className);
/** Toolbar: [module id, accessible name, icon, group, shortcut]. Viewport modules keep the 3D view. */
const MODULES:[string,string,string,string,string][]=[
  ['scene','Sélection','➚','Naviguer','V'],['map','Carte globale','▦','Naviguer','M'],
  ['objects','Objets','▣','Construire','B'],['settlements','Villages & villes','⌂','Construire',''],['natural','Structures naturelles','◠','Construire',''],['characters','Personnages','☺','Construire',''],['lights','Lumières','✦','Construire','L'],
  ['terrain','Relief','⛰','Monde','T'],['regions','Régions','◉','Monde',''],['biomes','Biotopes','✿','Monde',''],['paths','Chemins et rivières','〰','Monde',''],['water','Eau','≈','Monde',''],['surf','Surf','〰','Monde',''],['zones','Zones','⬠','Monde',''],['landscapes','Paysages','❦','Monde',''],
  ['races','Courses','⚑','Logique',''],['quests','Quêtes','♧','Logique',''],['dialogues','Dialogues','✉','Logique',''],['interactions','Interactions','⚙','Logique',''],['environment','Environnement','☀','Logique',''],['audio','Audio','♪','Logique',''],['motion-lab','Animations du hamster','◉','Logique',''],
  ['composition','Recomposer le monde','◒','Projet',''],
  ['guide','Assistant de création','☷','Projet',''],
  ['tests','Validation / compilation','✓','Projet',''],
];
const VIEWPORT_MODULES=new Set(['scene','objects','natural','regions','characters','lights','terrain','biomes','polyline','paths','zones','surf','races','landscapes']);
const ALIASES:Record<string,string>={local:'scene',select:'scene'};
const panelHost=()=>$('panel-host');
function refreshHeader(){
  const s=session;if(!s)return;$('save-status').textContent=s.status;$('breadcrumbs').textContent=s.document.manifest.name+' / '+activeModule;
  const undo=$('header-actions').querySelector<HTMLButtonElement>('[data-action=undo]'),redo=$('header-actions').querySelector<HTMLButtonElement>('[data-action=redo]');
  if(undo){undo.disabled=!s.commands.canUndo;undo.title=s.commands.undoLabel?'Annuler : '+s.commands.undoLabel+' (Ctrl+Z)':'Annuler (Ctrl+Z)';}
  if(redo){redo.disabled=!s.commands.canRedo;redo.title=s.commands.redoLabel?'Refaire : '+s.commands.redoLabel+' (Ctrl+Maj+Z)':'Refaire (Ctrl+Maj+Z)';}
}
function buildHeader(){
  const s=session!,undo=action('Annuler',()=>{s.commands.undo();void inspector();}),redo=action('Refaire',()=>{s.commands.redo();void inspector();});undo.dataset.action='undo';redo.dataset.action='redo';
  const toggle=action('Inspecteur',()=>{inspectorOpen=!inspectorOpen;$('studio').classList.toggle('no-inspector',!inspectorOpen);toggle.setAttribute('aria-pressed',String(inspectorOpen));});toggle.setAttribute('aria-pressed',String(inspectorOpen));
  $('header-actions').replaceChildren(action('Mes projets',home),undo,redo,action('Sauvegarder',async()=>{await editQueue.last;await s.flush();}),action('Importer',()=>($('project-file') as HTMLInputElement).click()),
    action('Exporter ZIP',async()=>{await editQueue.last;const p=await s.fullDocument();const bytes=writeProjectArchive(p);download(p.manifest.name+'.zip',bytes.buffer as ArrayBuffer,'application/zip');}),toggle,action('Jouer ici',preview,'primary-button'));
  refreshHeader();
}
function buildToolbar(){
  const bar=$('modules');bar.replaceChildren();let group='';
  for(const [id,label,icon,section,key]of MODULES){
    if(section!==group){group=section;bar.append(node('span',section,'toolbar-group'));}
    const b=button('',()=>void run(()=>module(id))(),'tool-button');b.dataset.module=id;b.setAttribute('aria-label',label);b.title=label+(key?` (${key})`:'');b.append(node('span',icon,'tool-icon'),node('span',label.split(' ')[0],'tool-label'));bar.append(b);
  }
  // Compatibility name kept for existing habits/tests: returns to the 3D view with the selection tool.
  const view=button('',()=>void run(()=>module('scene'))(),'tool-button hide');view.setAttribute('aria-label','Vue 3D locale');bar.append(view);
}
async function home(){
  generation++;await editQueue.last.catch(()=>{});if(session)await session.flush();closeProject();
  $('modules').replaceChildren();$('tools').replaceChildren();$('inspector').replaceChildren();$('header-actions').replaceChildren();
  $('breadcrumbs').textContent='Mes projets';$('save-status').textContent='';$('viewport-status').textContent='';
  const {mountWelcome}=await import('./home-welcome.ts');
  mountWelcome(panelHost(),{
    projects:await store.list(),
    create:async p=>{await store.create(p);await open(p.manifest.projectId);},
    open,
    template:async file=>{
      const path=file.includes('/')?file:'maps/'+file;
      const response=await fetch(import.meta.env.BASE_URL+path);
      if(!response.ok)throw Error('Scénario indisponible');
      const p=parseProject(await response.json());
      if(!(await store.list()).some(v=>v.projectId===p.manifest.projectId))await store.create(p);
      await open(p.manifest.projectId);
    },
    importFile:()=>($('project-file') as HTMLInputElement).click(),
    report:status,
  });
  panelHost().hidden=false;
  status('Choisissez un modèle ou créez votre monde avec un aperçu du relief.');
}
let mapLoaded=false;
function closeProject(){if(mapLoaded)void import('./geo-map/editor.ts').then(m=>m.releaseGeoMap());disposePanel();disposePanel=()=>{};unsubscribe();unsubscribe=()=>{};viewport?.dispose();viewport=null;session=null;$('studio').classList.remove('in-project');}
async function open(id:string){
  closeProject();session=await StudioSession.open(store,id);const s=session;$('studio').classList.add('in-project');
  const stops=[s.subscribe(()=>refreshHeader()),s.commands.subscribe(t=>{checkImpact(s,t);void inspector();}),s.selection.subscribe(()=>{const key=JSON.stringify(s.selection.selection);if(VIEWPORT_MODULES.has(activeModule)||key!==selectionKey)scheduleInspector();selectionKey=key;})];unsubscribe=()=>stops.forEach(stop=>stop());
  buildHeader();buildToolbar();const saved=ALIASES[s.selection.state.activeModule]??s.selection.state.activeModule;
  await module(MODULES.some(m=>m[0]===saved)||VIEWPORT_MODULES.has(saved)?saved:'scene');
}
async function ensureViewport(){
  if(viewport)return viewport;const s=session!;const {StudioViewport}=await import('./viewport/editor-viewport.ts');if(session!==s)throw Error('Projet fermé');
  viewport=await StudioViewport.create($('workspace'),s,{message:status,refreshInspector:scheduleInspector,toolChanged:id=>{if(id==='select'&&activeModule==='polyline'){const back=returnModule;returnModule='scene';void module(back);}else if(id==='select'&&activeModule!=='scene'&&activeModule!=='paths'&&activeModule!=='zones'&&activeModule!=='races'&&activeModule!=='lights'&&activeModule!=='landscapes')void module('scene');},
    status:info=>{$('viewport-status').textContent=[info.cursor?`X ${info.cursor.x.toFixed(1)} · Z ${info.cursor.z.toFixed(1)}`:'—',{orbit:'Orbite',free:'Vol libre',top:'Dessus'}[info.mode]??info.mode,info.selected?`${info.selected} sélectionné(s)`:'Aucune sélection',`${info.sectors} secteur(s)`].join('  ·  ');}});
  return viewport;
}
let inspectorTimer:ReturnType<typeof setTimeout>|undefined;
function scheduleInspector(){clearTimeout(inspectorTimer);inspectorTimer=setTimeout(()=>void inspector(),30);}
async function module(requested:string){
  const id=ALIASES[requested]??requested,mine=++generation,s=session!;activeModule=id;disposePanel();disposePanel=()=>{};
  s.selection.openModule(id);for(const b of $('modules').querySelectorAll<HTMLElement>('[data-module]'))b.classList.toggle('active',b.dataset.module===id);refreshHeader();
  $('tools').replaceChildren();
  if(VIEWPORT_MODULES.has(id)){
    panelHost().hidden=true;panelHost().replaceChildren();const v=await ensureViewport();if(mine!==generation)return;v.syncFromContext();v.setVisible(true);
    toolPanel(id,v);await inspector();return;
  }
  viewport?.setVisible(false);panelHost().hidden=false;panelHost().replaceChildren();const host=panelHost();
  if(id==='map'){const {mountGeoMap}=await import('./geo-map/editor.ts');mapLoaded=true;if(mine!==generation)return;const panel=node('div','','map-panel');$('tools').append(panel);
    const view=mountGeoMap(host,panel,s,{onPick:(x,z,tolerance)=>void run(()=>pick(x,z,tolerance))(),status,open3D:()=>void run(()=>module('scene'))()});disposePanel=view.dispose;
    const list=node('details','','entity-details');list.open=true;list.append(node('summary','Objets et personnages'));$('tools').append(list);listPanel(s,list);}
  else if(id==='water'){const {mountWater}=await import('./water-view.ts');if(mine!==generation)return;disposePanel=mountWater(host,$('tools'),s).dispose;}
  else if(id==='audio'){const {mountAudio}=await import('./audio-view.ts');if(mine!==generation)return;disposePanel=mountAudio(host,s,()=>mine===generation).dispose;}
  else if(id==='motion-lab'){const {mountHamsterMotionLab}=await import('./hamster-motion-lab.ts');if(mine!==generation)return;disposePanel=mountHamsterMotionLab(host).dispose;}
  else if(id==='settlements'){const {mountSettlements}=await import('./settlements-view.ts');if(mine!==generation)return;disposePanel=mountSettlements(host,s,{status,open3D:view=>void run(async()=>{const selected=s.selection.state.selected,entry=selected?s.document.entityIndex[selected.id]:undefined;await module('scene');if(view)viewport?.goTo(view.x,view.z,view.radius);else if(entry)viewport?.goTo(entry.position.x,entry.position.z,16);else viewport?.focusSelection();})(),play:()=>void run(preview)()});}
  else if(id==='composition'){const {mountCompositionPanel}=await import('./composition-panel.ts');if(mine!==generation)return;disposePanel=mountCompositionPanel(host,s,status);}
  else if(id==='quests'){const {mountQuestsPanel}=await import('./quests-panel.ts');if(mine!==generation)return;disposePanel=mountQuestsPanel(host,s,status).dispose;}
  else if(id==='environment'){const {mountEnvironment}=await import('./environment-view.ts');mountEnvironment(host,s);}
  else if(id==='interactions'){const {mountInteractions}=await import('./interactions-view.ts');await mountInteractions(host,s);$('tools').append(action('Retour à la vue 3D',()=>module('scene')));}
  else if(id==='guide'){const {mountCreationGuide}=await import('./creation-guide.ts');
    mountCreationGuide(host,s,{open:target=>void run(()=>module(target))(),play:()=>void run(preview)()});}
  else if(id==='tests')await diagnostics(host);
  else if(id==='dialogues')await dialogues(host,mine);
  await inspector();
}
/** Contextual left panel of the 3D tools. */
async function toolPanel(id:string,v:StudioViewport){
  const tools=$('tools'),s=session!;
  if(id==='scene'){
    v.setTool('select');const {transformSettings}=await import('./viewport/select-tool.ts');const modes=node('div','','chip-row');
    const apply=()=>{(v.tools.active as {applySettings?:()=>void})?.applySettings?.();for(const c of modes.children)c.classList.toggle('active',(c as HTMLElement).dataset.mode===transformSettings.mode);};
    for(const [mode,label]of [['translate','Déplacer (W)'],['rotate','Pivoter (E)'],['scale','Échelle (R)']] as const){const b=button(label,()=>{transformSettings.mode=mode;apply();},'chip');b.dataset.mode=mode;modes.append(b);}
    const snap=node('input');snap.type='checkbox';snap.checked=transformSettings.snap;snap.onchange=()=>{transformSettings.snap=snap.checked;apply();};
    const follow=node('input');follow.type='checkbox';follow.checked=transformSettings.followTerrain;follow.onchange=()=>{transformSettings.followTerrain=follow.checked;};
    tools.append(node('div','SÉLECTION ET TRANSFORMATION','kicker'),modes,field('Aimanter à la grille',snap),field('Pas de grille (m)',numberInput(transformSettings.grid,x=>{transformSettings.grid=Math.max(.1,x||1);apply();},.1,100)),field('Pas angulaire (°)',numberInput(transformSettings.angle,x=>{transformSettings.angle=Math.max(1,x||15);apply();},1,90)),field('Suivre le relief',follow));apply();
    listPanel(s,tools);
  }else if(id==='objects'){
    // The placement choice is shared with characters/lights: the Objects module always places an asset.
    const {placementSettings}=await import('./viewport/placement-tool.ts');if(placementSettings.item.kind!=='asset')placementSettings.item={kind:'asset',id:lastAsset};
    v.setTool('place');const {mountLibrary}=await import('./library.ts');
    tools.append(node('div','BIBLIOTHÈQUE','kicker'),node('h3','Placer des objets'));
    mountLibrary(tools,s.document.assets,item=>{if(item.kind==='asset')lastAsset=item.id;v.setTool('place');status('Choix conservé : cliquez dans la vue pour placer, autant de fois que nécessaire.');});
    const {transformSettings}=await import('./viewport/select-tool.ts');
    const snap=node('input');snap.type='checkbox';snap.checked=transformSettings.snap;
    snap.onchange=()=>{transformSettings.snap=snap.checked;};
    const controls=node('details','','section-card');controls.open=true;
    controls.append(node('summary','Précision du placement'),
      field('Rotation du prochain objet (°)',numberInput(Math.round(placementSettings.yaw*180/Math.PI),val=>{placementSettings.yaw=val*Math.PI/180;},-360,360)),
      field('Échelle du prochain objet',numberInput(placementSettings.scale,val=>placementSettings.scale=Math.max(.1,Math.min(5,val||1)),.1,5,'0.1')),
      field('Aimantation du placement',snap),
      field('Pas de grille du placement (m)',numberInput(transformSettings.grid,val=>transformSettings.grid=Math.max(.1,Math.min(100,val||1)),.1,100)),
      node('p','R / Maj+R : pivoter par pas de 15° · Échap : quitter le placement · molette/clic droit : orienter la caméra.','muted'));
    tools.append(controls);
    const {mountScatterPanel}=await import('./scatter-panel.ts');mountScatterPanel(tools,v);
    const {mountPatternPanel}=await import('./pattern-panel.ts');
    const editConstruction=(target:import('./viewport/polyline-tool.ts').PolylineTarget)=>{
      void run(async()=>{const {polylineTarget}=await import('./viewport/polyline-tool.ts');
        polylineTarget.current=target;returnModule='objects';await module('polyline');})();
    };
    mountPatternPanel(tools,{session:s,status,edit:editConstruction});
    const {mountConstructionPanel}=await import('./construction-panel.ts');
    mountConstructionPanel(tools,{session:s,status,edit:editConstruction});
    const {mountAssemblyPanel}=await import('./assemblies-panel.ts');const stop=mountAssemblyPanel(tools,s,v,status),previous=disposePanel;disposePanel=()=>{stop();previous();};
  }else if(id==='natural'){
    v.setTool('select');
    const {mountNaturalPanel}=await import('./natural-panel.ts');
    const stop=mountNaturalPanel(tools,{session:s,viewport:v,status,edit:target=>{
      void run(async()=>{const {polylineTarget}=await import('./viewport/polyline-tool.ts');
        polylineTarget.current=target;returnModule='natural';await module('polyline');})();
    }});
    const previous=disposePanel;disposePanel=()=>{stop();previous();};
  }else if(id==='characters'){
    const {placementSettings}=await import('./viewport/placement-tool.ts');let name='Nouvel habitant',species:import('../studio-core/types.ts').CharacterSpecies='hamster';
    const choose=()=>{placementSettings.item={kind:'npc',species,name};v.setTool('place');};choose();
    const target=v.camera.target;let x=target.x,z=target.z;
    tools.append(node('div','PERSONNAGES','kicker'),node('h3','Placer un habitant'),field('Nom du nouveau personnage',input(name,val=>{name=val;choose();})),field('Morphologie',select(species,[['hamster','Hamster (habitants)'],['animal','Petit animal (faune)']],val=>{species=val as typeof species;choose();})),
      node('p','Cliquez dans la vue pour placer le personnage (R : pivoter). Son routine, son apparence et son dialogue se règlent dans l’inspecteur.','muted'),
      field('Créer à X (m)',numberInput(Math.round(x),val=>x=val,s.document.world.bounds.minX,s.document.world.bounds.maxX)),field('Créer à Z (m)',numberInput(Math.round(z),val=>z=val,s.document.world.bounds.minZ,s.document.world.bounds.maxZ)),
      action('Créer un personnage ici',async()=>{const owner=chunkAt(s.document.world,x,z),id=crypto.randomUUID();await s.change('Créer un personnage',[owner],d=>createCharacter(d,{id,name,x,z,species}));s.selection.select({kind:'entity',id});await inspector();}));
    const list=node('div','','search-results');for(const e of Object.values(s.document.entityIndex).filter(e=>e.kind==='character'))list.append(action(e.name,()=>{s.selection.select({kind:'entity',id:e.id});v.focusSelection();}));tools.append(node('h4','Habitants du projet'),list);
  }else if(id==='terrain'||id==='biomes'){
    const {brushSettings}=await import('./viewport/brush-tool.ts');const options:[string,string][]=id==='terrain'?[['raise','Élever'],['lower','Abaisser'],['flatten','Aplanir'],['smooth','Lisser']]:[['forest','Forêt'],['meadow','Prairie'],['mountain','Montagne'],['coast','Côte'],['village','Village'],['exclude-vegetation','Sans végétation'],['restore-vegetation','Rétablir végétation']];
    const saved=s.selection.state.activeTool,current=options.some(o=>o[0]===saved)?saved:options[0][0];v.setTool(current);const chips=node('div','','chip-row');
    for(const [tool,label]of options){const b=button(label,()=>{v.setTool(tool);for(const c of chips.children)c.classList.toggle('active',c===b);},'chip'+(tool===current?' active':''));chips.append(b);}
    if(id==='biomes'){
      const maskProtect=node('input');maskProtect.type='checkbox';maskProtect.checked=brushSettings.maskProtect;
      maskProtect.onchange=()=>{brushSettings.maskProtect=maskProtect.checked;};
      tools.append(field('Conserver les corrections d’occupation existantes',maskProtect),
        node('p','Sans végétation : masque géographique X (aucun arbre, buisson ou herbe généré). Rétablir : efface uniquement les cellules X, sans modifier routes, fermes ni bâtiments.','muted'));
      const {ECOLOGY_PALETTES}=await import('./ecology-palettes.ts');
      const ecological=node('div','','section-card'),palette=select('woodland',ECOLOGY_PALETTES.map(x=>[x.id,x.label] as [string,string]),()=>{});
      ecological.append(node('h4','Palettes écologiques procédurales'),node('p','L’habillage est généré par les biotopes existants : pas de nouvelles entités pour chaque arbre.','muted'),field('Profil écologique',palette),
        button('Appliquer la palette au pinceau',()=>{
          const profile=ECOLOGY_PALETTES.find(p=>p.id===palette.value)!;
          brushSettings.radius=profile.radius;brushSettings.strength=profile.strength;
          v.setTool(profile.mode);
          for(const c of chips.children)c.classList.toggle('active',(c as HTMLElement).textContent===options.find(o=>o[0]===profile.mode)?.[1]);
          status(profile.label+' : peignez sur le terrain. Les masques et exclusions existants restent respectés.');
        }));
      tools.append(ecological);
    }
    tools.append(node('div',id==='terrain'?'RELIEF':'BIOTOPES','kicker'),node('h3',id==='terrain'?'Pinceaux de relief':'Peindre les biotopes'),chips,field('Rayon du pinceau (m)',numberInput(brushSettings.radius,val=>brushSettings.radius=Math.max(1,Math.min(80,val||1)),1,80)),field(id==='terrain'?'Force / hauteur':'Densité ×2',numberInput(brushSettings.strength,val=>brushSettings.strength=Math.max(.1,Math.min(10,val||1)),.1,10)),
      node('p','Glisser : un trait = une opération annulable. [ ] : rayon · - + : force · clic droit / molette : naviguer · Échap : annuler le trait.','muted'));
  }else if(id==='paths'||id==='zones'){
    v.setTool('select');const {mountPathsPanel,mountZonesPanel}=await import('./world-features.ts');
    const ctx={session:s,status,physics:{enabled:()=>v.physicsOverlay,toggle:(on:boolean)=>v.setPhysicsOverlay(on)},focus:(x:number,z:number)=>v.goTo(x,z,30),edit:(target:import('./viewport/polyline-tool.ts').PolylineTarget)=>{void run(async()=>{const {polylineTarget}=await import('./viewport/polyline-tool.ts');polylineTarget.current=target;returnModule=id;await module('polyline');})();}};
    const render=()=>{tools.replaceChildren();(id==='paths'?mountPathsPanel:mountZonesPanel)(tools,ctx);};render();
    const stop=s.commands.subscribe(()=>{if(activeModule===id)render();}),previous=disposePanel;disposePanel=()=>{stop();previous();};
  }else if(id==='surf'){
    v.setTool('select');
    const {mountSurfPanel}=await import('./surf-panel.ts');
    const render=()=>{tools.replaceChildren();mountSurfPanel(tools,{session:s,viewport:v,status});};render();
    const stop=s.commands.subscribe(()=>{if(activeModule==='surf')render();}),previous=disposePanel;
    disposePanel=()=>{stop();previous();};
  }else if(id==='races'){
    v.setTool('select');
    const {mountRacesPanel}=await import('./races-panel.ts');
    const ctx={session:s,viewport:v,status,edit:(target:import('./viewport/polyline-tool.ts').PolylineTarget)=>{
      void run(async()=>{const {polylineTarget}=await import('./viewport/polyline-tool.ts');
        polylineTarget.current=target;returnModule='races';await module('polyline');})();
    }};
    const render=()=>{tools.replaceChildren();mountRacesPanel(tools,ctx);};render();
    const stop=s.commands.subscribe(()=>{if(activeModule==='races')render();}),previous=disposePanel;
    disposePanel=()=>{stop();v.setRacePreview(null);previous();};
  }else if(id==='regions'){
    v.setTool('select');
    const {mountRegionsPanel}=await import('./regions-panel.ts');
    const stop=mountRegionsPanel(tools,{session:s,viewport:v,status,open:id=>{void run(()=>module(id))();},edit:target=>{
      void run(async()=>{const {polylineTarget}=await import('./viewport/polyline-tool.ts');
        polylineTarget.current=target;returnModule='regions';await module('polyline');})();
    }});
    const previous=disposePanel;disposePanel=()=>{stop();previous();};
  }else if(id==='landscapes'){
    v.setTool('select');const {mountLandscapesPanel}=await import('./landscapes-panel.ts');
    const stop=mountLandscapesPanel(tools,{session:s,viewport:v,status}),previous=disposePanel;disposePanel=()=>{stop();previous();};
  }else if(id==='lights'){
    v.setTool('select');const {mountLightsPanel}=await import('./lights-panel.ts');
    const stop=mountLightsPanel(tools,{session:s,viewport:v,status,refresh:()=>void inspector()}),previous=disposePanel;disposePanel=()=>{stop();previous();};
  }else if(id==='polyline'){
    const {polylineTarget}=await import('./viewport/polyline-tool.ts');const target=polylineTarget.current;if(!target){await module('scene');return;}v.setTool('polyline');
    tools.append(node('div','TRACÉ','kicker'),node('h3',target.label),node('p','Clic : ajouter un point · glisser un point : le déplacer · Retour arrière : retirer le dernier · Entrée : valider (une opération) · Échap : abandonner. Clic droit / molette : naviguer.','muted'),
      action('Valider le tracé',()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));},'primary-button'),action('Abandonner',()=>{polylineTarget.current=null;const back=returnModule;returnModule='scene';return module(back);}));
    target.controls?.(tools,()=>{(v.tools.active as {refreshPreview?:()=>void})?.refreshPreview?.();});
  }
}
function listPanel(s:StudioSession,host:HTMLElement){
  const list=mountEntityList(host,s.document,()=>s.selection.selection.map(v=>v.id),(ref,additive)=>{if(additive)s.selection.toggle(ref);else s.selection.select(ref);
    const at=elementAnchor(s.document,ref);if(viewport&&VIEWPORT_MODULES.has(activeModule))viewport.focusSelection();else if(at)s.selection.setCamera(moveContext(s,at.x,at.z));list.refresh();void inspector();});
  const stops=[s.selection.subscribe(()=>list.refresh()),s.commands.subscribe(()=>list.refresh())],previous=disposePanel;disposePanel=()=>{stops.forEach(stop=>stop());previous();};
}
function moveContext(s:StudioSession,x:number,z:number){const c=s.selection.state.camera,t=c.target??{x:c.x,y:0,z:c.z};return {...c,x:c.x+x-t.x,z:c.z+z-t.z,target:{...t,x,z}};}
/** Map click: a close entity first, then the path/river/zone under the point, then a farther entity. */
async function pick(x:number,z:number,tolerance=3){
  const s=session!,p=s.document;let nearest:typeof p.entityIndex[string]|undefined,distance=Infinity;for(const e of Object.values(p.entityIndex)){const d=Math.hypot(e.position.x-x,e.position.z-z);if(d<distance){distance=d;nearest=e;}}
  const line=elementsAt(p,x,z,tolerance)[0];
  const ref=nearest&&distance<Math.max(6,tolerance*2)?{kind:'entity',id:nearest.id}:line??(nearest&&distance<25?{kind:'entity',id:nearest.id}:null);
  s.selection.select(ref);s.selection.setCamera(moveContext(s,x,z));await inspector();
}
/** E9 — after a relief change (2D map, 3D brush, shapes, undo), check the touched elements
 * against the new relief of the project (pure geography of the document, not the viewport). */
let selectionKey='';
let lastImpact:{touched:number;items:import('../studio-core/terrain-impact.ts').ImpactItem[]}|null=null;
function checkImpact(s:StudioSession,t:import('../studio-core/commands.ts').EditTransaction){
  void import('../studio-core/terrain-impact.ts').then(async m=>{
    const areas=m.transactionTerrainAreas(t);if(!areas.length)return;
    const {projectGeography}=await import('../studio-core/geo-context.ts'),g=projectGeography(s.document).ctx;
    const result=m.terrainImpacts(s.document,areas,{height:g.height,water:(x,z)=>g.water(x,z,g.height(x,z))});
    lastImpact=result.touched?{touched:result.touched,items:result.items}:null;
    if(result.items.length)status(`${result.items.length} élément(s) à vérifier après la modification du relief (voir l’inspecteur).`,true);
    scheduleInspector();
  }).catch(()=>{});
}
async function inspector(){
  const s=session;if(!s)return;
  await renderInspector($('inspector'),{session:s,status,open:id=>void run(()=>module(id))(),focus:()=>{if(viewport&&VIEWPORT_MODULES.has(activeModule))viewport.focusSelection();else void module('scene').then(()=>viewport?.focusSelection());},
    editPath:(target)=>{void run(async()=>{const {polylineTarget}=await import('./viewport/polyline-tool.ts');polylineTarget.current=target;await module('polyline');})();},
    view:(x,z)=>{void run(async()=>{if(activeModule!=='scene')await module('scene');viewport?.goTo(x,z,12);})();},
    duplicate:()=>{void withSelectTool(t=>t.duplicate());},remove:()=>{void withSelectTool(t=>t.remove());},refresh:()=>scheduleInspector(),
    ...(lastImpact?{impact:{...lastImpact,dismiss:()=>{lastImpact=null;scheduleInspector();},select:(ref,x,z)=>{s.selection.select(ref);if(viewport&&VIEWPORT_MODULES.has(activeModule))viewport.goTo(x,z,14);else s.selection.setCamera(moveContext(s,x,z));scheduleInspector();}}}:{})});
}
async function withSelectTool(fn:(tool:import('./viewport/select-tool.ts').SelectTool)=>void){if(activeModule!=='scene')await module('scene');const tool=viewport?.tools.active;if(tool&&tool.id==='select')fn(tool as import('./viewport/select-tool.ts').SelectTool);}
async function dialogues(host:HTMLElement,mine:number){
  const s=session!,p=s.document,selected=s.selection.state.selected,entry=selected?p.entityIndex[selected.id]:undefined;
  $('tools').append(action('Retour à la vue 3D',()=>module('scene')));
  if(!entry){host.replaceChildren(node('p','Sélectionnez un PNJ (vue 3D, carte ou recherche) avant d’ouvrir ses dialogues.','workspace-empty'));return;}
  await s.hydrate([entry.ownerChunkId]);const npc=toRuntimeWorld(p,[entry.ownerChunkId]).npcs.find(n=>n.id===entry.id),entity=resolveEntity(p,p.chunks[entry.ownerChunkId].entities[entry.id]),dialogueId=entity.components.DialogueActor?.dialogueIds[0];
  if(!npc||!dialogueId){host.replaceChildren(node('p','Cette entité ne possède pas de dialogue. Les personnages créés dans le Studio en ont un.','workspace-empty'));return;}
  const {createDialogueEditor}=await import('../dialogue-editor.ts');if(mine!==generation)return;const panel=node('div','','section-card');host.replaceChildren(panel);
  const editor=createDialogueEditor(panel,{getNPC:()=>npc,commit:edit=>{edit();void run(async()=>{await s.change('Modifier le dialogue',[],d=>{d.libraries.dialogues={...d.libraries.dialogues,[dialogueId]:{id:dialogueId,actorId:npc.id,...structuredClone(npc.dialogue!)}};});})();},preview:()=>status('Le graphe est enregistré ; « Jouer ici » permet de parler au PNJ.')});
  const unbind=s.commands.subscribe(()=>{const fresh=toRuntimeWorld(p,[entry.ownerChunkId]).npcs.find(n=>n.id===entry.id);if(fresh)Object.assign(npc,fresh);editor.refresh();});disposePanel=()=>{unbind();editor.dispose();};
  $('tools').prepend(node('h3',npc.name));
}
async function diagnostics(host:HTMLElement){
  const panel=node('div','','section-card');panel.append(node('h2','Validation du projet'),node('p','Contrôle strict des références et des assets locaux. La compilation produit des données par secteur ; les meshes et LOD ne sont pas précalculés.','muted'));host.replaceChildren(panel);
  const {preflightProject,compileProject,fetchAssetResolver}=await import('../world-compiler/compile.ts'),p=await session!.fullDocument(),options={resolveAsset:fetchAssetResolver(new URL(import.meta.env.BASE_URL,location.origin).href)};
  const checked=await preflightProject(p,options);for(const d of checked.diagnostics){const entry=d.targetId?p.entityIndex[d.targetId]:undefined;const item=entry?button(d.message,()=>{session!.selection.select({kind:'entity',id:entry.id});void module('scene').then(()=>viewport?.focusSelection());},'diagnostic '+d.severity):node('p',d.message,'diagnostic '+d.severity);panel.append(item);}
  if(!checked.diagnostics.some(d=>d.severity==='ERROR'))panel.append(node('p','Aucune erreur détectée.','status-success'));
  const {authoringIssues}=await import('../studio-core/world-audit.ts');
  const authored=authoringIssues(p),section=node('details','','section-card');
  section.open=authored.some(i=>i.severity==='ERROR');
  section.append(node('summary','Diagnostic de création : '+authored.length+' point(s) à contrôler'),
    node('p','Contrôles d’intégrité des tracés et limites. Les avertissements n’empêchent pas la compilation.','muted'));
  for(const issue of authored.slice(0,100)){
    section.append(button((issue.severity==='ERROR'?'Erreur · ':'À vérifier · ')+issue.message,()=>{
      const s=session;if(!s)return;
      if(issue.kind&&issue.id)s.selection.select({kind:issue.kind,id:issue.id});
      void module('scene').then(()=>viewport?.goTo(issue.x,issue.z,20));
    },'diagnostic '+issue.severity));
  }
  if(authored.length>100)section.append(node('p',(authored.length-100)+' autres points masqués.','muted'));
  if(!authored.length)section.append(node('p','Aucune incohérence structurelle détectée.','status-success'));
  panel.append(section);
  panel.append(button('Inspecter les pentes et collisions en 3D',()=>{void module('scene').then(()=>viewport?.setPhysicsOverlay(true));}),
    node('p','Le contrôle visuel des pentes utilise les seuils du personnage ; il ne remplace pas un test de parcours en jeu.','muted'));
  const content=node('section','','section-card'),contentOutput=node('div');let radiusM=250;
  content.append(node('h3','Contenu jouable et espaces calmes'),node('p','Mesure les entrées d’activités enregistrées et les zones éloignées. La collecte procédurale et la pêche libre ne sont pas inventoriées ; la proximité ne prouve pas l’accès à pied.','muted'),field('Rayon de proximité des activités (m)',numberInput(radiusM,v=>{radiusM=v;},50,1000,'50')),button('Auditer le contenu jouable',async()=>{contentOutput.replaceChildren(node('p','Analyse du contenu…'));await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));try{const {auditPlayability}=await import('../studio-core/playability-audit.ts'),report=auditPlayability(await session!.fullDocument(),{radiusM});contentOutput.replaceChildren(node('p',`${report.stats.quests} missions · ${report.stats.npcs} PNJ · ${report.stats.shops} commerces · ${report.stats.farms} parcelles · ${report.stats.mines} mines · ${report.stats.races} circuits · ${report.stats.skiAreas} descentes ski`),node('p',`${report.coverage.nearActivePercent} % des cellules terrestres à moins de ${report.method.radiusM} m d’une entrée d’activité. Grille : ${Math.round(report.method.spacingX)} × ${Math.round(report.method.spacingZ)} m.`, 'muted'));
   const canvas=node('canvas');canvas.width=640;canvas.height=Math.round(640*(report.bounds.maxZ-report.bounds.minZ)/(report.bounds.maxX-report.bounds.minX));canvas.style.width='100%';canvas.setAttribute('aria-label','Répartition du contenu jouable');const ctx=canvas.getContext('2d')!;
   const w=report.bounds.maxX-report.bounds.minX,h=report.bounds.maxZ-report.bounds.minZ;for(const cell of report.cells){ctx.fillStyle=!cell.land?'#397d9c':cell.activeDistanceM!==null&&cell.activeDistanceM<=report.method.radiusM?'#98bc89':'#d4ae79';ctx.fillRect((cell.x-report.bounds.minX-report.method.spacingX/2)/w*canvas.width,(report.bounds.maxZ-cell.z-report.method.spacingZ/2)/h*canvas.height,canvas.width/report.method.nx+1,canvas.height/report.method.nz+1);}for(const a of report.anchors){ctx.fillStyle='#304958';ctx.beginPath();ctx.arc((a.x-report.bounds.minX)/w*canvas.width,(report.bounds.maxZ-a.z)/h*canvas.height,2,0,Math.PI*2);ctx.fill();}contentOutput.append(canvas,node('p','Vert : proximité d’une activité · ocre : secteur à inspecter ou à conserver calme · points : entrées enregistrées.','muted'));
   for(const finding of report.findings.slice(0,24))contentOutput.append(button(finding.message,()=>{void module('scene').then(()=>viewport?.goTo(finding.x,finding.z,35));}));
   for(const gap of report.gaps.slice(0,8))contentOutput.append(button(`Inspecter (${Math.round(gap.x)}, ${Math.round(gap.z)}) · activité à ${gap.activeDistanceM??'plus de 1 000'} m`,()=>{void module('scene').then(()=>viewport?.goTo(gap.x,gap.z,70));}));
   contentOutput.append(node('p',`Charge source maximale par case de 250 m : ${report.localBudget.maxEntities} entités, ${report.localBudget.maxNPCs} PNJ, ${report.localBudget.maxLights} lumières. Ce comptage ne mesure pas les FPS.`, 'muted'));
  }catch(e){contentOutput.replaceChildren(node('p',String(e),'diagnostic ERROR'));}}),contentOutput);panel.append(content);
  panel.append(action('Exporter le monde compilé',async()=>{const compiled=await compileProject(p,options),bytes=writeFilesArchive(compiled.files);download('compiled-world.zip',bytes.buffer as ArrayBuffer,'application/zip');status(`${compiled.manifest.chunks.length} secteurs compilés ; source auteur inchangée.`);}));
}
async function preview(){
  // Same compiled reader as the published game: compile the snapshot, store the build in
  // IndexedDB, open the game on it. Sources, history, camera and real save slots stay untouched.
  await editQueue.last;const s=session!,p=await s.fullDocument();if(viewport)s.selection.setCamera(viewport.camera.context());await s.flush();
  const selected=s.selection.state.selected,entry=selected?p.entityIndex[selected.id]:undefined,camera=s.selection.state.camera;
  const water=selected?.kind==='water'?p.libraries.water[selected.id]:undefined,waterFocus=water?.points[Math.floor(water.points.length/2)];
  const settlementEntry=selected?Object.values(p.libraries.settlements??{}).flatMap(s=>s.buildings).find(b=>b.id===selected.id||b.doorId===selected.id)?.entry:undefined;
  const usage=entry?.logical?.shopAccess,serviceEntry=usage&&entry?{x:entry.position.x+usage.offset.x+usage.forward.x*.7,z:entry.position.z+usage.offset.z+usage.forward.z*.7}:undefined;
  const focus=settlementEntry??serviceEntry??entry?.position??waterFocus??camera.target??(camera.x!==0||camera.z!==0?camera:null);
  const {compileProject,fetchAssetResolver}=await import('../world-compiler/compile.ts'),{saveTestBuild}=await import('../runtime/build-store.ts');
  status('Compilation de la copie de test…');
  const compiled=await compileProject(p,{resolveAsset:fetchAssetResolver(new URL(import.meta.env.BASE_URL,location.origin).href)});
  let spawn;
  if(focus){const b=p.world.bounds;spawn={x:Math.max(b.minX+4,Math.min(b.maxX-4,focus.x)),y:0,z:Math.max(b.minZ+15,Math.min(b.maxZ-15,focus.z-(settlementEntry||serviceEntry?0:3)))};}
  else{const {defaultSpawn,runtimeConfig}=await import('../runtime/compiled-world.ts');spawn=defaultSpawn(runtimeConfig(compiled.manifest),Object.values(p.chunks).flatMap(c=>c.terrainEdits));}
  const build=await saveTestBuild({projectId:p.manifest.projectId,spawn,files:compiled.files});
  status(`Copie de test compilée (${compiled.manifest.chunks.length} secteurs auteur) : actions et slots temporaires, projet auteur conservé.`);
  window.open(new URL('../?preview=1&studioBuild='+encodeURIComponent(build.buildId),location.href),'little-world-playtest');
}
($('project-file') as HTMLInputElement).onchange=()=>void run(async()=>{
  const file=($('project-file') as HTMLInputElement).files?.[0];if(!file)return;let p:ProjectDocument;
  if(file.name.toLowerCase().endsWith('.zip'))p=readProjectArchive(new Uint8Array(await file.arrayBuffer()));else{const json=JSON.parse(await file.text());if(json.manifest?.schemaVersion===3)p=parseProject(json);else{const migration=migrateWorldToV3(json,{projectId:crypto.randomUUID(),worldId:crypto.randomUUID()});p=migration.project;status(`Migration non destructive : ${migration.report.counts.entities} entités et leurs identifiants préservés.`);}}
  if((await store.list()).some(v=>v.projectId===p.manifest.projectId))throw Error('Ce projet existe déjà. Ouvrez-le depuis Mes projets pour éviter un écrasement.');await store.create(p);await open(p.manifest.projectId);($('project-file') as HTMLInputElement).value='';
})();
const SHORTCUTS:Record<string,string>={v:'scene',m:'map',b:'objects',t:'terrain',l:'lights'};
window.addEventListener('keydown',e=>{
  if(!session||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&(key==='z'||key==='y')){e.preventDefault();if(e.shiftKey||key==='y')session.commands.redo();else session.commands.undo();void inspector();return;}
  if((e.ctrlKey||e.metaKey)&&key==='s'){e.preventDefault();void run(()=>session!.flush())();return;}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&SHORTCUTS[key]&&!viewport?.canvas.dataset.navigating){e.preventDefault();void run(()=>module(SHORTCUTS[key]))();}
});
window.addEventListener('beforeunload',e=>{if(editQueue.pending>0||session&&session.status!=='Sauvegardé localement'){e.preventDefault();e.returnValue='';}});
void run(home)();
