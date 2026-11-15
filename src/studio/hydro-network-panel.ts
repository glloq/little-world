/** A3 UI: hydrography quality and optional non-destructive endpoint snapping.
 * No automatic waterfall creation: steep stretches are only flagged for review. */
import {button,node} from './dom.ts';
import type {RegionPanelContext} from './regions-panel.ts';
import {projectGeography} from '../studio-core/geo-context.ts';
import {reviewHydroNetwork,planHydroLink} from '../studio-core/hydro-network-assistant.ts';
import {putWater} from '../studio-core/source.ts';
import {waterChunkIds,waterEditChunkIds} from '../water/sectors.ts';
export function mountHydroNetworkPanel(host:HTMLElement,ctx:RegionPanelContext):()=>void{
 const s=ctx.session,p=s.document,card=node('details','','section-card'),results=node('div','','feature-list');
 card.open=true;
 card.append(node('summary','A3 — Contrôle des rivières, lacs et cascades'),
   node('p','Analyser les profils, rechercher les exutoires proches, signaler les fortes pentes. Une connexion n’est créée qu’après vérification complète du réseau.','muted'));
 const safe=(fn:()=>Promise<void>)=>{void fn().catch(e=>ctx.status(e instanceof Error?e.message:String(e),true));};
 const hydrate=async()=>{
   const ids=new Set<string>();
   for(const w of Object.values(p.libraries.water))for(const id of waterChunkIds(p.world,w))if(p.chunkIndex[id])ids.add(id);
   await s.hydrate([...ids]);
 };
 const inspect=async()=>{
   await hydrate();
   const geo=projectGeography(p).ctx,waters=Object.values(p.libraries.water),r=reviewHydroNetwork(waters,geo.height,p.world.seaLevel);
   results.replaceChildren(node('p',waters.length+' étendue(s) d’eau · '+r.diagnostics.length+' diagnostic(s) · '+r.links.length+' raccordement(s) candidat(s) · '+r.falls.length+' pente(s) à vérifier','muted'));
   for(const {id,diagnostic} of r.diagnostics.slice(0,24))results.append(node('p',id+' : '+diagnostic.message,'diagnostic '+diagnostic.severity));
   for(const link of r.links){
     const row=node('div','','feature-row');
     row.append(node('strong','Raccorder '+link.sourceId+' → '+link.targetId),
       node('p',link.distanceM.toFixed(1)+' m · lien vers '+link.targetKind,'muted'),
       button('Voir le raccord',()=>ctx.viewport.goTo(link.snapped.x,link.snapped.z,30)),
       button('Appliquer le raccord',()=>safe(async()=>{
         const current=Object.values(p.libraries.water),source=p.libraries.water[link.sourceId];
         if(!source)throw Error('Rivière source supprimée');
         // Hydration may change terrain: re-validate against live source before committing.
         await hydrate();
         const updated=planHydroLink(current,link,projectGeography(p).ctx.height,p.world.seaLevel),
               ids=waterEditChunkIds(p,source,updated);
         await s.change('Raccorder cours d’eau '+link.sourceId,ids,d=>putWater(d,updated));
         ctx.status('Raccordement créé : '+link.sourceId+' → '+link.targetId);
         await inspect();
       })));
     results.append(row);
   }
   for(const fall of r.falls.slice(0,24)){
     const w=p.libraries.water[fall.riverId],at=w?.points[fall.point-1];
     if(!at)continue;
     results.append(button('Cascade à examiner : '+fall.riverId+' · point '+fall.point+
       ' · chute '+fall.dropM.toFixed(1)+' m',()=>ctx.viewport.goTo(at.x,at.z,24)));
   }
   if(r.falls.length)results.append(node('p','Les cascades proposées sont des diagnostics : régler leurs niveaux dans Eau avant de les créer.','muted'));
 };
 card.append(button('Analyser le réseau hydrologique',()=>safe(inspect)),results);
 host.append(card);
 return ()=>{};
}
