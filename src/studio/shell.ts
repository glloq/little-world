import './studio.css';
import {button,field,input,node,numberInput,select,download} from './dom.ts';
import {ProjectStore} from '../studio-core/project-store.ts';
import {createProject,parseProject,chunkAt} from '../studio-core/schema.ts';
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
let inspectorOpen=true,returnModule='scene';
const status=(message:string,error=false)=>{$('status').textContent=message;$('status').classList.toggle('status-error',error);};
const run=(action:()=>Promise<unknown>|unknown)=>async()=>{try{await action();}catch(e){status(String(e instanceof Error?e.message:e),true);}};
const action=(title:string,fn:()=>Promise<unknown>|unknown,className?:string)=>button(title,run(fn),className);
/** Toolbar: [module id, accessible name, icon, group, shortcut]. Viewport modules keep the 3D view. */
const MODULES:[string,string,string,string,string][]=[
  ['scene','Sélection','➚','Naviguer','V'],['map','Carte globale','▦','Naviguer','M'],
  ['objects','Objets','▣','Construire','B'],['characters','Personnages','☺','Construire',''],
  ['terrain','Relief','⛰','Monde','T'],['biomes','Biotopes','✿','Monde',''],['paths','Chemins et rivières','〰','Monde',''],['water','Eau','≈','Monde',''],['zones','Zones','⬠','Monde',''],
  ['dialogues','Dialogues','✉','Logique',''],['interactions','Interactions','⚙','Logique',''],['environment','Environnement','☀','Logique',''],['audio','Audio','♪','Logique',''],
  ['tests','Validation / compilation','✓','Projet',''],
];
const VIEWPORT_MODULES=new Set(['scene','objects','characters','terrain','biomes','polyline','paths','zones']);
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
  $('modules').replaceChildren();$('tools').replaceChildren(node('h3','Vos mondes'),node('p','Projets conservés dans ce navigateur. Exportez une archive pour les transférer ou les protéger.','muted'));$('inspector').replaceChildren();$('header-actions').replaceChildren();$('breadcrumbs').textContent='Mes projets';$('save-status').textContent='';$('viewport-status').textContent='';
  const page=node('div','','home'),head=node('div','','home-heading'),titles=node('div');titles.append(node('div','LITTLE WORLD STUDIO · V3','kicker'),node('h1','Des idées aux petits mondes'),node('p','Créez un projet ou poursuivez votre atelier.','muted'));
  const reference=(file:string)=>async()=>{const response=await fetch(import.meta.env.BASE_URL+'maps/'+file);if(!response.ok)throw Error('Scénario indisponible');const p=parseProject(await response.json());if(!(await store.list()).some(v=>v.projectId===p.manifest.projectId))await store.create(p);await open(p.manifest.projectId);};
  head.append(titles,action('Ouvrir le scénario de référence',reference('beta.project.json')),action('Scène de référence géographique',reference('reference.project.json')),action('Importer JSON / ZIP',()=>($('project-file') as HTMLInputElement).click()));page.append(head);
  const form=node('form','','section-card'),name=input('Mon petit monde',()=>{}),size=select('1000',[['island','Île volcanique · 3 000 × 8 000 m'],['archipelago','Archipel éditable (île, volcan, îlots) · 3 000 × 8 000 m'],['200','Vallée historique · 200 × 600 m'],['1000','Vallée historique · 1 000 × 1 000 m']],()=>{}),seed=numberInput(4242,()=>{},1,9999999),create=button('Créer le projet',()=>{},'primary-button');create.type='submit';
  form.append(field('Nom du projet',name),field('Modèle et dimensions',size),field('Graine du relief',seed),node('p','Le relief de base est généré par des paramètres (côtes, volcan, massifs, vallées, îlots) éditables sur la carte 2D ; vos retouches et contenus s’ajoutent par-dessus sans le recopier.','muted'),create);
  form.onsubmit=e=>{e.preventDefault();void run(async()=>{const value=Math.max(1,Math.min(9999999,Math.round(Number(seed.value)||1)));let p;if(size.value==='archipelago'){const {archipelagoPreset}=await import('../geography/archipelago-params.ts');p=createProject({name:name.value,width:3000,length:8000,seed:value,terrain:{kind:'archipelago',version:1,archipelago:archipelagoPreset(3000,8000)}});}else if(size.value==='island'){const {islandPreset}=await import('../terrain-generator.ts');p=createProject({name:name.value,width:3000,length:8000,seed:value,terrain:islandPreset(3000,8000)});}else{const side=Number(size.value);p=createProject({name:name.value,width:side,length:side===200?600:side,seed:value});}await store.create(p);await open(p.manifest.projectId);})();};page.append(form);
  const cards=node('div','','project-cards');for(const p of await store.list()){const card=node('article','','project-card');card.append(node('div','PROJET LOCAL · V3','kicker'),node('h2',p.name),node('p',`Révision ${p.revision} · ${new Date(p.updatedAt).toLocaleString('fr')}`,'muted'),action('Ouvrir le monde',()=>open(p.projectId)));cards.append(card);}page.append(cards);
  panelHost().hidden=false;panelHost().replaceChildren(page);status('Studio V3 : éditeur de monde 3D. La qualification bêta reste en cours.');
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
  viewport=await StudioViewport.create($('workspace'),s,{message:status,refreshInspector:scheduleInspector,toolChanged:id=>{if(id==='select'&&activeModule==='polyline'){const back=returnModule;returnModule='scene';void module(back);}else if(id==='select'&&activeModule!=='scene'&&activeModule!=='paths'&&activeModule!=='zones')void module('scene');},
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
  else if(id==='environment'){const {mountEnvironment}=await import('./environment-view.ts');mountEnvironment(host,s);}
  else if(id==='interactions'){const {mountInteractions}=await import('./interactions-view.ts');await mountInteractions(host,s);$('tools').append(action('Retour à la vue 3D',()=>module('scene')));}
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
    v.setTool('place');const {mountLibrary}=await import('./library.ts');tools.append(node('div','BIBLIOTHÈQUE','kicker'),node('h3','Placer des objets'));mountLibrary(tools,s.document.assets,()=>{v.setTool('place');status('Choix conservé : cliquez dans la vue pour placer, autant de fois que nécessaire.');});
  }else if(id==='characters'){
    const {placementSettings}=await import('./viewport/placement-tool.ts');let name='Nouvel habitant',species:'squirrel'|'animal'='squirrel';
    const choose=()=>{placementSettings.item={kind:'npc',species,name};v.setTool('place');};choose();
    const target=v.camera.target;let x=target.x,z=target.z;
    tools.append(node('div','PERSONNAGES','kicker'),node('h3','Placer un habitant'),field('Nom du nouveau personnage',input(name,val=>{name=val;choose();})),field('Morphologie',select(species,[['squirrel','Écureuil'],['animal','Petit animal']],val=>{species=val as typeof species;choose();})),
      node('p','Cliquez dans la vue pour placer le personnage (R : pivoter). Son routine, son apparence et son dialogue se règlent dans l’inspecteur.','muted'),
      field('Créer à X (m)',numberInput(Math.round(x),val=>x=val,s.document.world.bounds.minX,s.document.world.bounds.maxX)),field('Créer à Z (m)',numberInput(Math.round(z),val=>z=val,s.document.world.bounds.minZ,s.document.world.bounds.maxZ)),
      action('Créer un personnage ici',async()=>{const owner=chunkAt(s.document.world,x,z),id=crypto.randomUUID();await s.change('Créer un personnage',[owner],d=>createCharacter(d,{id,name,x,z,species}));s.selection.select({kind:'entity',id});await inspector();}));
    const list=node('div','','search-results');for(const e of Object.values(s.document.entityIndex).filter(e=>e.kind==='character'))list.append(action(e.name,()=>{s.selection.select({kind:'entity',id:e.id});v.focusSelection();}));tools.append(node('h4','Habitants du projet'),list);
  }else if(id==='terrain'||id==='biomes'){
    const {brushSettings}=await import('./viewport/brush-tool.ts');const options:[string,string][]=id==='terrain'?[['raise','Élever'],['lower','Abaisser'],['flatten','Aplanir'],['smooth','Lisser']]:[['forest','Forêt'],['meadow','Prairie'],['mountain','Montagne'],['coast','Côte'],['village','Village']];
    const saved=s.selection.state.activeTool,current=options.some(o=>o[0]===saved)?saved:options[0][0];v.setTool(current);const chips=node('div','','chip-row');
    for(const [tool,label]of options){const b=button(label,()=>{v.setTool(tool);for(const c of chips.children)c.classList.toggle('active',c===b);},'chip'+(tool===current?' active':''));chips.append(b);}
    tools.append(node('div',id==='terrain'?'RELIEF':'BIOTOPES','kicker'),node('h3',id==='terrain'?'Pinceaux de relief':'Peindre les biotopes'),chips,field('Rayon du pinceau (m)',numberInput(brushSettings.radius,val=>brushSettings.radius=Math.max(1,Math.min(80,val||1)),1,80)),field(id==='terrain'?'Force / hauteur':'Densité ×2',numberInput(brushSettings.strength,val=>brushSettings.strength=Math.max(.1,Math.min(10,val||1)),.1,10)),
      node('p','Glisser : un trait = une opération annulable. [ ] : rayon · - + : force · clic droit / molette : naviguer · Échap : annuler le trait.','muted'));
  }else if(id==='paths'||id==='zones'){
    v.setTool('select');const {mountPathsPanel,mountZonesPanel}=await import('./world-features.ts');
    const ctx={session:s,status,focus:(x:number,z:number)=>v.goTo(x,z,30),edit:(target:import('./viewport/polyline-tool.ts').PolylineTarget)=>{void run(async()=>{const {polylineTarget}=await import('./viewport/polyline-tool.ts');polylineTarget.current=target;returnModule=id;await module('polyline');})();}};
    const render=()=>{tools.replaceChildren();(id==='paths'?mountPathsPanel:mountZonesPanel)(tools,ctx);};render();
    const stop=s.commands.subscribe(()=>{if(activeModule===id)render();}),previous=disposePanel;disposePanel=()=>{stop();previous();};
  }else if(id==='polyline'){
    const {polylineTarget}=await import('./viewport/polyline-tool.ts');const target=polylineTarget.current;if(!target){await module('scene');return;}v.setTool('polyline');
    tools.append(node('div','TRACÉ','kicker'),node('h3',target.label),node('p','Clic : ajouter un point · glisser un point : le déplacer · Retour arrière : retirer le dernier · Entrée : valider (une opération) · Échap : abandonner. Clic droit / molette : naviguer.','muted'),
      action('Valider le tracé',()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));},'primary-button'),action('Abandonner',()=>{polylineTarget.current=null;const back=returnModule;returnModule='scene';return module(back);}));
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
  panel.append(action('Exporter le monde compilé',async()=>{const compiled=await compileProject(p,options),bytes=writeFilesArchive(compiled.files);download('compiled-world.zip',bytes.buffer as ArrayBuffer,'application/zip');status(`${compiled.manifest.chunks.length} secteurs compilés ; source auteur inchangée.`);}));
}
async function preview(){
  // Same compiled reader as the published game: compile the snapshot, store the build in
  // IndexedDB, open the game on it. Sources, history, camera and real save slots stay untouched.
  await editQueue.last;const s=session!,p=await s.fullDocument();if(viewport)s.selection.setCamera(viewport.camera.context());await s.flush();
  const selected=s.selection.state.selected,entry=selected?p.entityIndex[selected.id]:undefined,camera=s.selection.state.camera;
  const water=selected?.kind==='water'?p.libraries.water[selected.id]:undefined,waterFocus=water?.points[Math.floor(water.points.length/2)];
  const focus=entry?.position??waterFocus??camera.target??(camera.x!==0||camera.z!==0?camera:null);
  const {compileProject,fetchAssetResolver}=await import('../world-compiler/compile.ts'),{saveTestBuild}=await import('../runtime/build-store.ts');
  status('Compilation de la copie de test…');
  const compiled=await compileProject(p,{resolveAsset:fetchAssetResolver(new URL(import.meta.env.BASE_URL,location.origin).href)});
  let spawn;
  if(focus){const b=p.world.bounds;spawn={x:Math.max(b.minX+4,Math.min(b.maxX-4,focus.x)),y:0,z:Math.max(b.minZ+15,Math.min(b.maxZ-15,focus.z-3))};}
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
const SHORTCUTS:Record<string,string>={v:'scene',m:'map',b:'objects',t:'terrain'};
window.addEventListener('keydown',e=>{
  if(!session||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&(key==='z'||key==='y')){e.preventDefault();if(e.shiftKey||key==='y')session.commands.redo();else session.commands.undo();void inspector();return;}
  if((e.ctrlKey||e.metaKey)&&key==='s'){e.preventDefault();void run(()=>session!.flush())();return;}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&SHORTCUTS[key]&&!viewport?.canvas.dataset.navigating){e.preventDefault();void run(()=>module(SHORTCUTS[key]))();}
});
window.addEventListener('beforeunload',e=>{if(editQueue.pending>0||session&&session.status!=='Sauvegardé localement'){e.preventDefault();e.returnValue='';}});
void run(home)();
