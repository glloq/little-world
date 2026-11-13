import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import {elementData,elementLabel,elementAnchor,updateElement,updateChunkIds,ELEMENT_KINDS,type ElementRef,type ElementPatch} from '../studio-core/elements.ts';
import type {PathDefinition,WaterBody,TerrainStroke,BiomeStroke} from '../world-data.ts';
import type {ActivityZoneV3} from '../studio-core/types.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {ZONE_KINDS} from '../studio-core/zones.ts';
import {activitySection,levelCountPatch} from './activity-inspector.ts';
import {terrainHeight} from '../terrain.ts';
import {riverWithPoints,pathTarget,PATH_ENV} from './world-features.ts';
import {pathDiagnostics} from '../paths/path-geometry.ts';
import {editQueue} from './inspector.ts';

/** E7 — inspector of non-entity authoring elements: properties of the selected type, point
 * editing in the 3D view, lock, duplication and deletion. Every change = one transaction. */
export interface ElementInspectorContext {
  session:StudioSession;status(text:string,error?:boolean):void;refresh():void;focus():void;duplicate():void;remove():void;
  editPath(target:PolylineTarget):void;view(x:number,z:number):void;open(module:string):void;
  /** Extra section contributed by a lot (path profile diagnostics, …). */
  extras?(ref:ElementRef,host:HTMLElement):void;
}
export const PATH_KIND_LABELS:[string,string][]=[['trail','Sentier naturel'],['dirt','Chemin de terre'],['stone','Chemin de pierre / pavé'],['wood','Passage en bois']];
export function lockToggle(s:StudioSession,id:string,refresh:()=>void){
  const locked=s.selection.isLocked(id),b=button(locked?'Déverrouiller':'Verrouiller',()=>{s.selection.setLocked(id,!locked);refresh();});b.setAttribute('aria-pressed',String(locked));b.title='Un élément verrouillé ne peut être ni déplacé ni supprimé';return b;
}
export function renderElementInspector(host:HTMLElement,ref:ElementRef,ctx:ElementInspectorContext){
  const s=ctx.session,p=s.document,data=elementData(p,ref);
  if(!data){host.append(node('p','Élément introuvable (secteur non chargé ou supprimé).','muted'));return;}
  const apply=(label:string,patch:ElementPatch)=>void editQueue.run(async()=>{await s.change(label,updateChunkIds(p,ref,patch),d=>updateElement(d,ref,patch));ctx.refresh();}).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));
  const locked=s.selection.isLocked(ref.id);
  host.append(node('h3',elementLabel(p,ref)),node('p',`${ELEMENT_KINDS[ref.kind]} · ${ref.id}${locked?' · verrouillé':''}`,'selection-tag'));
  const box=node('fieldset');box.disabled=locked;
  if(ref.kind==='path'){
    const path=data as PathDefinition;
    box.append(node('legend','Chemin'),field('Type de chemin',select(path.kind??'dirt',PATH_KIND_LABELS,v=>apply('Type de chemin',{kind:v}))),
      field('Largeur (m)',numberInput(path.width,v=>apply('Largeur du chemin',{width:Math.max(1,Math.min(40,v))}),1,40)));
    const smooth=node('input');smooth.type='checkbox';smooth.checked=!!path.smooth;smooth.onchange=()=>apply(smooth.checked?'Courber le chemin':'Chemin à segments droits',{smooth:smooth.checked});box.append(field('Courbes adoucies',smooth));
    box.append(node('p',`${path.points.length} points`,'muted'),button('Éditer les points',()=>ctx.editPath(pathTarget(s,'Chemin',path,async next=>{const patch={points:next.points};await s.change('Modifier un chemin',updateChunkIds(p,ref,patch),d=>updateElement(d,ref,patch));})),'primary-button'));
    const issues=pathDiagnostics(Object.values(p.libraries.paths),PATH_ENV).filter(d=>d.pathId===path.id),diag=node('div','','path-diagnostics');diag.dataset.count=String(issues.length);
    for(const d of issues){const b=button((d.severity==='ERROR'?'⛔ ':'⚠ ')+d.message,()=>ctx.view(d.x,d.z),'diagnostic '+d.severity);diag.append(b);}
    if(!issues.length)diag.append(node('p','Aucun problème de pente ni de raccord.','muted'));box.append(diag);
  }else if(ref.kind==='water'){
    const water=data as WaterBody;
    box.append(node('legend','Rivière'),field('Largeur (m)',numberInput(water.width,v=>apply('Largeur de la rivière',{width:Math.max(1,Math.min(40,v))}),1,40)),field('Profondeur (m)',numberInput(water.depth,v=>apply('Profondeur de la rivière',{depth:Math.max(.5,Math.min(20,v))}),.5,20)),
      node('p',`Profil : ${water.profile?.mode==='manual'?'niveaux manuels':'suit le relief'} · ${water.points.length} points`,'muted'),
      button('Éditer les points',()=>ctx.editPath({label:'Rivière',points:water.points,min:2,max:100,color:0x4fa3d1,commit:async points=>{const next=riverWithPoints(water,points),patch={points:next.points,...(next.profile?{profile:next.profile}:{})};await s.change('Modifier une rivière',updateChunkIds(p,ref,patch),d=>updateElement(d,ref,patch));}}),'primary-button'),
      button('Profil détaillé (panneau Eau)',()=>ctx.open('water')));
  }else if(ref.kind==='zone'){
    const zone=data as ActivityZoneV3;
    box.append(node('legend',ZONE_KINDS[zone.kind]),field('Nom de la zone',input(zone.name,v=>{if(v.trim())apply('Renommer une zone',{name:v.trim()});})));
    if(zone.kind==='mine')box.append(field('Niveaux',numberInput(zone.levels??1,v=>apply('Niveaux de la mine',levelCountPatch(zone,v)),1,8,'1')));
    box.append(activitySection(zone,(label,patch)=>apply(label,patch),terrainHeight,ctx.status));
    box.append(button('Éditer le contour',()=>ctx.editPath({label:'Contour : '+zone.name,points:zone.polygon,min:3,max:64,closed:true,color:zone.kind==='mine'?0x8a5a3c:0xd9a520,commit:async points=>{await s.change('Modifier une zone',[],d=>updateElement(d,ref,{polygon:points}));}}),'primary-button'));
  }else if(ref.kind==='terrainEdit'){
    const e=data as TerrainStroke;
    box.append(node('legend','Retouche de relief'),field('Mode',select(e.mode,[['raise','Élever'],['lower','Abaisser'],['flatten','Aplanir'],['smooth','Lisser']],v=>apply('Mode de la retouche',{mode:v}))),
      field('Rayon (m)',numberInput(e.radius,v=>apply('Rayon de la retouche',{radius:Math.max(1,Math.min(200,v))}),1,200)),field('Force',numberInput(e.strength,v=>apply('Force de la retouche',{strength:v}),0,50)),
      field('Hauteur cible (m)',numberInput(e.height,v=>apply('Hauteur de la retouche',{height:v}),-200,600)),
      field('X (m)',numberInput(e.x,v=>apply('Déplacer la retouche',{x:v}))),field('Z (m)',numberInput(e.z,v=>apply('Déplacer la retouche',{z:v}))));
  }else if(ref.kind==='biomeEdit'){
    const e=data as BiomeStroke;
    box.append(node('legend','Retouche de biotope'),field('Biotope',select(e.biome,[['forest','Forêt'],['meadow','Prairie'],['mountain','Montagne'],['coast','Littoral'],['village','Village']],v=>apply('Biotope de la retouche',{biome:v}))),
      field('Rayon (m)',numberInput(e.radius,v=>apply('Rayon de la retouche',{radius:Math.max(1,Math.min(200,v))}),1,200)),field('Densité',numberInput(e.density,v=>apply('Densité de la retouche',{density:Math.max(0,Math.min(2,v))}),0,2)));
  }
  host.append(box);ctx.extras?.(ref,host);
  const anchor=elementAnchor(p,ref),actions=node('div','','row');
  actions.append(button('Centrer (F)',ctx.focus),...(anchor?[button('Voir en 3D',()=>ctx.view(anchor.x,anchor.z))]:[]),button('Dupliquer',ctx.duplicate),button('Supprimer',ctx.remove),lockToggle(s,ref.id,ctx.refresh));
  host.append(actions,node('p','Glisser le gizmo (W) déplace l’élément entier ; « Éditer les points » modifie son tracé.','muted'));
}
