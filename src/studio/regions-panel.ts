/** Guided A/B regional authoring, using the existing 3D polygon tool, masks,
 * V3 transaction history and landscape relief generator. No second scene/model. */
import {node,button,field,input,numberInput,select} from './dom.ts';
import * as THREE from 'three';
import {projectGeography} from '../studio-core/geo-context.ts';
import {planGuidedRiver} from '../studio-core/guided-river.ts';
import {putWater} from '../studio-core/source.ts';
import {waterChunkIds} from '../water/sectors.ts';

import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {REGION_PRESETS,newRegion,previewRegion,applyRegion,removeRegion,validateRegionRecipe,
  regionAffectedChunks,type RegionPreset,type RegionRecipeV1,type RegionReport} from '../studio-core/region-recipes.ts';

export interface RegionPanelContext {
  session:StudioSession;viewport:StudioViewport;
  status(text:string,error?:boolean):void;edit(target:PolylineTarget):void;
  open(module:string):void;
}
const summarize=(r:RegionReport)=>r.painted+' cellules peintes · '+r.cleared+' précédentes rétablies · '+r.protected+' protégées · '+r.preserved+' retouches manuelles conservées'
 +(r.warnings.length?' · '+r.warnings.join(' ; '):'');
const presetChoices=Object.entries(REGION_PRESETS).map(([id,p])=>[id,p.label] as [string,string]);
export function mountRegionsPanel(host:HTMLElement,ctx:RegionPanelContext):()=>void{
 const p=ctx.session.document,v=ctx.viewport,s=ctx.session;
 const summary=node('div','','section-card'),list=node('div','','feature-list');
 let draft=newRegion(p),editing:string|null=null;
 const commit=async(region:RegionRecipeV1)=>{
   const ids=regionAffectedChunks(p,region),old=p.libraries.regions?.[region.id];
   if(old&&!old.generated)throw Error('Ancienne région sans données de génération');
   let report:RegionReport|null=null;
   await s.change('Région '+region.name,ids,d=>{report=applyRegion(d,region);});
   ctx.status('Région appliquée : '+summarize(report!));
   draft=structuredClone(p.libraries.regions![region.id]);editing=region.id;renderList();
 };
 const edit=(item:RegionRecipeV1|null)=>{
   const region=structuredClone(item??draft);
   const target:PolylineTarget={label:'Région : '+region.name,points:region.points.map(x=>({...x})),min:3,max:48,closed:true,color:0x58a86f,
     diagnose(points){
       if(points.length<3)return null;
       try{validateRegionRecipe({...region,points,generated:undefined},p.world.bounds);return null;}
       catch(e){return e instanceof Error?e.message:String(e);}
     },
     controls(tools,refresh){
       const set=(value:Partial<RegionRecipeV1>)=>{Object.assign(region,value);refresh();};
       tools.append(node('h4','A — Contour et relief'),node('p','Tracez un polygone et glissez les poignées. Le plateau optionnel s’ajoute au générateur d’archipel.','muted'),
         field('Nom de la région',input(region.name,val=>set({name:val}))),
         field('Relief de région',select(region.relief,[['none','Conserver le relief'],['plateau','Plateau à altitude constante']],x=>set({relief:x as RegionRecipeV1['relief']}))),
         field('Altitude du plateau (m)',numberInput(region.heightM,x=>set({heightM:x}),0,1200,'5')),
         field('Transition du plateau (m)',numberInput(region.edgeM,x=>set({edgeM:x}),2,300,'5')),
         node('h4','B — Recette écologique'),
         field('Biotope',select(region.preset,presetChoices,x=>set({preset:x as RegionPreset}))),
         field('Couverture du masque (%)',numberInput(region.coverage,x=>set({coverage:x}),0,100,'5')),
         field('Transition écologique (m)',numberInput(region.transitionM,x=>set({transitionM:x}),0,150,'5')),
         field('Graine déterministe',numberInput(region.seed,x=>set({seed:Math.round(x)}),0,4294967295,'1')),
         node('p','La couverture détermine la proportion de cellules corrigées ; la densité fine et les espèces restent gérées par les biotopes existants. Les masques manuels ne sont pas écrasés.','muted'));
     },
     async commit(points){await commit({...region,points:points.map(x=>({...x})),generated:undefined});},
   };
   // Do not use a special editor: reuse existing 3D polyline with snapping and Undo/Redo.
   ctx.edit(target);
 };
 /** A — two-point source + preferred direction; actual route follows downhill. */
 function riverTarget():PolylineTarget{
   const options={id:'river-guided-'+crypto.randomUUID(),width:6,depth:2,maxLengthM:1200};
   const plan=(points:{x:number;z:number}[])=>{
     const geo=projectGeography(p).ctx,b=p.world.bounds;
     return planGuidedRiver(points[0],points[1],{
       height:geo.height,water:(x,z)=>geo.water(x,z,geo.height(x,z)),
       inWorld:(x,z)=>x>b.minX+1&&x<b.maxX-1&&z>b.minZ+1&&z<b.maxZ-1,
       seaLevel:p.world.seaLevel,existing:Object.values(p.libraries.water)
     },options);
   };
   return {label:'Cours d’eau guidé par la pente',points:[],min:2,max:2,color:0x398cc8,
     diagnose(points){if(points.length<2)return null;
       return Math.hypot(points[1].x-points[0].x,points[1].z-points[0].z)<3?'Indiquer une direction à plus de 3 mètres de la source':null;
     },
     preview(points){
       if(points.length<2)return null;
       const {water}=plan(points),geo=projectGeography(p).ctx;
       const verts=water.points.map(q=>new THREE.Vector3(q.x,geo.height(q.x,q.z)+1,q.z));
       const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(verts),
         new THREE.LineBasicMaterial({color:0x298bc4,depthTest:false,transparent:true,opacity:.8}));
       const group=new THREE.Group();group.name='Cours d’eau proposé';group.add(line);return group;
     },
     controls(tools,refresh){
       tools.append(node('h4','A — Rivière automatique'),
         node('p','1. Cliquer sur la source · 2. Cliquer dans la direction de l’aval. Le moteur trace la descente, cherche un lac ou une rivière réceptrice et valide le réseau.','muted'),
         field('Largeur (m)',numberInput(options.width,x=>{options.width=x;refresh();},1,40,'1')),
         field('Profondeur (m)',numberInput(options.depth,x=>{options.depth=x;refresh();},.5,20,'.5')),
         field('Distance maximale (m)',numberInput(options.maxLengthM,x=>{options.maxLengthM=x;refresh();},40,4000,'50')),
         node('p','Aucune rivière n’est enregistrée si les contrôles hydrologiques signalent une erreur. Les cascades complexes et les lacs se règlent dans Eau.','muted'));
     },
     async commit(points){
       let suggested=plan(points);
       await s.hydrate(waterChunkIds(p.world,suggested.water));
       suggested=plan(points);
       const ids=waterChunkIds(p.world,suggested.water);
       await s.change('Tracer rivière guidée',ids,d=>putWater(d,suggested.water));
       s.selection.select({kind:'water',id:suggested.water.id});
       ctx.status('Rivière '+Math.round(suggested.trace.lengthM)+' m · '+suggested.trace.end+
         (suggested.warnings.length?' · '+suggested.warnings.join(' ; '):'')+' · éditable dans Eau.');
     }
   };
 }
 const choose=(r:RegionRecipeV1)=>{draft=structuredClone(r);editing=r.id;v.showFootprint(r.points,0x56aa86);};
 const newDraft=()=>{draft=newRegion(p);editing=null;v.showFootprint(null);renderForm();};
 function renderForm(){
   summary.replaceChildren(node('h4','Créer une région depuis zéro'),
     node('p','Une région est une surface polygonale rééditable : relief (plateau facultatif) + biotope procédural, sans poser chaque arbre.','muted'),
     button('Dessiner une nouvelle région',()=>{newDraft();edit(null);},'primary-button'),
     node('p','Les formes montagneuses, crêtes, vallées et falaises restent modifiables sur la carte globale. Les paysages existants peuvent se combiner avec ces régions.','muted'),
     button('Ouvrir la carte des reliefs',()=>ctx.open('map')),
     button('Tracer une rivière automatique',()=>ctx.edit(riverTarget())),
     button('Gérer les rivières et lacs',()=>ctx.open('water')));
 }
 const safe=(cb:()=>Promise<void>)=>{void cb().catch(e=>ctx.status(e instanceof Error?e.message:String(e),true));};
 function renderList(){
   list.replaceChildren(node('h4','Régions de la carte'));
   const regions=Object.values(p.libraries.regions??{}).sort((a,b)=>a.name.localeCompare(b.name));
   if(!regions.length)list.append(node('p','Aucune région. Créez un premier contour en vue 3D.','muted'));
   for(const region of regions){
     const row=node('div','','feature-row');
     const template=REGION_PRESETS[region.preset],x=region.points.reduce((sum,q)=>sum+q.x,0)/region.points.length,z=region.points.reduce((sum,q)=>sum+q.z,0)/region.points.length;
     row.append(node('strong',region.name),node('p',template.label+' · '+region.points.length+' sommets · version '+(region.generated?.revision??0),'muted'),
       button('Voir',()=>{choose(region);v.goTo(x,z,100);}),
       button('Modifier',()=>{choose(region);edit(region);}),
       button('Prévisualiser',()=>safe(async()=>{
         await s.hydrate(regionAffectedChunks(p,region));const report=previewRegion(p,region);
         ctx.status('Aperçu '+region.name+' : '+report.cells+' corrections proposées sur '+report.sectors+' secteurs ; '+report.protected+' cellules déjà protégées.');
         v.showFootprint(region.points,0x3d8bd9);
       })),
       button('Régénérer',()=>safe(async()=>{await commit(region);})),
       button('Supprimer',()=>safe(async()=>{
         if(!confirm('Supprimer la recette '+region.name+' ? Les corrections manuelles seront conservées.'))return;
         const chunks=regionAffectedChunks(p,region);let report:RegionReport|null=null;
         await s.change('Supprimer région '+region.name,chunks,d=>{report=removeRegion(d,region.id);});
         ctx.status('Région supprimée : '+summarize(report!));if(editing===region.id)newDraft();renderList();
       })));
     list.append(row);
   }
 }
 host.append(summary,list);renderForm();renderList();
 const stop=s.commands.subscribe(()=>renderList());
 return ()=>{stop();v.showFootprint(null);};
}
