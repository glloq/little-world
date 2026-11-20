/**
 * "Monde généré" (doc 105): manual editing of everything the coherent
 * generator produces that had no editor — earthworks, authored seabed,
 * dive sites — plus re-running the coherence planners (walking links,
 * hosts/dialogues/quests) after manual changes. Every action is one undoable
 * transaction; heavy analyses run only on demand, never on each render.
 */
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {ProjectDocument} from '../studio-core/types.ts';
import type {EarthworkV1} from '../geography/earthworks.ts';
import type {SeabedFeatureV1} from '../geography/bathymetry.ts';
import {DIVE_SITE_KINDS,type DiveSiteKind} from '../water/dive-sites.ts';
import {withBusy} from './busy.ts';

type Status=(message:string,error?:boolean)=>void;
const KIND:Record<EarthworkV1['kind'],string>={pad:'Plateforme',terraces:'Terrasses',corridor:'Lit de route'};
const SEABED:Record<SeabedFeatureV1['kind'],string>={reef:'Récif',sandbar:'Banc de sable',shoal:'Haut-fond','blue-hole':'Trou bleu',trench:'Fosse'};
const DIVE:Record<DiveSiteKind,string>={reef:'Récif',wreck:'Épave','drop-off':'Tombant','blue-hole':'Trou bleu',kelp:'Forêt de varech',cave:'Grotte marine',shoal:'Haut-fond'};
/** Copy-on-write: the transaction draft shares nested objects with the document (see edit.ts),
 * so the terrain is cloned before any in-place change — otherwise no undo patch and no save. */
const archipelago=(d:ProjectDocument)=>{if(d.world.terrain?.kind!=='archipelago')throw Error('Relief insulaire requis');d.world.terrain=structuredClone(d.world.terrain);return d.world.terrain.archipelago;};
/** Operations that add or remove entities/paths may touch any sector: they copy them all (rare, explicit actions). */
const allChunks=(d:ProjectDocument)=>Object.keys(d.chunkIndex);

