import {alignNaturalBiomes,naturalRegions} from './world-biomes-v4.ts';
import {defaultFarmSettings} from '../farm/farm-data.ts';
import {putZone,removeZone} from './zones.ts';
/** Atomic edits of a reservation and its native terrain/water supports. */
import type {ProjectDocument} from './types.ts';
import {parseArchipelago} from '../geography/archipelago-params.ts';
import {compilePolygon,featureBounds,polylineDistance} from '../geography/archipelago.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {putWater,removeWater,removePath} from './source.ts';
import {terrainAccessContext,regenerateTerrainAccess} from './terrain-access.ts';
export interface SiteEdit {dx?:number;dz?:number;heightM?:number;edgeM?:number;locked?:boolean;entry?:{x:number;z:number};shore?:{x:number;z:number}}
export function editTerrainSite(p:ProjectDocument,id:string,edit:SiteEdit):void{
 const original=Object.values(p.libraries.terrainPlans??{}).flatMap(p=>p.sites).find(s=>s.id===id);if(!original)throw Error('Zone utile absente');
 if(original.locked&&!(Object.keys(edit).length===1&&edit.locked===false))throw Error('Zone verrouillée : la déverrouiller avant modification.');
 if(Object.values(edit).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Valeur de zone invalide');
 if(p.world.terrain?.kind!=='archipelago')throw Error('Relief natif absent');
 p.libraries.terrainPlans=structuredClone(p.libraries.terrainPlans!);const site=Object.values(p.libraries.terrainPlans).flatMap(p=>p.sites).find(s=>s.id===id)!;
 p.world.terrain=structuredClone(p.world.terrain);const terrain=p.world.terrain.archipelago,feature=terrain.features.find(f=>f.id===site.featureId);
 if(feature?.kind!=='plateau')throw Error('Plateforme absente');const oldBox=featureBounds(feature),delta=edit.heightM===undefined?0:edit.heightM-feature.heightM,dx=edit.dx??0,dz=edit.dz??0;
 for(const id of [site.featureId,...site.supportFeatureIds??[]]){
  const f=terrain.features.find(f=>f.id===id);if(f?.kind!=='plateau')throw Error('Support de zone invalide');
  f.polygon=f.polygon.map(q=>({x:q.x+dx,z:q.z+dz}));f.heightM+=delta;if(edit.edgeM!==undefined)f.edgeM=edit.edgeM;
 }
 site.entry={...site.entry,x:site.entry.x+dx,z:site.entry.z+dz,...edit.entry};
 if(site.shore)site.shore={x:site.shore.x+dx,z:site.shore.z+dz,...edit.shore};
 if(site.waterId){const old=p.libraries.water[site.waterId];if(!old)throw Error('Eau de la zone absente');putWater(p,{...old,points:old.points.map(q=>({x:q.x+dx,z:q.z+dz})),level:old.level+delta});}
 if(site.farmZoneId&&(dx||dz)){const zone=p.libraries.zones?.[site.farmZoneId];if(!zone)throw Error('Parcelle absente');putZone(p,{...zone,polygon:zone.polygon.map(q=>({x:q.x+dx,z:q.z+dz})),...(zone.farm?{farm:{...zone.farm,irrigation:zone.farm.irrigation?{x:zone.farm.irrigation.x+dx,z:zone.farm.irrigation.z+dz}:null}}:{})});}
 if(edit.locked!==undefined)site.locked=edit.locked;
 parseArchipelago(terrain,{width:p.world.bounds.maxX-p.world.bounds.minX,length:p.world.bounds.maxZ-p.world.bounds.minZ});
 if(dx||dz||delta||edit.edgeM!==undefined)refreshBiomes(p,[oldBox,featureBounds(feature)]);
}
export function recenterTerrainEntry(p:ProjectDocument,id:string):void{
 const site=Object.values(p.libraries.terrainPlans??{}).flatMap(p=>p.sites).find(s=>s.id===id),f=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.id===site?.featureId):undefined;
 if(!site||f?.kind!=='plateau')throw Error('Zone absente');
 const c=terrainAccessContext(p),center={x:f.polygon.reduce((v,q)=>v+q.x,0)/f.polygon.length,z:f.polygon.reduce((v,q)=>v+q.z,0)/f.polygon.length},inside=compilePolygon(f.polygon),points=[center,...f.polygon.flatMap(q=>[.5,.8,.92].map(t=>({x:center.x+(q.x-center.x)*t,z:center.z+(q.z-center.z)*t})))];
 const entry=points.find(q=>inside(q.x,q.z)>1&&!c.wet(q.x,q.z)&&c.height(q.x,q.z)>p.world.seaLevel+1);if(!entry)throw Error('Aucune entrée sèche dans la plateforme');editTerrainSite(p,id,{entry});
}
const sourceHash=(p:ProjectDocument)=>fingerprint({...p,manifest:{...p.manifest,revision:0}});
export function previewTerrainAccess(p:ProjectDocument){
 const project=structuredClone(p),beforeHash=sourceHash(p),diagnostics=regenerateTerrainAccess(project);
 return {project,beforeHash,diagnostics,chunks:[...new Set([...Object.keys(p.chunks),...Object.keys(project.chunks)])]};
}
export function applyTerrainAccess(p:ProjectDocument,preview:ReturnType<typeof previewTerrainAccess>):void{
 if(sourceHash(p)!==preview.beforeHash)throw Error('Le brouillon a changé : recalculer la proposition d’accès.');
 const next=structuredClone(preview.project);p.libraries=next.libraries;p.chunks=next.chunks;p.chunkIndex=next.chunkIndex;
}
/** Session-level guard: locks protect geometry and linked water, including other tools. */
export function assertTerrainSiteLocks(before:ProjectDocument,after:ProjectDocument):void{
 const oldSites=Object.values(before.libraries.terrainPlans??{}).flatMap(p=>p.sites),newSites=Object.values(after.libraries.terrainPlans??{}).flatMap(p=>p.sites);
 for(const site of oldSites){const next=newSites.find(s=>s.id===site.id);if(next&&(after.world.terrain?.kind!=='archipelago'||!after.world.terrain.archipelago.features.some(f=>f.id===next.featureId)))throw Error('Supprimer la zone depuis Zones utiles et accès, avec ses supports.');}
 for(const site of oldSites.filter(s=>s.locked)){
  const next=newSites.find(s=>s.id===site.id);if(next&&!next.locked)continue;
  if(!next||fingerprint(site)!==fingerprint(next))throw Error(site.name+' verrouillé : modification refusée.');
  const old=before.world.terrain,updated=after.world.terrain;
  if(old?.kind!=='archipelago'||updated?.kind!=='archipelago')throw Error('Relief d’une zone verrouillée remplacé.');
  for(const id of [site.featureId,...site.supportFeatureIds??[]])if(fingerprint(old.archipelago.features.find(f=>f.id===id))!==fingerprint(updated.archipelago.features.find(f=>f.id===id)))throw Error(site.name+' : géométrie verrouillée.');
  if(site.farmZoneId&&fingerprint(before.libraries.zones?.[site.farmZoneId]?.polygon)!==fingerprint(after.libraries.zones?.[site.farmZoneId]?.polygon))throw Error(site.name+' : parcelle verrouillée.');
  if(site.waterId&&fingerprint(before.libraries.water[site.waterId])!==fingerprint(after.libraries.water[site.waterId]))throw Error(site.name+' : eau verrouillée.');
  const f=old.archipelago.features.find(f=>f.id===site.featureId);if(f?.kind!=='plateau')continue;
  const box=featureBounds(f),overlap=(v:ReturnType<typeof featureBounds>)=>v.minX<=box.maxX&&v.maxX>=box.minX&&v.minZ<=box.maxZ&&v.maxZ>=box.minZ;
  for(const other of updated.archipelago.features)if(![site.featureId,...site.supportFeatureIds??[]].includes(other.id)&&overlap(featureBounds(other))&&fingerprint(old.archipelago.features.find(f=>f.id===other.id))!==fingerprint(other))throw Error(site.name+' : autre relief dans une zone verrouillée.');
  const orient=(a:{x:number;z:number},b:{x:number;z:number},c:{x:number;z:number})=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  for(const water of Object.values(after.libraries.water))if(fingerprint(water)!==fingerprint(before.libraries.water[water.id])){
   const polygon=compilePolygon(f.polygon),closed=water.kind==='lake',waterInside=closed?compilePolygon(water.points):null;
   let touches=water.points.some(q=>polygon(q.x,q.z)>=-water.width/2)||!!waterInside&&f.polygon.some(q=>waterInside(q.x,q.z)>=0)||f.polygon.some(q=>polylineDistance(water.points,q.x,q.z)<=water.width/2);
   for(let i=1;i<water.points.length+(closed?1:0)&&!touches;i++)for(let j=0;j<f.polygon.length&&!touches;j++){
    const a=water.points[i-1],b=water.points[i%water.points.length],c=f.polygon[j],d=f.polygon[(j+1)%f.polygon.length];
    if(Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z))&&orient(a,b,c)*orient(a,b,d)<=0&&orient(c,d,a)*orient(c,d,b)<=0)touches=true;
   }
   if(touches)throw Error(site.name+' : cours d’eau ou lac dans une zone verrouillée.');
  }
  const inside=compilePolygon(f.polygon),edits=(p:ProjectDocument)=>new Map(Object.values(p.chunks).flatMap(c=>c.terrainEdits).map(e=>[e.id,e])),a=edits(before),b=edits(after);
  for(const id of new Set([...a.keys(),...b.keys()])){const e=b.get(id)??a.get(id)!;if(inside(e.x,e.z)>=-e.radius&&fingerprint(a.get(id))!==fingerprint(b.get(id)))throw Error(site.name+' : retouche de terrain dans une zone verrouillée.');}
  if(fingerprint(old.archipelago.landmasses)!==fingerprint(updated.archipelago.landmasses)){
   const oldField=terrainAccessContext(before),newField=terrainAccessContext(after);
   for(const q of [site.entry,...f.polygon])if(Math.abs(oldField.height(q.x,q.z)-newField.height(q.x,q.z))>.05)throw Error(site.name+' : modification du littoral affectant une zone verrouillée.');
  }
 }
}

