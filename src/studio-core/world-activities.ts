/** Optional activities use the same native planners and data as the specialized Studio editors. */
import catalog from '../../public/audio/catalog.json' with {type:'json'};
import {parseAudioDefinitionV2} from '../audio/catalog.ts';
import {findDemoPiste} from '../snow/snow-pistes.ts';
import {inspectSkiArea,skiCorridorContains,type SkiAreaV1} from '../snow/ski-area.ts';
import {projectRaceTerrainEnvironment,skiAreaTerrainEnvironment} from './race-terrain-context.ts';
import {findRaceTerrainPlacements,raceFromTerrainPlacement,inspectRaceTerrain} from './race-terrain-planner.ts';
import {putAuthoredRace} from './race-authoring.ts';
import type {ProjectDocument} from './types.ts';
import {planFlightCourse,planSurfActivity} from './activity-planners.ts';
import {authoredPortLayout} from '../archipelago/port-n1-plan.ts';
import type {CompositionDiagnostic} from './world-composition.ts';
export function generateWorldActivities(p:ProjectDocument,diagnostics:CompositionDiagnostic[]){
 const options=p.world.generation?.activities;if(!options)return;
 const audio=parseAudioDefinitionV2(catalog);if(options.music==='off')audio.music.cues={};p.world.audio=audio;
 const b=p.world.bounds;
 if(options.ski){
  const env=projectRaceTerrainEnvironment(p),mx=(b.minX+b.maxX)/2,mz=(b.minZ+b.maxZ)/2;
  const regions=[b,{...b,maxX:mx,maxZ:mz},{...b,minX:mx,maxZ:mz},{...b,maxX:mx,minZ:mz},{...b,minX:mx,minZ:mz}];
  for(const bounds of regions){const points=findDemoPiste(env.height,bounds,p.world.seaLevel);if(!points)continue;
   const area:SkiAreaV1={version:1,id:'composition-alpine',name:'Descente alpine · prototype',points,widthM:7,snowLineM:Math.max(0,env.height(points.at(-1)!.x,points.at(-1)!.z)-8),equipment:'skis',lift:true};
   if(inspectSkiArea(area,env).ok){p.libraries.alpine={[area.id]:area};break;}
  }
  if(!p.libraries.alpine)diagnostics.push({severity:'ERROR',code:'ACTIVITY_SKI_MISSING',message:'Aucune descente sèche, libre et suffisamment régulière. Choisir le profil Île alpine ou un autre relief.'});
 }
 const styles=options.races==='both'?['flat','downhill'] as const:options.races==='none'?[]:[options.races];
 for(const style of styles){
  const env=projectRaceTerrainEnvironment(p);let installed=false;
  const anchors=Array.from({length:9},(_,i)=>({x:b.minX+(b.maxX-b.minX)*(.25+i%3*.25),z:b.minZ+(b.maxZ-b.minZ)*(.25+Math.floor(i/3)*.25)}));
  anchors.sort((a,b)=>env.height(b.x,b.z)-env.height(a.x,a.z));
  for(const anchor of anchors){const result=findRaceTerrainPlacements(env,{anchor,style,targetLength:style==='flat'?140:220,width:7,radius:200,maxResults:1,seed:p.world.seed});const candidate=result.candidates[0];if(!candidate)continue;
   putAuthoredRace(p,raceFromTerrainPlacement(p.world,'race:composition-'+style,style==='flat'?'Boucle de roulade':'Descente de roulade',candidate,env));installed=true;break;
  }
  if(!installed)diagnostics.push({severity:'ERROR',code:'ACTIVITY_RACE_MISSING',message:'Aucun circuit '+(style==='flat'?'plat':'descendant')+' validé : changer de graine, de relief ou de demande de courses.'});
 }
 if(options.flight){const r=planFlightCourse(p);if('code' in r)diagnostics.push(r);}
 if(options.surf){
  // The port is only a calm-water shield; without one the whole coast is open to breaks.
  const root=Object.values(p.chunks).flatMap(c=>Object.values(c.entities)).map(e=>({initialState:e.components.State?.initial}));
  const port=authoredPortLayout(root)??{shore:{x:1e9,z:1e9}};
  const {plan,giverId}=planSurfActivity(p,port,p.world.seed);
  if(!giverId)diagnostics.push({severity:'ERROR',code:'ACTIVITY_SURF_MISSING',message:'Trois plages de surf sûres requises ; '+plan.warnings.join(' ; ')});
 }
}
export function validateWorldActivities(p:ProjectDocument):CompositionDiagnostic[]{
 const out:CompositionDiagnostic[]=[],options=p.world.generation?.activities;if(!options&&!p.libraries.alpine&&!Object.values(p.libraries.races??{}).some(race=>race.kind==='ski'))return out;
 const skiRaces=Object.values(p.libraries.races??{}).filter(race=>race.kind==='ski');
 const area=p.libraries.alpine?.['composition-alpine'];
 if(area){
  const env=skiAreaTerrainEnvironment(p);
  if(!inspectSkiArea(area,env).ok)out.push({severity:'ERROR',code:'ACTIVITY_SKI_CHANGED',message:'La descente alpine ne respecte plus le terrain, l’eau ou les réservations.'});
 }
 for(const race of skiRaces){
  if(!area||race.gates.some(({center})=>!skiCorridorContains(area,center.x,center.z,0)))
   out.push({severity:'ERROR',code:'ACTIVITY_SKI_RACE_OUTSIDE',message:race.name+' doit utiliser des portes sur la piste de ski du projet.'});
 }
 if(!area&&options?.ski)out.push({severity:'ERROR',code:'ACTIVITY_SKI_MISSING',message:'La descente alpine demandée est absente.'});
 for(const style of ['flat','downhill'] as const)if(options?.races===style||options?.races==='both'){
  const id='race:composition-'+style,race=p.libraries.races?.[id];if(!race?.track||!inspectRaceTerrain(race.track,projectRaceTerrainEnvironment(p,id),style).valid)out.push({severity:'ERROR',code:'ACTIVITY_RACE_CHANGED',message:'Le circuit '+style+' demandé est absent ou incompatible avec le terrain.'});
 }
 return out;
}