export function mountGeneratedPanel(host:HTMLElement,session:StudioSession,status:Status):()=>void{
 const root=node('div','','generated-panel');host.append(root);let disposed=false;
 const loadAll=async()=>{await session.hydrate(Object.keys(session.document.chunkIndex));return session.document;};
 const change=(label:string,edit:(d:ProjectDocument)=>void)=>withBusy(label+'…',async()=>{await loadAll();await session.change(label,[],edit);status(label+' · opération annulable (Ctrl+Z).');}).catch(e=>status(e instanceof Error?e.message:String(e),true));

 function coherence(){
  const box=node('section');box.append(node('h3','Cohérence du monde'),node('p','Analyse à la demande : occupation du sol, accès à pied depuis le port, quêtes générées.','muted'));
  const out=node('div');
  box.append(button('Analyser',()=>withBusy('Analyse de cohérence…',async()=>{
   const p=await loadAll(),[{auditLandUse},{buildCirculationGraph,circulationReport}]=await Promise.all([import('../studio-core/land-registry.ts'),import('../studio-core/circulation.ts')]);
   const overlaps=auditLandUse(p),r=circulationReport(buildCirculationGraph(p)),unreached=r.destinations.filter(d=>d.status!=='reachable');
   const quests=Object.keys(p.libraries.questCatalog??{}).filter(k=>k.startsWith('quest:gen:')).length;
   out.replaceChildren(node('p',`${r.reachable}/${r.destinations.length} lieux atteignables à pied · ${overlaps.length} chevauchement(s) d’occupation · ${quests} quête(s) générée(s)`),
    ...unreached.slice(0,12).map(d=>node('p',`${d.status==='unlinked'?'Sans chemin':'Réseau séparé'} : ${d.name} (${d.x}, ${d.z})`,'diagnostic WARNING')),
    ...overlaps.slice(0,8).map(d=>node('p',d.message,'diagnostic WARNING')));
  })),
  // The link planner reads the full hydrated document, then commits the paths in one transaction.
  button('Relier les lieux isolés',()=>withBusy('Tracé des liaisons…',async()=>{
   const p=await loadAll(),[{planCirculationLinks},{terrainAccessContext},{putPath}]=await Promise.all([import('../studio-core/circulation.ts'),import('../studio-core/terrain-access.ts'),import('../studio-core/source.ts')]);
   const links=planCirculationLinks(p,terrainAccessContext(p));
   if(!links.paths.length){status(links.failed.length?`Aucune liaison praticable (${links.failed.length} lieu(x) restent isolés).`:'Tous les lieux sont déjà reliés.');return;}
   await session.change('Relier les lieux isolés',allChunks(session.document),d=>{for(const path of links.paths)putPath(d,path);});
   status(`${links.paths.length} liaison(s) ajoutée(s)${links.failed.length?` · ${links.failed.length} lieu(x) restent isolés`:''} · annulable.`);
  }).catch(e=>status(String(e),true))),out);
  const locale=select('fr',[['fr','Français'],['en','English']],()=>{});
  box.append(field('Langue des textes générés',locale),button('Régénérer hôtes, dialogues et quêtes',()=>withBusy('Hôtes et quêtes…',async()=>{
   await loadAll();const {planActivityStories}=await import('../studio-core/activity-stories.ts');
   // Locked hosts (and their quests) are preserved; everything else is rebuilt from the current map.
   const keep=new Set(Object.keys(session.document.entityIndex).filter(id=>id.startsWith('host:')&&session.selection.isLocked(id)));
   let result:{hosts:string[];quests:string[]}|undefined;
   await session.change('Régénérer hôtes, dialogues et quêtes',allChunks(session.document),d=>{result=planActivityStories(d,{locale:locale.value as 'fr'|'en',keep});});
   status(`${result?.hosts.length??0} hôte(s), ${result?.quests.length??0} quête(s) · ${keep.size} hôte(s) verrouillé(s) conservé(s) · annulable.`);
  }).catch(e=>status(String(e),true))));
  return box;
 }

 function earthworks(p:ProjectDocument){
  const box=node('section'),list=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.earthworks??[]:[];
  box.append(node('h3','Terrassements'),node('p',list.length?'Niveaux en mètres au-dessus de la mer ; le talus est la bande de raccord extérieure. Les maisons posées dessus suivent après « Recalculer » dans Villages & villes.':'Aucun terrassement : activez « Terrasser » à la création ou depuis un thème.','muted'));
  for(const w of list){
   const row=node('div','','generated-row');row.append(node('strong',`${KIND[w.kind]} · ${w.id}`));
   const set=(label:string,patch:(x:EarthworkV1)=>void)=>change(label,d=>{const a=archipelago(d),i=(a.earthworks??[]).findIndex(x=>x.id===w.id);if(i<0)throw Error('Terrassement introuvable');const next=structuredClone(a.earthworks![i]);patch(next);a.earthworks=[...a.earthworks!.slice(0,i),next,...a.earthworks!.slice(i+1)];});
   if(w.kind!=='corridor')row.append(field('Niveau (m)',numberInput(w.levelM,v=>set('Modifier le niveau d’un terrassement',x=>{if(x.kind!=='corridor')x.levelM=v;}),-200,1400,'0.1')));
   row.append(field('Talus (m)',numberInput(w.talusM,v=>set('Modifier le talus d’un terrassement',x=>{x.talusM=v;}),.5,120,'0.5')),
    button('Supprimer',()=>change('Supprimer un terrassement',d=>{const a=archipelago(d),kept=(a.earthworks??[]).filter(x=>x.id!==w.id);if(kept.length)a.earthworks=kept;else delete a.earthworks;})));
   box.append(row);
  }
  return box;
 }

 function seabed(p:ProjectDocument){
  const box=node('section'),a=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago:undefined,b=a?.bathymetry;
  box.append(node('h3','Fonds marins'));
  if(!a){box.append(node('p','Relief non insulaire : pas de fonds marins auteur.','muted'));return box;}
  if(!b){box.append(node('p','Fond historique (pente unique). Un profil auteur ajoute plateau, tombant et formes sous-marines.','muted'),
   button('Créer un plateau étroit',()=>change('Créer un profil de fonds marins',d=>{archipelago(d).bathymetry={shelfDepthM:12,shelfWidthM:150,dropWidthM:110,features:[]};})),
   button('Créer un plateau large',()=>change('Créer un profil de fonds marins',d=>{archipelago(d).bathymetry={shelfDepthM:9,shelfWidthM:320,dropWidthM:180,features:[]};})));return box;}
  const setProfile=(key:'shelfDepthM'|'shelfWidthM'|'dropWidthM',v:number)=>change('Modifier le profil des fonds',d=>{const x=archipelago(d);x.bathymetry={...x.bathymetry!,[key]:v};});
  box.append(field('Profondeur du plateau (m)',numberInput(b.shelfDepthM,v=>setProfile('shelfDepthM',v),1,a.seabedDepthM,'0.5')),
   field('Largeur du plateau (m)',numberInput(b.shelfWidthM,v=>setProfile('shelfWidthM',v),0,3000,'10')),
   field('Largeur du tombant (m)',numberInput(b.dropWidthM,v=>setProfile('dropWidthM',v),5,2000,'10')));
  for(const f of b.features){
   const row=node('div','','generated-row'),depth='crestDepthM' in f?f.crestDepthM:f.depthM,size='radiusM' in f?f.radiusM:f.widthM;
   const set=(label:string,patch:(x:SeabedFeatureV1)=>void)=>change(label,d=>{const x=archipelago(d),list=x.bathymetry!.features.map(y=>y.id===f.id?(()=>{const c=structuredClone(y);patch(c);return c;})():y);x.bathymetry={...x.bathymetry!,features:list};});
   row.append(node('strong',`${SEABED[f.kind]} · ${f.id}`),
    field('crestDepthM' in f?'Profondeur de crête (m)':'Profondeur (m)',numberInput(depth,v=>set('Modifier une forme sous-marine',x=>{if('crestDepthM' in x)x.crestDepthM=v;else x.depthM=v;}),.3,400,'0.1')),
    field('radiusM' in f?'Rayon (m)':'Largeur (m)',numberInput(size,v=>set('Modifier une forme sous-marine',x=>{if('radiusM' in x)x.radiusM=v;else x.widthM=v;}),4,1500,'1')),
    button('Supprimer',()=>change('Supprimer une forme sous-marine',d=>{const x=archipelago(d);x.bathymetry={...x.bathymetry!,features:x.bathymetry!.features.filter(y=>y.id!==f.id)};})));
   box.append(row);
  }
  const reefs=numberInput(2,()=>{},0,6,'1'),holes=numberInput(1,()=>{},0,4,'1'),trench=node('input');trench.type='checkbox';
  box.append(field('Récifs',reefs),field('Trous bleus',holes),field('Fosse au large',trench),
   // Planning reads the terrain: done inside the transaction on the hydrated draft.
   button('Replanifier les formes (loin du port et du surf)',()=>withBusy('Fonds marins…',async()=>{
   await loadAll();const {planBathymetry}=await import('../studio-core/underwater-planner.ts');
   let notes:string[]=[];
   await session.change('Replanifier les fonds marins',[],d=>{archipelago(d);const shelf=b.shelfWidthM>=250?'wide':'narrow';notes=planBathymetry(d,{shelf,reefs:reefs.valueAsNumber||0,holes:holes.valueAsNumber||0,trench:trench.checked}).diagnostics.map(x=>x.message);});
   status('Fonds replanifiés'+(notes.length?' · '+notes.join(' · '):'')+' · annulable.');
  }).catch(e=>status(String(e),true))),
   button('Revenir au fond historique',()=>change('Retirer le profil des fonds marins',d=>{delete archipelago(d).bathymetry;})));
  return box;
 }

 function dive(p:ProjectDocument){
  const box=node('section'),sites=Object.values(p.libraries.diveSites??{});
  box.append(node('h3','Sites de plongée'),node('p','Entrée en surface, profondeur visée et découvertes (y = profondeur sous la surface, négative).','muted'));
  const put=(label:string,id:string,patch:(s:NonNullable<ProjectDocument['libraries']['diveSites']>[string])=>void)=>change(label,d=>{const s=d.libraries.diveSites?.[id];if(!s)throw Error('Site introuvable');const next=structuredClone(s);patch(next);d.libraries.diveSites={...d.libraries.diveSites,[id]:next};});
  for(const s of sites){
   const row=node('div','','generated-row');
   row.append(field('Nom',input(s.name,v=>put('Renommer un site de plongée',s.id,x=>{x.name=v.trim()||x.name;}))),
    field('Type',select(s.kind,DIVE_SITE_KINDS.map(k=>[k,DIVE[k]] as [string,string]),v=>put('Changer le type d’un site',s.id,x=>{x.kind=v as DiveSiteKind;}))),
    field('Profondeur (m)',numberInput(s.depthM,v=>put('Modifier la profondeur d’un site',s.id,x=>{x.depthM=v;}),1,300,'0.5')),
    field('Entrée X',numberInput(s.entry.x,v=>put('Déplacer l’entrée d’un site',s.id,x=>{x.entry={...x.entry,x:v};}),p.world.bounds.minX,p.world.bounds.maxX,'1')),
    field('Entrée Z',numberInput(s.entry.z,v=>put('Déplacer l’entrée d’un site',s.id,x=>{x.entry={...x.entry,z:v};}),p.world.bounds.minZ,p.world.bounds.maxZ,'1')));
   for(const disc of s.discoveries??[])row.append(field('Découverte',input(disc.name,v=>put('Renommer une découverte',s.id,x=>{const t=x.discoveries?.find(y=>y.id===disc.id);if(t)t.name=v.trim()||t.name;}))),
    button('Retirer « '+disc.name+' »',()=>put('Retirer une découverte',s.id,x=>{x.discoveries=x.discoveries?.filter(y=>y.id!==disc.id);if(!x.discoveries?.length)delete x.discoveries;})));
   row.append(button('Supprimer le site',()=>change('Supprimer un site de plongée',d=>{const next={...d.libraries.diveSites};delete next[s.id];if(Object.keys(next).length)d.libraries.diveSites=next;else delete d.libraries.diveSites;})));
   box.append(row);
  }
  box.append(button('Planifier les sites depuis les fonds',()=>void withBusy('Sites de plongée…',async()=>{
   await loadAll();const {planDiveSites}=await import('../studio-core/underwater-planner.ts');let notes:string[]=[],count=0;
   await session.change('Planifier les sites de plongée',allChunks(session.document),d=>{const r=planDiveSites(d);count=r.sites.length;notes=r.diagnostics.map(x=>x.message);});
   status(`${count} site(s) planifié(s)`+(notes.length?' · '+notes.join(' · '):'')+' · annulable.');
  }).catch(e=>status(String(e),true))));
  return box;
 }

 function render(){
  if(disposed)return;const p=session.document;
  root.replaceChildren(node('h2','Monde généré'),node('p','Retoucher à la main ce que la génération a produit, puis relancer les assistants de cohérence. Les données restent des sources ordinaires du projet.','muted'),
   coherence(),earthworks(p),seabed(p),dive(p));
 }
 render();
 let pending=0;const stop=session.commands.subscribe(()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(render);});
 return ()=>{disposed=true;stop();cancelAnimationFrame(pending);root.remove();};
}