/** Remove the group while retaining paths that were taken over by the author. */
export function removeTerrainSite(p:ProjectDocument,id:string):void{
 const plans=structuredClone(p.libraries.terrainPlans??{}),plan=Object.values(plans).find(q=>q.sites.some(s=>s.id===id)),site=plan?.sites.find(s=>s.id===id);if(!site||!plan)return;
 if(site.locked)throw Error('Déverrouiller la zone avant suppression.');
 if(site.waterId&&Object.values(p.libraries.water).some(w=>w.id!==site.waterId&&((w.to?.kind!=='sea'&&w.to?.id===site.waterId)||(w.from?.kind!=='sea'&&w.from?.id===site.waterId))))throw Error('Déconnecter les cours d’eau raccordés au lac avant suppression.');
 const featureIds=new Set([site.featureId,...site.supportFeatureIds??[]]),oldFeature=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.id===site.featureId):undefined,rects=oldFeature?[featureBounds(oldFeature)]:[];
 if(p.world.terrain?.kind==='archipelago')p.world.terrain={...p.world.terrain,archipelago:{...p.world.terrain.archipelago,features:p.world.terrain.archipelago.features.filter(f=>!featureIds.has(f.id))}};
 if(site.waterId)removeWater(p,site.waterId);if(site.farmZoneId)removeZone(p,site.farmZoneId);
 for(const edge of plan.access.filter(e=>e.from===id||e.to===id))if(edge.pathId&&edge.generatedPathHash===fingerprint(p.libraries.paths[edge.pathId]))removePath(p,edge.pathId);
 plan.sites=plan.sites.filter(s=>s.id!==id);plan.access=plan.access.filter(e=>e.from!==id&&e.to!==id);p.libraries.terrainPlans=plans;if(!plan.sites.length)delete plans[plan.id];refreshBiomes(p,rects);
}

