/** A persisted authoring draft using the existing 2D and WATER editors, without runtime. */
import {StudioSession} from './session.ts';
import {compositionDraftStore} from './composition-draft-store.ts';
export {compositionDraftStore} from './composition-draft-store.ts';
import {mountGeoMap,releaseGeoMap} from './geo-map/editor.ts';
import {mountWater} from './water-view.ts';
import {validateCompositionDraft} from '../studio-core/composition-draft.ts';
import {previewWorldRecomposition,applyWorldRecomposition} from '../studio-core/world-recomposition.ts';
import type {WorldComposition} from '../studio-core/world-composition.ts';
import {node,button} from './dom.ts';
export async function editCompositionDraft(base:WorldComposition,resumeId?:string):Promise<WorldComposition|null>{
 const existing=resumeId??(await compositionDraftStore.list()).find(p=>p.projectId===base.project.manifest.projectId)?.projectId;
 const session=existing?await StudioSession.open(compositionDraftStore,existing):new StudioSession(compositionDraftStore,await compositionDraftStore.create(structuredClone(base.project)));
 await session.fullDocument();
 return new Promise(resolve=>{
  const dialog=node('dialog','','composition-draft-dialog'),header=node('div','','welcome-between'),toolbar=node('div','','draft-toolbar'),workspace=node('div','','draft-workspace'),map=node('div','','draft-map'),tools=node('aside','','draft-tools'),messages=node('div'),status=node('p','','muted'),footer=node('div','','draft-toolbar');
  dialog.setAttribute('aria-label','Retoucher le brouillon 2D');header.append(node('h2','Brouillon 2D · avant création'));
  workspace.append(map,tools);let disposeView=()=>{},timer:ReturnType<typeof setTimeout>|undefined,closed=false,working=false,pendingWater=false;
  const apply=button('Valider le plan',()=>void close(true),'primary-button'),undo=button('Annuler la retouche',()=>session.commands.undo()),redo=button('Rétablir la retouche',()=>session.commands.redo());
  function validate(){
   try{const plan=validateCompositionDraft(base,session.document);messages.replaceChildren(...plan.diagnostics.map(d=>node('p',d.message,'diagnostic '+d.severity)));apply.disabled=!plan.ready||working||pendingWater;}
   catch(e){apply.disabled=true;messages.replaceChildren(node('p',String(e),'diagnostic ERROR'));}
   undo.disabled=!session.commands.canUndo;redo.disabled=!session.commands.canRedo;
  }
  function view(kind:'map'|'water'){
   if(pendingWater){status.textContent='Appliquer ou abandonner le tracé d’eau avant de changer de vue.';return;}
   disposeView();tools.replaceChildren();map.replaceChildren();
   if(kind==='map'){const editor=mountGeoMap(map,tools,session,{draft:true,onPick:()=>{},open3D:()=>{status.textContent='La vue 3D sera disponible après création.';},status:message=>{status.textContent=message;}});disposeView=()=>editor.dispose();}
   else {const editor=mountWater(map,tools,session,{onPending:pending=>{pendingWater=pending;discardWater.hidden=!pending;apply.disabled=pending;clearTimeout(timer);timer=setTimeout(validate,180);}});disposeView=()=>editor.dispose();}
  }
  async function close(use:boolean){
   if(working||closed)return;if(pendingWater){status.textContent='Appliquer ou abandonner le tracé d’eau avant de fermer.';return;}working=true;apply.disabled=true;
   try{
    const plan=use?validateCompositionDraft(base,session.document):null;if(plan&&!plan.ready){working=false;validate();return;}
    dialog.inert=true;await session.flush();closed=true;clearTimeout(timer);stop();stopStatus();disposeView();releaseGeoMap();dialog.close();dialog.remove();resolve(plan);
   }catch(e){dialog.inert=false;working=false;status.textContent=String(e);validate();}
  }
  const discardWater=button('Abandonner le tracé non appliqué',()=>{pendingWater=false;discardWater.hidden=true;view('water');validate();});discardWater.hidden=true;
  toolbar.append(discardWater,button('Côte, relief et zones',()=>view('map')),button('Rivières et lacs',()=>view('water')),undo,redo,
   button('Rafraîchir les biomes',async()=>{
    if(working||pendingWater)return;working=true;apply.disabled=true;
    try{const p=session.document,preview=previewWorldRecomposition(p,p.world.generation!,'biomes');await session.change('Rafraîchir les biomes du brouillon',preview.chunks,d=>applyWorldRecomposition(d,preview));status.textContent='Biomes rafraîchis ; retouches conservées.';}catch(e){status.textContent=String(e);}finally{working=false;validate();}
   }));
  footer.append(button('Fermer et garder le brouillon',()=>void close(false)),apply);
  dialog.append(header,node('p','Choisir le calque Altitude puis Formes pour les poignées de côte et de relief. Les modifications sont enregistrées séparément des projets.','muted'),toolbar,workspace,messages,status,footer);
  const stop=session.commands.subscribe(()=>{apply.disabled=true;clearTimeout(timer);timer=setTimeout(validate,180);}),stopStatus=session.subscribe(()=>{status.textContent=session.status;});
  dialog.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)){e.preventDefault();e.stopPropagation();if(e.shiftKey)session.commands.redo();else session.commands.undo();}});
  dialog.addEventListener('cancel',e=>{e.preventDefault();void close(false);});
  document.body.append(dialog);dialog.showModal();view('map');validate();
 });
}
