/** World Production V1 — Studio module « Paysages » (WP-4): choose a preset, position it on the
 * shared 3D view (footprint drawn on the relief), set size / orientation / main parameters,
 * preview (dry run with counts and diagnostics), apply as ONE undoable transaction, regenerate
 * locally or remove. Manual corrections win: conflicts are listed and overwriting them needs
 * an explicit confirmation. Same session, history and selection as every other module. */
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import {LANDSCAPE_PRESETS,LANDSCAPE_PRESET_LIST,frameOf,normalizeParams} from '../world-production/landscape-presets.ts';
import {applyLandscape,removeLandscape,newLandscape,previewLandscape,landscapeChunkIds,type LandscapeReport} from '../world-production/landscapes.ts';
import type {LandscapeInstanceV1,LandscapePresetId} from '../world-production/landscape-schema.ts';

export interface LandscapePanelContext {session:StudioSession;viewport:StudioViewport;status(text:string,error?:boolean):void}
const summary=(r:LandscapeReport)=>`${r.added} ajout(s), ${r.updated} mise(s) à jour, ${r.removed} retrait(s), ${r.maskCells.painted} cellule(s) de masque`+(r.maskCells.protected?`, ${r.maskCells.protected} cellule(s) protégée(s)`:'')+(r.conflicts.length?`, ${r.conflicts.length} retouche(s) manuelle(s) conservée(s)`:'')+(r.respectedDeletions.length?`, ${r.respectedDeletions.length} suppression(s) respectée(s)`:'');
export function mountLandscapesPanel(host:HTMLElement,ctx:LandscapePanelContext):()=>void{
  const s=ctx.session,v=ctx.viewport;
  let editing:LandscapeInstanceV1|null=null,presetId:LandscapePresetId='forest-valley';
  let draft=newLandscape(s.document,presetId,{x:v.camera.target.x,z:v.camera.target.z});
  const form=node('div','','landscape-form'),result=node('div','','landscape-report'),list=node('div','','feature-list');
  const footprint=()=>{const f=frameOf(draft),w=draft.width/2,l=draft.length/2;v.showFootprint([f.toWorld(-w,-l),f.toWorld(w,-l),f.toWorld(w,l),f.toWorld(-w,l)],editing?0xd98b3d:0x3d8bd9);};
  const set=(patch:Partial<LandscapeInstanceV1>)=>{draft={...draft,...patch,params:normalizeParams(draft.presetId,{...draft.params,...(patch.params??{})})};footprint();};
  function renderForm(){
    const preset=LANDSCAPE_PRESETS[draft.presetId];form.replaceChildren();
    const presetSelect=select(draft.presetId,LANDSCAPE_PRESET_LIST.map(p=>[p.id,p.label] as [string,string]),value=>{presetId=value as LandscapePresetId;draft=newLandscape(s.document,presetId,draft.center,{rotation:draft.rotation});editing=null;renderForm();footprint();});
    presetSelect.disabled=!!editing;presetSelect.dataset.role='preset';
    form.append(field('Preset',presetSelect),node('p',preset.description,'muted'),node('p','Produit : '+preset.produces.join(' · '),'muted'),
      field('Nom',input(draft.name,val=>set({name:val.slice(0,100)||draft.name}))),
      field('Centre X (m)',numberInput(draft.center.x,val=>set({center:{...draft.center,x:Math.round(val)}}),s.document.world.bounds.minX,s.document.world.bounds.maxX)),
      field('Centre Z (m)',numberInput(draft.center.z,val=>set({center:{...draft.center,z:Math.round(val)}}),s.document.world.bounds.minZ,s.document.world.bounds.maxZ)),
      button('Centrer sur la vue',()=>{set({center:{x:Math.round(v.camera.target.x),z:Math.round(v.camera.target.z)}});renderForm();}),
      field('Largeur (m)',numberInput(draft.width,val=>set({width:Math.max(40,Math.min(3000,val||draft.width))}),40,3000)),
      field('Longueur (m)',numberInput(draft.length,val=>set({length:Math.max(40,Math.min(3000,val||draft.length))}),40,3000)),
      field('Orientation (°)',numberInput(Math.round(draft.rotation*180/Math.PI),val=>set({rotation:((val||0)%360)*Math.PI/180}),-360,360,'5')),
      field('Graine',numberInput(draft.seed,val=>set({seed:Math.max(0,Math.min(0xffffffff,Math.round(val)||0))}),0,4294967295,'1')));
    for(const d of preset.params){
      if(d.kind==='boolean'){const box=node('input');box.type='checkbox';box.checked=draft.params[d.key]===true;box.onchange=()=>set({params:{[d.key]:box.checked}});form.append(field(d.label,box));}
      else form.append(field(d.label,numberInput(draft.params[d.key] as number,val=>set({params:{[d.key]:val}}),d.min,d.max,String(d.step??'any'))));
    }
    const overwrite=node('input');overwrite.type='checkbox';overwrite.dataset.role='overwrite';
    form.append(field('Écraser mes retouches manuelles (confirmation demandée)',overwrite),
      button('Prévisualiser',()=>void run(async()=>{await s.hydrate(landscapeChunkIds(s.document,draft));const r=previewLandscape(s.document,draft,{overwrite:overwrite.checked});show(r,'Aperçu (rien n’est modifié)');})),
      button(editing?'Régénérer avec ces réglages':'Appliquer le paysage',()=>void run(async()=>{
        if(overwrite.checked&&!confirm('Écraser les retouches manuelles de ce paysage ? Les objets, tracés et cellules modifiés à la main seront remplacés (Annuler reste possible).'))return;
        const ids=landscapeChunkIds(s.document,draft);let report:LandscapeReport|null=null;
        await s.change(`Paysage : ${draft.name}`,ids,d=>{report=applyLandscape(d,draft,{overwrite:overwrite.checked});});
        show(report!,'Appliqué (une opération annulable)');editing=s.document.libraries.landscapes?.[draft.id]??null;if(editing)draft=structuredClone(editing);renderList();renderForm();
      }),'primary-button'),
      ...(editing?[button('Nouveau paysage',()=>{editing=null;draft=newLandscape(s.document,presetId,draft.center);renderForm();footprint();})]:[]));
  }
  function show(r:LandscapeReport,title:string){
    result.replaceChildren(node('strong',title),node('p',summary(r)));
    for(const c of r.conflicts.slice(0,8))result.append(node('p',`✋ ${c.kind} ${c.id} modifié à la main : conservé`,'muted'));
    for(const d of r.diagnostics)result.append(node('p','⚠ '+d,'muted'));
    result.dataset.added=String(r.added);result.dataset.conflicts=String(r.conflicts.length);ctx.status(title+' : '+summary(r));
  }
  function renderList(){
    list.replaceChildren(node('h4','Paysages du projet'));const all=Object.values(s.document.libraries.landscapes??{});
    if(!all.length)list.append(node('p','Aucun paysage. Choisissez un preset, placez son emprise, puis appliquez.','muted'));
    for(const l of all){
      const g=l.generated,n=g?Object.values(g.entities).length+Object.values(g.water).length+Object.values(g.paths).length+Object.values(g.features).length:0;
      const row=node('div','','feature-row');row.dataset.landscape=l.id;
      row.append(node('strong',`${l.name} · ${LANDSCAPE_PRESETS[l.presetId].label}`),node('p',`${Math.round(l.width)} × ${Math.round(l.length)} m · ${n} élément(s) générés · révision ${g?.revision??0}`,'muted'),
        button('Voir',()=>{v.goTo(l.center.x,l.center.z,Math.max(l.width,l.length)*.6);}),
        button('Modifier',()=>{editing=l;draft=structuredClone(l);presetId=l.presetId;renderForm();footprint();v.goTo(l.center.x,l.center.z,Math.max(l.width,l.length)*.6);}),
        button('Régénérer',()=>void run(async()=>{let r:LandscapeReport|null=null;await s.change(`Régénérer : ${l.name}`,landscapeChunkIds(s.document,l),d=>{r=applyLandscape(d,l);});show(r!,'Régénéré localement');renderList();})),
        button('Supprimer',()=>void run(async()=>{if(!confirm(`Supprimer « ${l.name} » ? Le contenu modifié à la main est conservé.`))return;let r:LandscapeReport|null=null;await s.change(`Supprimer le paysage ${l.name}`,landscapeChunkIds(s.document,l),d=>{r=removeLandscape(d,l.id);});show(r!,'Paysage supprimé');if(editing?.id===l.id){editing=null;draft=newLandscape(s.document,presetId,draft.center);renderForm();}renderList();})));
      list.append(row);
    }
  }
  async function run(fn:()=>Promise<void>){try{await fn();}catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}}
  host.append(node('div','PAYSAGES','kicker'),node('h3','Presets de paysages'),node('p','Un preset écrit des données auteur rééditables (relief, masques, eau, chemins, objets du registre, zones) et une région d’habillage ; la végétation reste générée. Vos retouches manuelles priment toujours.','muted'),form,result,list);
  renderForm();renderList();footprint();
  const stop=s.commands.subscribe(()=>renderList());
  return ()=>{stop();v.showFootprint(null);};
}