function refreshBiomes(p:ProjectDocument,rects:ReturnType<typeof featureBounds>[]){
 if((p.world.generation?.compositionVersion??1)<4)return;
 const source=(v:unknown)=>{const {generated:_,...rest}=v as Record<string,unknown>;return rest;},expected=new Map(naturalRegions(p).map(r=>[r.id,r])),skip=new Set(Object.values(p.libraries.regions??{}).filter(r=>!expected.has(r.id)||fingerprint(source(r))!==fingerprint(source(expected.get(r.id)))).map(r=>r.id));
 p.libraries.regions=structuredClone(p.libraries.regions??{});alignNaturalBiomes(p,skip,rects);
}
/** Explicit conversion to the existing AGRI source; no building or settlement generation. */
export function cultivateTerrainSite(p:ProjectDocument,id:string):void{
 const site=Object.values(p.libraries.terrainPlans??{}).flatMap(p=>p.sites).find(s=>s.id===id),f=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.id===site?.featureId):undefined;
 if(!site||site.kind!=='farm'||f?.kind!=='plateau')throw Error('Choisir un replat agricole');if(site.locked)throw Error('Déverrouiller le replat pour créer ou recaler la parcelle');
 const zoneId=site.farmZoneId??site.id+'-plot';if(!site.farmZoneId&&p.libraries.zones?.[zoneId])throw Error('Identifiant de parcelle déjà utilisé');
 const center={x:f.polygon.reduce((v,q)=>v+q.x,0)/f.polygon.length,z:f.polygon.reduce((v,q)=>v+q.z,0)/f.polygon.length},polygon=f.polygon.map(q=>({x:center.x+(q.x-center.x)*.85,z:center.z+(q.z-center.z)*.85})),old=p.libraries.zones?.[zoneId];
 p.libraries.terrainPlans=structuredClone(p.libraries.terrainPlans!);const updated=Object.values(p.libraries.terrainPlans).flatMap(p=>p.sites).find(s=>s.id===id)!;updated.farmZoneId=zoneId;
 putZone(p,{id:zoneId,kind:'farm-plot',name:site.name,polygon,farm:old?.farm??{...defaultFarmSettings(polygon),initialCrop:'wheat',rowAngle:site.entry.heading}});refreshBiomes(p,[featureBounds(f)]);
}
