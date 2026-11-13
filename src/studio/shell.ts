import './studio.css';
import {button,field,input,node,numberInput,select,download} from './dom.ts';
import {ProjectStore} from '../studio-core/project-store.ts';
import {createProject,parseProject,chunkAt,affectedChunkIds} from '../studio-core/schema.ts';
import {migrateWorldToV3,toRuntimeWorld} from '../studio-core/migration.ts';
import {readProjectArchive,writeProjectArchive,writeFilesArchive} from '../studio-core/archive.ts';
import {putEntity,removeEntity,putTerrainEdit,putBiomeEdit} from '../studio-core/source.ts';
import {ReferenceIndex,resolveEntity} from '../studio-core/references.ts';
import type {EntityDefinitionV3,ProjectDocument} from '../studio-core/types.ts';
import {StudioSession} from './session.ts';
const store=new ProjectStore(),$=(id:string)=>document.getElementById(id)!;
let session:StudioSession|null=null,dispose=()=>{},unsubscribe=()=>{},asset='props.crate',tool='select',radius=12,strength=2;
let map:{focus:(x:number,z:number)=>void}|null=null;
const status=(message:string,error=false)=>{$('status').textContent=message;$('status').classList.toggle('status-error',error);};
const run=(action:()=>Promise<unknown>|unknown)=>async()=>{try{await action();}catch(e){status(String(e),true);}};
const action=(title:string,fn:()=>Promise<unknown>|unknown)=>button(title,run(fn));
function refreshHeader(){
 const s=session;if(!s)return;$('save-status').textContent=s.status;$('breadcrumbs').textContent=s.document.manifest.name+' / '+s.selection.state.activeModule;
 $('header-actions').replaceChildren(action('Mes projets',home),action('Annuler',async()=>{s.commands.undo();await inspector();}),action('Refaire',async()=>{s.commands.redo();await inspector();}),action('Sauvegarder',()=>s.flush()),action('Exporter ZIP',async()=>{const p=await s.fullDocument();const bytes=writeProjectArchive(p);download(p.manifest.name+'.zip',bytes.buffer as ArrayBuffer,'application/zip');}),action('Tester la copie',preview));
 const buttons=$('header-actions').querySelectorAll('button');buttons[1].disabled=!s.commands.canUndo;buttons[2].disabled=!s.commands.canRedo;
}
async function home(){
 if(session)await session.flush();dispose();unsubscribe();session=null;map=null;$('modules').replaceChildren();$('tools').replaceChildren(node('h3','Vos mondes'),node('p','Projets conservés dans ce navigateur. Exportez une archive pour les transférer ou les protéger.','muted'));$('inspector').replaceChildren();$('header-actions').replaceChildren();$('breadcrumbs').textContent='Mes projets';$('save-status').textContent='';
 const home=node('div','','home'),head=node('div','','home-heading'),titles=node('div');titles.append(node('div','LITTLE WORLD STUDIO · V3','kicker'),node('h1','Des idées aux petits mondes'),node('p','Créez un projet ou poursuivez votre atelier.','muted'));head.append(titles,action('Ouvrir le scénario de référence',async()=>{const response=await fetch(import.meta.env.BASE_URL+'maps/beta.project.json');if(!response.ok)throw Error('Scénario indisponible');const p=parseProject(await response.json());if(!(await store.list()).some(v=>v.projectId===p.manifest.projectId))await store.create(p);await open(p.manifest.projectId);}),action('Importer JSON / ZIP',()=>($('project-file') as HTMLInputElement).click()));home.append(head);
 const form=node('form','','section-card'),name=input('Mon petit monde',()=>{}),size=select('1000',[['200','200 × 600 m'],['1000','1 000 × 1 000 m — cible B1']],()=>{}),create=button('Créer le projet',()=>{},'primary-button');create.type='submit';form.append(field('Nom du projet',name),field('Dimensions',size),create);form.onsubmit=e=>{e.preventDefault();void run(async()=>{const side=Number(size.value),p=createProject({name:name.value,width:side,length:side===200?600:side});await store.create(p);await open(p.manifest.projectId);})();};home.append(form);
 const cards=node('div','','project-cards');for(const p of await store.list()){const card=node('article','','project-card');card.append(node('div','PROJET LOCAL · V3','kicker'),node('h2',p.name),node('p',`Révision ${p.revision} · ${new Date(p.updatedAt).toLocaleString('fr')}`,'muted'),action('Ouvrir le monde',()=>open(p.projectId)));cards.append(card);}home.append(cards);$('workspace').replaceChildren(home);status('Studio V3 : socle et carte auteur. La qualification bêta reste en cours.');
}
async function open(id:string){dispose();unsubscribe();session=await StudioSession.open(store,id);const s=session;unsubscribe=s.subscribe(()=>{refreshHeader();});await module(s.selection.state.activeModule==='dialogues'?'dialogues':'map');refreshHeader();}
async function module(id:string){
 const s=session!;dispose();dispose=()=>{};map=null;s.selection.openModule(id);$('tools').replaceChildren();$('inspector').replaceChildren();$('modules').replaceChildren(...[['map','Carte globale'],['objects','Objets'],['terrain','Relief'],['biomes','Biotopes'],['dialogues','Dialogues'],['interactions','Interactions'],['tests','Validation / compilation']].map(([key,label])=>{const b=action(label,()=>module(key));b.classList.toggle('active',key===id);return b;}));
 if(id==='interactions'){const {mountInteractions}=await import('./interactions-view.ts');await mountInteractions($('workspace'),s);return;}
 if(id==='tests'){await diagnostics();return;}
 if(id==='dialogues'){await dialogues();return;}
 $('tools').append(node('div','ATELIER','kicker'),node('h3',id==='objects'?'Objets':id==='terrain'?'Relief':id==='biomes'?'Biotopes':'Carte globale'));
 if(id==='objects'){
  $('tools').append(select(tool,[['select','Sélectionner'],['place','Placer un objet']],v=>{tool=v;s.selection.setTool(v);}),select(asset,Object.values(s.document.assets).map(a=>[a.id,a.name] as const),v=>asset=v));
 }else if(id==='terrain'||id==='biomes'){
  tool=id==='terrain'?'raise':'forest';$('tools').append(select(tool,id==='terrain'?[['raise','Élever'],['lower','Abaisser'],['flatten','Aplanir']]:[['forest','Forêt'],['meadow','Prairie'],['mountain','Montagne'],['coast','Côte']],v=>tool=v),field('Rayon (m)',numberInput(radius,v=>radius=v,1,100)),field(id==='terrain'?'Force / hauteur':'Densité',numberInput(strength,v=>strength=v,0,20)),node('p','Un clic applique une retouche circulaire, annulable en une opération.','muted'));
 }else tool='select';
 const search=input('',v=>results(v));search.placeholder='Nom ou identifiant…';search.oninput=()=>results(search.value);$('tools').append(field('Rechercher une entité',search),node('div','','search-results'));results('');
 const {mountMap}=await import('./map-view.ts');const view=mountMap($('workspace'),s,(x,z)=>void run(()=>pick(x,z))());map=view;dispose=view.dispose;await inspector();status('Carte des sources : les secteurs et entités sont indexés sans charger les géométries 3D.');
}
function results(query:string){const host=$('tools').querySelector('.search-results');if(!host)return;host.replaceChildren();for(const e of Object.values(session!.document.entityIndex).filter(e=>(e.name+' '+e.id).toLowerCase().includes(query.toLowerCase())).slice(0,60))host.append(action(e.name,async()=>{session!.selection.select({kind:'entity',id:e.id});map?.focus(e.position.x,e.position.z);await inspector();}));}
async function pick(x:number,z:number){
 const s=session!,p=s.document,id=s.selection.state.activeModule;
 if(id==='terrain'||id==='biomes'){
  const chunks=affectedChunkIds(p.world,x,z,radius),stroke={id:crypto.randomUUID(),x,z,radius,strength};
  await s.change(id==='terrain'?'Retouche du relief':'Peindre un biotope',chunks,d=>{if(id==='terrain')putTerrainEdit(d,{...stroke,mode:tool as 'raise'|'lower'|'flatten',height:strength});else putBiomeEdit(d,{id:stroke.id,x,z,radius,biome:tool as 'forest',density:Math.min(2,strength)});});status('Retouche enregistrée dans les sources ; aperçu 3D disponible dans la copie de test.');return;
 }
 if(id==='objects'&&tool==='place'){
  const ownerChunkId=chunkAt(p.world,x,z),entity:EntityDefinitionV3={id:crypto.randomUUID(),name:p.assets[asset].name,kind:'prop',ownerChunkId,components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:asset}}};await s.change('Placer un objet',[ownerChunkId],d=>putEntity(d,entity));s.selection.select({kind:'entity',id:entity.id});results('');await inspector();return;
 }
 let nearest:typeof p.entityIndex[string]|undefined,distance=Infinity;for(const e of Object.values(p.entityIndex)){const d=Math.hypot(e.position.x-x,e.position.z-z);if(d<distance){distance=d;nearest=e;}}
 s.selection.select(nearest&&distance<25?{kind:'entity',id:nearest.id}:null);await inspector();
}
async function inspector(){
 const s=session!,p=s.document,selected=s.selection.state.selected,host=$('inspector');host.replaceChildren(node('div','INSPECTEUR','kicker'));
 const entry=selected?p.entityIndex[selected.id]:undefined;if(!entry){host.append(node('h3','Votre monde'),node('p','Sélectionnez un objet sur la carte ou dans la recherche.','muted'));return;}
 await s.hydrate([entry.ownerChunkId]);const e=p.chunks[entry.ownerChunkId].entities[entry.id],resolved=resolveEntity(p,e),transform=resolved.components.Transform!;
 host.append(node('h3',e.name),node('p',e.id,'selection-tag'));
 const update=async(edit:(v:EntityDefinitionV3)=>void)=>{const next=structuredClone(e);next.components.Transform=structuredClone(transform);edit(next);next.ownerChunkId=chunkAt(p.world,next.components.Transform!.position.x,next.components.Transform!.position.z);await s.change('Modifier '+e.name,[entry.ownerChunkId,next.ownerChunkId],d=>putEntity(d,next));await inspector();results('');};
 host.append(field('Nom',input(e.name,v=>run(()=>update(n=>n.name=v))())));
 for(const axis of ['x','y','z'] as const)host.append(field('Position '+axis.toUpperCase()+' (m)',numberInput(transform.position[axis],v=>run(()=>update(n=>n.components.Transform!.position[axis]=v))(),-5000,5000)));
 host.append(field('Échelle',numberInput(transform.scale.x,v=>run(()=>update(n=>n.components.Transform!.scale={x:v,y:v,z:v}))(),.1,10)),action('Supprimer',async()=>{const refs=new ReferenceIndex(p).dependents(e.id);if(refs.length)throw Error('Suppression impossible : des références utilisent cette entité.');await s.change('Supprimer '+e.name,[entry.ownerChunkId],d=>removeEntity(d,e.id));s.selection.select(null);results('');await inspector();}));
 host.append(action('Configurer une interaction',()=>module('interactions')));
 if(resolved.components.DialogueActor)host.append(action('Ouvrir son dialogue',()=>module('dialogues')));
}
async function dialogues(){
 const s=session!,p=s.document,selected=s.selection.state.selected,entry=selected?p.entityIndex[selected.id]:undefined;
 if(!entry){$('workspace').replaceChildren(node('p','Sélectionnez un PNJ depuis la carte avant d’ouvrir ses dialogues.','workspace-empty'));return;}
 await s.hydrate([entry.ownerChunkId]);const npc=toRuntimeWorld(p,[entry.ownerChunkId]).npcs.find(n=>n.id===entry.id),entity=resolveEntity(p,p.chunks[entry.ownerChunkId].entities[entry.id]),dialogueId=entity.components.DialogueActor?.dialogueIds[0];
 if(!npc||!dialogueId){$('workspace').replaceChildren(node('p','Cette entité ne possède pas de dialogue. Importez une carte V2 avec PNJ pour modifier ses dialogues.','workspace-empty'));return;}
 const {createDialogueEditor}=await import('../dialogue-editor.ts');const panel=node('div','','section-card');$('workspace').replaceChildren(panel);const editor=createDialogueEditor(panel,{getNPC:()=>npc,commit:edit=>{edit();void run(async()=>{await s.change('Modifier le dialogue',[],d=>{d.libraries.dialogues={...d.libraries.dialogues,[dialogueId]:{id:dialogueId,actorId:npc.id,...structuredClone(npc.dialogue!)}};});})();},preview:()=>status('Le graphe est enregistré ; testez la copie pour parler au PNJ.')});const unbind=s.commands.subscribe(()=>{const fresh=toRuntimeWorld(p,[entry.ownerChunkId]).npcs.find(n=>n.id===entry.id);if(fresh)Object.assign(npc,fresh);editor.refresh();});dispose=()=>{unbind();editor.dispose();};$('tools').append(node('h3',npc.name),action('Retour à la carte',()=>module('map')));
}
async function diagnostics(){
 const panel=node('div','','section-card');panel.append(node('h2','Validation du projet'),node('p','Contrôle strict des références et des assets locaux. La compilation produit des données par secteur ; les meshes et LOD ne sont pas précalculés.','muted'));$('workspace').replaceChildren(panel);
 const {preflightProject,compileProject,fetchAssetResolver}=await import('../world-compiler/compile.ts'),p=await session!.fullDocument(),options={resolveAsset:fetchAssetResolver(new URL(import.meta.env.BASE_URL,location.origin).href)};
 const checked=await preflightProject(p,options);for(const d of checked.diagnostics)panel.append(node('p',d.message,'diagnostic '+d.severity));if(!checked.diagnostics.some(d=>d.severity==='ERROR'))panel.append(node('p','Aucune erreur détectée.','status-success'));
 panel.append(action('Exporter le monde compilé',async()=>{const compiled=await compileProject(p,options),bytes=writeFilesArchive(compiled.files);download('compiled-world.zip',bytes.buffer as ArrayBuffer,'application/zip');status(`${compiled.manifest.chunks.length} secteurs compilés ; source auteur inchangée.`);}));
}
async function preview(){
 const s=session!,p=await s.fullDocument();await s.flush();const world=toRuntimeWorld(p);
 if((world.config.width??200)>2000||(world.config.length??600)>2000)throw Error('Le lecteur de test actuel est limité à 2 km par axe.');
 const {savePlaytest}=await import('../gameplay/playable.ts'),{gameplayDataFromProject}=await import('../gameplay/project-adapter.ts');
 const selected=s.selection.state.selected,entry=selected?p.entityIndex[selected.id]:undefined,camera=s.selection.state.camera;
 const spawn={x:entry?.position.x??camera.x,y:0,z:Math.max(p.world.bounds.minZ+.5,Math.min(p.world.bounds.maxZ-.5,(entry?.position.z??camera.z)-3))};
 const snapshot=savePlaytest({projectId:p.manifest.projectId,content:{schemaVersion:1,kind:'playable-world',world,gameplay:gameplayDataFromProject(p),spawn}});
 status('Copie de test prête : actions et slots temporaires, projet auteur conservé.');window.open(new URL('../?preview=1&studioPreview='+encodeURIComponent(snapshot.snapshotId),location.href),'little-world-playtest');
}
($('project-file') as HTMLInputElement).onchange=()=>void run(async()=>{
 const file=($('project-file') as HTMLInputElement).files?.[0];if(!file)return;let p:ProjectDocument;
 if(file.name.toLowerCase().endsWith('.zip'))p=readProjectArchive(new Uint8Array(await file.arrayBuffer()));else{const json=JSON.parse(await file.text());if(json.manifest?.schemaVersion===3)p=parseProject(json);else{const migration=migrateWorldToV3(json,{projectId:crypto.randomUUID(),worldId:crypto.randomUUID()});p=migration.project;status(`Migration non destructive : ${migration.report.counts.entities} entités et leurs identifiants préservés.`);}}
 if((await store.list()).some(v=>v.projectId===p.manifest.projectId))throw Error('Ce projet existe déjà. Ouvrez-le depuis Mes projets pour éviter un écrasement.');await store.create(p);await open(p.manifest.projectId);($('project-file') as HTMLInputElement).value='';
})();
window.addEventListener('keydown',e=>{if(!session||(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)session.commands.redo();else session.commands.undo();void inspector();}});
window.addEventListener('beforeunload',e=>{if(session&&session.status!=='Sauvegardé localement'){e.preventDefault();e.returnValue='';}});
void run(home)();
