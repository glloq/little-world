import {fingerprint} from '../world-production/landscape-schema.ts';
/** Resolve reservation anchors into one connected set of native paths when possible. */
import {WaterSpatialIndex,compileWaterNetwork} from '../water/profile.ts';
import {generatorField} from '../terrain-generator.ts';
import {projectGeography} from './geo-context.ts';
import {planGroundRoute,inspectGroundSegment,type GroundRouteContext} from '../paths/terrain-route.ts';
import {putPath,removePath} from './source.ts';
import type {ProjectDocument} from './types.ts';
import type {SiteDiagnostic} from './terrain-site-planner.ts';
import {compilePolygon} from '../geography/archipelago.ts';
export function terrainAccessContext(p:ProjectDocument):GroundRouteContext&{source:(x:number,z:number)=>number}{
 const geo=projectGeography(p),height=geo.ctx.height,index=new WaterSpatialIndex(Object.values(p.libraries.water),geo.source,p.world.seaLevel);
 return {bounds:p.world.bounds,height,source:geo.source,wet:(x,z)=>index.query(x,z).length>0,seaLevel:p.world.seaLevel};
}
export function planTerrainAccess(p:ProjectDocument):SiteDiagnostic[]{
 const r=p.world.generation,layout=r?.layout;if(r?.compositionVersion!==5||!layout?.connect)return [];
 const c=terrainAccessContext(p),diagnostics:SiteDiagnostic[]=[];
 for(const plan of Object.values(p.libraries.terrainPlans??{})){
  const sites=plan.sites;if(sites.length<2)continue;plan.access=[];
  const connected=[sites[0]],pending=sites.slice(1);
  while(pending.length){
   const choices=pending.flatMap(site=>connected.map(from=>({site,from,distance:Math.hypot(site.entry.x-from.entry.x,site.entry.z-from.entry.z)}))).sort((a,b)=>a.distance-b.distance||a.site.id.localeCompare(b.site.id)||a.from.id.localeCompare(b.from.id));
   let attached=false;
   for(const {site,from}of choices){
    const route=planGroundRoute(from.entry,site.entry,c,{maxSlope:layout.maxSlope,widthM:3});
    if(!route.points.length)continue;
    const baseId='composition-access-'+site.id.slice('composition-site-'.length);let pathId=baseId,variant=0;while(p.libraries.paths[pathId])pathId=baseId+'-alt-'+(++variant);const id=pathId+'-edge';
    putPath(p,{id:pathId,points:route.points,width:3,kind:'trail',smooth:false});
    plan.access.push({id,from:from.id,to:site.id,pathId,generatedPathHash:fingerprint(p.libraries.paths[pathId]),mode:'foot',maxSlope:layout.maxSlope,clearWidthM:3});
    connected.push(site);pending.splice(pending.indexOf(site),1);attached=true;break;
   }
   if(!attached){for(const site of pending){plan.access.push({id:'composition-unlinked-'+site.id.slice('composition-site-'.length),from:connected[0].id,to:site.id,mode:'foot',maxSlope:layout.maxSlope,clearWidthM:3});diagnostics.push({severity:layout.accessRequired?'ERROR':'WARNING',code:'SITE_ACCESS_MISSING',message:site.name+' : aucun accès sec respectant la pente. Ajuster le talus ou déplacer la zone.'});}break;}
  }
 }
 return diagnostics;
}
/** Validation is derived from final terrain and water, including author edits. */
export function validateTerrainAccess(p:ProjectDocument):SiteDiagnostic[]{
 const plans=Object.values(p.libraries.terrainPlans??{});if(!plans.length)return [];
 const c=terrainAccessContext(p),r=p.world.generation,diagnostics:SiteDiagnostic[]=[],field=p.world.terrain?generatorField(p.world.terrain,{width:p.world.bounds.maxX-p.world.bounds.minX,length:p.world.bounds.maxZ-p.world.bounds.minZ,seed:p.world.seed,seaLevel:p.world.seaLevel},()=>0):null;
 for(const plan of plans){
  for(const site of plan.sites){
   const feature=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.id===site.featureId):undefined;
   if(!feature||feature.kind!=='plateau'){diagnostics.push({severity:'ERROR',code:'SITE_PLATFORM_MISSING',message:site.name+' : plateforme absente.'});continue;}
   const inside=compilePolygon(feature.polygon);
   if(inside(site.entry.x,site.entry.z)<0||c.height(site.entry.x,site.entry.z)<p.world.seaLevel+1)diagnostics.push({severity:'ERROR',code:'SITE_ENTRY_INVALID',message:site.name+' : entrée hors plateforme ou sous l’eau.'});
   if(site.kind!=='lake'){let incompatible=false;for(const q of feature.polygon.map(q=>({x:site.entry.x+(q.x-site.entry.x)*.6,z:site.entry.z+(q.z-site.entry.z)*.6}))){const h=c.height(q.x,q.z),slope=Math.hypot(c.height(q.x+2,q.z)-c.height(q.x-2,q.z),c.height(q.x,q.z+2)-c.height(q.x,q.z-2))/4;if(c.wet(q.x,q.z)||h<1||slope>(site.kind==='farm'?.12:.25))incompatible=true;}if(incompatible)diagnostics.push({severity:'WARNING',code:'SITE_USE_INVALID',targetId:site.id,message:site.name+' : sol humide ou pente incompatible avec l’usage prévu.'});}
   if(site.waterId){const water=p.libraries.water[site.waterId];if(water&&compileWaterNetwork([water],c.source,p.world.seaLevel)[0].diagnostics.some(d=>d.code==='LAKE_SPILL'))diagnostics.push({severity:'ERROR',code:'SITE_LAKE_BERMS',targetId:site.id,message:'Berges du lac ouvertes : déplacer le bassin ou rétablir ses supports.'});}
   if(site.farmZoneId){const zone=p.libraries.zones?.[site.farmZoneId];if(zone?.polygon.some(q=>inside(q.x,q.z)<0))diagnostics.push({severity:'WARNING',code:'SITE_FARM_OUTSIDE',targetId:site.id,message:'La parcelle agricole dépasse le replat : la recaler ou modifier sa forme.'});}
   if(site.kind==='harbor'&&(!site.shore||c.height(site.shore.x,site.shore.z)>p.world.seaLevel-3||(field?.coast(site.shore.x,site.shore.z)??1)>=0))diagnostics.push({severity:'WARNING',code:'SITE_HARBOR_APPROACH',message:'L’approche maritime du port doit être réexaminée.'});
  }
  for(const edge of plan.access){
   const path=edge.pathId?p.libraries.paths[edge.pathId]:undefined,a=plan.sites.find(s=>s.id===edge.from)!,b=plan.sites.find(s=>s.id===edge.to)!;
   let valid=!!path;
   if(path){valid&&=Math.hypot(path.points[0].x-a.entry.x,path.points[0].z-a.entry.z)<1&&Math.hypot(path.points.at(-1)!.x-b.entry.x,path.points.at(-1)!.z-b.entry.z)<1;
    for(let i=1;i<path.points.length&&valid;i++)valid=inspectGroundSegment(path.points[i-1],path.points[i],c,{maxSlope:edge.maxSlope,widthM:edge.clearWidthM}).valid;}
   if(!valid)diagnostics.push({severity:r?.layout?.accessRequired?'ERROR':'WARNING',code:'SITE_ACCESS_INVALID',targetId:edge.pathId??edge.id,message:'Accès '+a.name+' → '+b.name+' impraticable ou non raccordé. Le tracé est conservé pour correction.'});
  }
 }
 return diagnostics;
}
/** Explicit regeneration: paths changed by hand are protected; site geometry stays unchanged. */
export function regenerateTerrainAccess(p:ProjectDocument):SiteDiagnostic[]{
 for(const plan of Object.values(p.libraries.terrainPlans??{}))for(const edge of plan.access)if(edge.pathId&&(!edge.generatedPathHash||fingerprint(p.libraries.paths[edge.pathId])!==edge.generatedPathHash))throw Error('Chemin retouché ou supprimé : recalcul automatique protégé.');
 for(const plan of Object.values(p.libraries.terrainPlans??{}))for(const edge of plan.access)if(edge.pathId)removePath(p,edge.pathId);
 return planTerrainAccess(p);
}
