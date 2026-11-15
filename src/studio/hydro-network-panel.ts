/** A3 UI: hydrography quality and optional non-destructive endpoint snapping.
 * No automatic waterfall creation: steep stretches are only flagged for review. */
import {button,node} from './dom.ts';
import type {RegionPanelContext} from './regions-panel.ts';
import {projectGeography} from '../studio-core/geo-context.ts';
import {reviewHydroNetwork,planHydroLink,planHydroFall,planHydroFalls} from '../studio-core/hydro-network-assistant.ts';
import {putWater} from '../studio-core/source.ts';
import {analyzeWatersheds} from '../studio-core/watershed-analysis.ts';
import {proposeWatershedRivers} from '../studio-core/watershed-rivers.ts';
import {planGuidedRiver} from '../studio-core/guided-river.ts';
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
     const row=node('div','','feature-row');
     row.append(button('Voir cascade : '+fall.riverId+' · point '+fall.point+
       ' · chute '+fall.dropM.toFixed(1)+' m',()=>ctx.viewport.goTo(at.x,at.z,24)),
       button('Créer la cascade',()=>safe(async()=>{
         await hydrate();
         const fresh=Object.values(p.libraries.water),original=p.libraries.water[fall.riverId];
         if(!original)throw Error('Rivière introuvable');
         const geo=projectGeography(p).ctx;
         const updated=planHydroFall(fresh,fall,geo.height,p.world.seaLevel);
         const ids=waterEditChunkIds(p,original,updated);
         await s.change('Cascade '+fall.riverId+' au point '+fall.point,ids,d=>putWater(d,updated));
         ctx.status('Cascade créée et validée : '+fall.riverId);
         await inspect();
       })));
     results.append(row);
   }
   if(r.falls.length)results.append(node('p','Les cascades sont des propositions : chaque création est refusée si la validation du réseau échoue.','muted'));
 };
 const basins=node('div','','feature-list');
 const inspectBasins=async()=>{
   const geo=projectGeography(p).ctx;
   const result=analyzeWatersheds(p.world.bounds,geo.height,p.world.seaLevel,{maxCells:4096,minAreaM2:1000});
   basins.replaceChildren(node('p',result.sampled+' échantillons · pas '+result.stepM.toFixed(1)+' m · '+result.basins.length+' exutoires principaux','muted'));
   for(const b of result.basins.slice(0,12)){
     basins.append(button((b.areaM2/10000).toFixed(1)+' ha · '+(b.kind==='pit'?'cuvette':b.kind==='sea'?'mer':'bord de carte'),
       ()=>ctx.viewport.goTo(b.outlet.x,b.outlet.z,70)));
   }
   for(const warning of result.warnings)basins.append(node('p',warning,'muted'));
 };
 // A4 — Drainage suggestions are dry-run proposals until an explicit user action.
 const headwaters=node('div','','feature-list');
 const inspectHeadwaters=async()=>{
   await hydrate();
   const bounds=p.world.bounds,geo=projectGeography(p).ctx;
   const analysis=analyzeWatersheds(bounds,geo.height,p.world.seaLevel,{maxCells:2048});
   const context=()=>{const live=projectGeography(p).ctx;return {
     height:live.height,water:(x:number,z:number)=>live.water(x,z,live.height(x,z)),
     inWorld:(x:number,z:number)=>x>bounds.minX+1&&x<bounds.maxX-1&&z>bounds.minZ+1&&z<bounds.maxZ-1,
     seaLevel:p.world.seaLevel,existing:Object.values(p.libraries.water)};};
   const plans=proposeWatershedRivers(analysis.headwaters,context(),{maxRivers:3,maxLengthM:2000,
     idPrefix:'watershed-'+p.world.worldId.slice(0,8)+'-'});
   headwaters.replaceChildren(node('p',analysis.headwaters.length+' sources analysées · '+plans.proposals.length+
     ' rivière(s) validée(s) · '+plans.rejected.length+' proposition(s) écartée(s)','muted'));
   headwaters.append(node('p','Prévisualisation sans écriture : les sources proviennent du drainage D8. Les retouches de terrain non chargées peuvent modifier les propositions. Chaque création réévalue le relief et le réseau.','muted'));
   for(const {source,plan} of plans.proposals){
     const row=node('div','','feature-row'),points=plan.water.points;
     row.append(node('strong','Rivière proposée · '+Math.round(plan.trace.lengthM)+' m'),
       node('p','Bassin amont '+(source.upstreamAreaM2/10000).toFixed(1)+' ha · dénivelé '+plan.trace.drop.toFixed(1)+' m · '+plan.trace.end,'muted'),
       button('Voir en 3D',()=>{ctx.viewport.showPreviewPolyline(points);ctx.viewport.goTo(source.source.x,source.source.z,90);}),
       button('Créer cette rivière',()=>safe(async()=>{
         if(p.libraries.water[plan.water.id])throw Error('Cours d’eau déjà créé : relancer les propositions');
         await s.hydrate(waterChunkIds(p.world,plan.water));
         const fresh=planGuidedRiver(source.source,source.toward,context(),{
           id:plan.water.id,width:plan.water.width,depth:plan.water.depth,maxLengthM:2000});
         // Do not commit a different river from the one the author previewed.
         if(JSON.stringify(fresh.water)!==JSON.stringify(plan.water))
           throw Error('Le terrain ou le réseau a changé : relancer la prévisualisation');
         await s.change('Créer rivière de bassin versant',waterChunkIds(p.world,fresh.water),
           draft=>putWater(draft,fresh.water));
         ctx.viewport.showPreviewPolyline(null);
         ctx.status('Rivière du bassin versant créée : '+Math.round(fresh.trace.lengthM)+' m.');
         await inspectHeadwaters();
       })));
     headwaters.append(row);
   }
   for(const rejected of plans.rejected.slice(0,4))
     headwaters.append(node('p','Candidat écarté : '+rejected.reason,'muted'));
 };

 const waterfalls=node('div','','feature-list');
 const proposeFalls=async()=>{
   await hydrate();
   const geo=projectGeography(p).ctx,waters=Object.values(p.libraries.water);
   const candidates=reviewHydroNetwork(waters,geo.height,p.world.seaLevel).falls;
   const proposed=planHydroFalls(waters,candidates,geo.height,p.world.seaLevel,6);
   const count=proposed.changes.reduce((n,w)=>n+(w.falls?.length??0)-(p.libraries.water[w.id]?.falls?.length??0),0);
   waterfalls.replaceChildren(node('p',count+' cascade(s) proposées sur '+proposed.changes.length+
     ' rivière(s), '+proposed.rejected.length+' refusée(s) par la validation','muted'));
   if(count<=0){waterfalls.append(node('p','Aucun emplacement applicable automatiquement. Adapter les profils ou placer les cascades manuellement.','muted'));return;}
   for(const w of proposed.changes){
     const previous=p.libraries.water[w.id],old=new Set((previous?.falls??[]).map(f=>f.at));
     for(const fall of w.falls??[])if(!old.has(fall.at)){
       const pt=w.points[fall.at];
       if(pt)waterfalls.append(button('Voir · '+w.id+' · chute '+(fall.top-fall.bottom).toFixed(1)+' m',
         ()=>ctx.viewport.goTo(pt.x,pt.z,30)));
     }
   }
   waterfalls.append(button('Appliquer les cascades proposées',()=>safe(async()=>{
     await hydrate();
     const freshGeo=projectGeography(p).ctx,freshWaters=Object.values(p.libraries.water);
     const freshAdvice=reviewHydroNetwork(freshWaters,freshGeo.height,p.world.seaLevel).falls;
     const fresh=planHydroFalls(freshWaters,freshAdvice,freshGeo.height,p.world.seaLevel,6);
     if(JSON.stringify(fresh.changes)!==JSON.stringify(proposed.changes))
       throw Error('Les profils ont changé : relancer l’aperçu des cascades');
     if(!confirm('Créer '+count+' cascade(s) sur '+fresh.changes.length+' rivière(s) dans une transaction annulable ?'))return;
     const ids=[...new Set(fresh.changes.flatMap(w=>waterEditChunkIds(p,p.libraries.water[w.id],w)))];
     await s.change('Créer '+count+' cascades automatiques',ids,d=>{for(const w of fresh.changes)putWater(d,w);});
     ctx.status(count+' cascade(s) créées et validées dans le réseau.');
     await proposeFalls();
   })));
 };

 card.append(button('Analyser le réseau hydrologique',()=>safe(inspect)),results,
   button('Analyser les bassins versants',()=>safe(inspectBasins)),basins,
   button('Proposer des rivières depuis les bassins versants',()=>safe(inspectHeadwaters)),headwaters,
   button('Proposer des cascades automatiques',()=>safe(proposeFalls)),waterfalls);
 host.append(card);
 return ()=>ctx.viewport.showPreviewPolyline(null);
}
