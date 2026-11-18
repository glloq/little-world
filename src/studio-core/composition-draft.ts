import {validateBirthPort} from './birth-port.ts';
import {validateSettlements} from '../settlements/validation.ts';
import {validateTerrainAccess} from './terrain-access.ts';
/** Validate the edited authoring source; never regenerate from its seed on confirmation. */
import type {WorldComposition,CompositionDiagnostic} from './world-composition.ts';
import type {ProjectDocument} from './types.ts';
import {parseProject} from './schema.ts';
import {projectGeography} from './geo-context.ts';
import {compileWaterNetwork} from '../water/profile.ts';
import {naturalQuality} from './world-natural-quality.ts';
import {compositionCoverage} from './world-composition-quality.ts';
import {LANDSCAPES} from './map-requirements.ts';
export {simpleOutline} from '../geography/simple-outline.ts';
import {simpleOutline} from '../geography/simple-outline.ts';

export function validateCompositionDraft(base:WorldComposition,document:ProjectDocument):WorldComposition{
 const started=performance.now(),p=parseProject(structuredClone(document)),r=p.world.generation!,g=projectGeography(p),
  diagnostics:CompositionDiagnostic[]=base.diagnostics.filter(d=>!d.code.startsWith('MARITIME_')&&!d.code.startsWith('WATER_')&&!d.code.startsWith('SITE_')&&d.code!=='DRAFT_BIOMES'&&!['RIVERS_MISSING','TRIBUTARIES_MISSING','LANDSCAPE_MISSING','FALL_NOT_PLANNED','LAKE_NOT_PLANNED','LATERAL_LAKE'].includes(d.code));
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
 diagnostics.push(...validateTerrainAccess(p),...validateBirthPort(p));for(const d of validateSettlements(p))if(d.severity!=='INFO')diagnostics.push({...d,severity:d.severity});
 const coverage=compositionCoverage(p,waters.find(w=>w.to?.kind==='sea')?.points??[]);
 if(coverage.biomeCoverage<.95)diagnostics.push({severity:'WARNING',code:'DRAFT_BIOMES',message:'Des terres modifiées manquent de biomes. Rafraîchir les biomes ou les peindre dans la carte.'});
 return {...base,project:p,ready:!diagnostics.some(d=>d.severity==='ERROR'),diagnostics,metrics:{...base.metrics,features:p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.length:base.metrics.features,generationMs:performance.now()-started,sectors:Object.keys(p.chunks).length,sourceBytes:new TextEncoder().encode(JSON.stringify(p)).length,coverage,...(natural?{natural}:{})}};
}
