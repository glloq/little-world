/** A2 Studio UI: edit heightfield-native ridges, cliff-like scarps and passes
 * through the existing PolylineTool, CommandBus and terrain generator. */
import * as THREE from 'three';
import {button,field,node,numberInput} from './dom.ts';
import type {RegionPanelContext} from './regions-panel.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {projectGeography} from '../studio-core/geo-context.ts';
import {RELIEF_LINE_DEFAULTS,newReliefLine,reliefLineFromFeature,validateReliefLine,
  isAuthoredReliefLine,upsertReliefLine,removeReliefLine,type ReliefLineDraft,type ReliefLinePreset} from '../studio-core/relief-lines.ts';
export function mountReliefLinesPanel(host:HTMLElement,ctx:RegionPanelContext):()=>void {
 const p=ctx.session.document,s=ctx.session,v=ctx.viewport;
 const card=node('details','','section-card'),list=node('div','','feature-list');card.open=true;
 card.append(node('summary','A2 — Reliefs linéaires en 3D'),
   node('p','Tracer une crête, une falaise rocheuse, une vallée ou un col. Les falaises ajoutent des faces rocheuses low-poly locales avec LOD, sur le relief heightfield natif.','muted'));
 function open(draft:ReliefLineDraft){
   let height=projectGeography(p).ctx.height;
   const target:PolylineTarget={label:RELIEF_LINE_DEFAULTS[draft.preset].label,points:draft.points,min:2,max:32,color:draft.preset==='valley'||draft.preset==='pass'?0x46a4ca:0xb59a57,
     diagnose(pts){
       if(pts.length<2)return null;
       try{validateReliefLine(p.world,{...draft,points:pts});return null;}
       catch(e){return e instanceof Error?e.message:String(e);}
     },
     preview(pts){
       const pts3=pts.map(q=>new THREE.Vector3(q.x,height(q.x,q.z)+1.5,q.z));
       const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3),new THREE.LineBasicMaterial({color:0xe7b756,depthTest:false}));
       const g=new THREE.Group();g.name='Relief proposé';g.add(mesh);return g;
     },
     controls(h,refresh){
       const defaults=RELIEF_LINE_DEFAULTS[draft.preset];
       h.append(node('h4','A2 — '+defaults.label),node('p',defaults.help,'muted'),
        field('Largeur de la forme (m)',numberInput(draft.widthM,x=>{draft.widthM=x;refresh();},5,2000,'1')),
        field(draft.preset==='valley'||draft.preset==='pass'?'Profondeur (m)':'Hauteur (m)',
          numberInput(draft.amountM,x=>{draft.amountM=x;refresh();},(draft.preset==='valley'||draft.preset==='pass')?.5:1,(draft.preset==='valley'||draft.preset==='pass')?400:800,'1')),
        node('p','Échap : abandonner · Entrée : enregistrer · poignées déplaçables. Les parois suivent la collision du terrain ; pour un vrai tunnel ou surplomb, utiliser Structures naturelles.','muted'));
     },
     async commit(pts){
       const next={...draft,points:pts.map(q=>({...q}))};
       await s.change('Relief '+RELIEF_LINE_DEFAULTS[draft.preset].label,[],d=>upsertReliefLine(d,next));
       height=projectGeography(p).ctx.height;
       ctx.status('Relief enregistré : '+pts.length+' sommets, forme rééditable dans Régions.');
     }
   };
   ctx.edit(target);
 }
 const tools=node('div','','chip-row');
 for(const preset of Object.keys(RELIEF_LINE_DEFAULTS) as ReliefLinePreset[]){
   const choice=RELIEF_LINE_DEFAULTS[preset];
   tools.append(button(choice.label,()=>open(newReliefLine(preset)),'chip'));
 }
 card.append(tools,list);
 function renderList(){
   list.replaceChildren(node('h4','Reliefs tracés en 3D'));
   const forms=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.filter(isAuthoredReliefLine):[];
   if(!forms.length)list.append(node('p','Aucune forme linéaire créée avec cet outil.','muted'));
   for(const f of forms){
     const r=reliefLineFromFeature(f),name=RELIEF_LINE_DEFAULTS[r.preset].label;
     const center=r.points[Math.floor(r.points.length/2)];
     const row=node('div','','feature-row');row.append(node('strong',name),node('p',r.widthM+' m · '+r.amountM+' m · '+r.points.length+' points','muted'),
       button('Voir',()=>v.goTo(center.x,center.z,Math.max(30,r.widthM))),
       button('Modifier',()=>open(r)),
       button('Supprimer',()=>{void (async()=>{
         if(!confirm('Supprimer '+name+' ? (Annuler reste disponible)'))return;
         await s.change('Supprimer relief '+name,[],d=>removeReliefLine(d,f.id));
         ctx.status('Relief supprimé.');renderList();
       })().catch(e=>ctx.status(String(e),true));}));
     list.append(row);
   }
 }
 host.append(card);renderList();
 const stop=s.commands.subscribe(renderList);
 return ()=>stop();
}
