import {validateTerrainAccess} from './terrain-access.ts';
/** Validate the edited authoring source; never regenerate from its seed on confirmation. */
import type {WorldComposition,CompositionDiagnostic} from './world-composition.ts';
import type {ProjectDocument} from './types.ts';
import {parseProject} from './schema.ts';
import {projectGeography} from './geo-context.ts';
import {compileWaterNetwork} from '../water/profile.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {naturalQuality} from './world-natural-quality.ts';
import {compositionCoverage} from './world-composition-quality.ts';
import {LANDSCAPES} from './map-requirements.ts';
export function simpleOutline(points:PointXZ[]):boolean{
 const orient=(a:PointXZ,b:PointXZ,c:PointXZ)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const between=(a:number,b:number,c:number,d:number)=>Math.max(Math.min(a,b),Math.min(c,d))<=Math.min(Math.max(a,b),Math.max(c,d))+1e-8;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a.x-b.x,a.z-b.z)<.01)return false;
  for(let j=i+1;j<points.length;j++){
   if(j===i+1||i===0&&j===points.length-1)continue;
   const c=points[j],d=points[(j+1)%points.length];
   if(between(a.x,b.x,c.x,d.x)&&between(a.z,b.z,c.z,d.z)&&orient(a,b,c)*orient(a,b,d)<=0&&orient(c,d,a)*orient(c,d,b)<=0)return false;
  }
 }
 return Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a.x*b.z-b.x*a.z;},0))>1;
}
export function validateCompositionDraft(base:WorldComposition,document:ProjectDocument):WorldComposition{
 const started=performance.now(),p=parseProject(structuredClone(document)),r=p.world.generation!,g=projectGeography(p),
  diagnostics:CompositionDiagnostic[]=base.diagnostics.filter(d=>!d.code.startsWith('WATER_')&&!d.code.startsWith('SITE_')&&d.code!=='DRAFT_BIOMES'&&!['RIVERS_MISSING','TRIBUTARIES_MISSING','LANDSCAPE_MISSING','FALL_NOT_PLANNED','LAKE_NOT_PLANNED','LATERAL_LAKE'].includes(d.code));
 if(p.world.terrain?.kind==='archipelago'){
  for(const land of p.world.terrain.archipelago.landmasses)if(!simpleOutline(land.outline))diagnostics.push({severity:'ERROR',code:'DRAFT_OUTLINE',message:'Contour croisé ou dégénéré : '+land.name});
  for(const f of p.world.terrain.archipelago.features)if(f.kind==='plateau'&&!simpleOutline(f.polygon))diagnostics.push({severity:'ERROR',code:'DRAFT_OUTLINE',message:'Plateau croisé ou dégénéré : '+f.id});
 }
 const waters=Object.values(p.libraries.water),network=compileWaterNetwork(waters,g.source,p.world.seaLevel);
 for(const w of network)for(const d of w.diagnostics)diagnostics.push({...d,severity:d.code==='WATER_LOCAL_RISE'?'ERROR':d.severity});
 const severity=(r.compositionVersion??1)>=4&&r.islandStyle?.hydrology==='preferred'?'WARNING':'ERROR';
 for(const [kind,count,code,label]of [['sea',r.rivers,'RIVERS_MISSING','rivière(s) vers la mer'],['river',r.tributaries,'TRIBUTARIES_MISSING','affluent(s) raccordé(s)']] as const){const n=waters.filter(w=>w.to?.kind===kind).length;if(n<count)diagnostics.push({severity,code,message:`${n}/${count} ${label} dans le brouillon.`});}
 const quality=naturalQuality(p),natural=(r.compositionVersion??1)>=4?quality:undefined;
 if((r.lakes||r.landscapes.some(l=>l.kind==='lake'))&&!waters.some(w=>w.kind==='lake'))diagnostics.push({severity:r.landscapes.some(l=>l.kind==='lake'&&l.required)?'ERROR':'WARNING',code:'LAKE_NOT_PLANNED',message:'Aucun lac validé dans le brouillon.'});
 if(r.waterfalls&&!waters.some(w=>w.falls?.length))diagnostics.push({severity:'WARNING',code:'FALL_NOT_PLANNED',message:'Aucune cascade dans le brouillon.'});
 for(const l of r.landscapes)if(l.kind!=='lake'&&(quality.biomeShare[l.kind]??0)<.001)diagnostics.push({severity:l.required?'ERROR':'WARNING',code:'LANDSCAPE_MISSING',message:'Surface insuffisante : '+LANDSCAPES[l.kind]});
 const sites=Object.values(p.libraries.terrainPlans??{}).flatMap(p=>p.sites);if(r.layout){for(const [kind,count,label]of [['harbor',r.layout.harbor?1:0,'port'],['farm',r.layout.farms,'champ'],['lake',r.layout.lake?1:0,'lac']] as const){const actual=sites.filter(s=>s.kind===kind).length;if(actual<count)diagnostics.push({severity:'WARNING',code:'SITE_MISSING',message:`${actual}/${count} emplacement(s) ${label} dans le brouillon.`});}}
 diagnostics.push(...validateTerrainAccess(p));
 const coverage=compositionCoverage(p,waters.find(w=>w.to?.kind==='sea')?.points??[]);
 if(coverage.biomeCoverage<.95)diagnostics.push({severity:'WARNING',code:'DRAFT_BIOMES',message:'Des terres modifiées manquent de biomes. Rafraîchir les biomes ou les peindre dans la carte.'});
 return {...base,project:p,ready:!diagnostics.some(d=>d.severity==='ERROR'),diagnostics,metrics:{...base.metrics,features:p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.length:base.metrics.features,generationMs:performance.now()-started,sectors:Object.keys(p.chunks).length,sourceBytes:new TextEncoder().encode(JSON.stringify(p)).length,coverage,...(natural?{natural}:{})}};
}
