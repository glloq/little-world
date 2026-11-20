/** Bounded, read-only content audit. Proximity is a heuristic, never a traversal or FPS certificate. */
import type {ProjectDocument,PointXZ} from './types.ts';
import {projectGeography} from './geo-context.ts';
import {inspectGroundSegment} from '../paths/terrain-route.ts';
import {centerline} from '../paths/path-geometry.ts';
export interface ContentAnchor extends PointXZ {id:string;name:string;kind:string;sourceId:string;surface?:'water'}
export interface ContentCell extends PointXZ {land:boolean;activeDistanceM:number|null;scenicDistanceM:number|null}
export interface PlayabilityFinding extends PointXZ {code:string;message:string;sourceId?:string}
export function auditPlayability(p:ProjectDocument,options:{spacingM?:number;radiusM?:number;maxCells?:number;pathSegments?:number}={}){
 if(Object.keys(p.chunkIndex).some(id=>!p.chunks[id]))throw Error('Charger tous les secteurs avant l’audit de contenu.');
 for(const v of Object.values(options))if(!Number.isFinite(v))throw Error('Paramètre d’audit non fini');
 const b=p.world.bounds,width=b.maxX-b.minX,length=b.maxZ-b.minZ,maxCells=Math.min(4096,Math.max(16,options.maxCells??2400)),step=Math.max(50,options.spacingM??100,Math.sqrt(width*length/maxCells)),nx=Math.max(1,Math.floor(width/step)),nz=Math.max(1,Math.floor(length/step)),radius=Math.max(50,Math.min(1000,options.radiusM??250)),geo=projectGeography(p).ctx;
 const entities=Object.values(p.chunks).flatMap(c=>Object.values(c.entities)),byId=new Map(entities.map(e=>[e.id,e])),anchors:ContentAnchor[]=[],scenic:ContentAnchor[]=[],findings:PlayabilityFinding[]=[];
 const position=(id:string)=>byId.get(id)?.components.Transform?.position;
 const add=(list:ContentAnchor[],id:string,name:string,kind:string,q:PointXZ,sourceId=id,surface?:'water')=>{if(Number.isFinite(q.x)&&Number.isFinite(q.z))list.push({id,name,kind,x:q.x,z:q.z,sourceId,...(surface?{surface}:{})});};
 const center=(points:readonly PointXZ[])=>({x:points.reduce((n,q)=>n+q.x,0)/points.length,z:points.reduce((n,q)=>n+q.z,0)/points.length});
 const allActions:{type:string;objectiveId?:string;status?:string;itemId?:string;quantity?:number}[]=[],questActors=new Map<string,Set<string>>();
 for(const d of Object.values(p.libraries.dialogues)){
  const pending=[d.start],seen=new Set<string>();
  while(pending.length){const id=pending.pop()!;if(seen.has(id))continue;seen.add(id);const line=d.lines.find(l=>l.id===id);if(!line)continue;
   for(const choice of line.choices){if(choice.next)pending.push(choice.next);}
   const actions=[...(line.actions??[]),...line.choices.flatMap(c=>c.actions??[])];allActions.push(...actions);
   for(const a of actions)if(a.type==='setObjective'&&d.actorId){const actors=questActors.get(a.objectiveId)??new Set();actors.add(d.actorId);questActors.set(a.objectiveId,actors);}
  }
 }
 for(const i of Object.values(p.libraries.interactions))allActions.push(...i.sequence);
 for(const e of entities){const q=e.components.Transform?.position;if(!q)continue;
  if(e.components.DialogueActor)add(anchors,'dialogue:'+e.id,e.name,'dialogue',q,e.id);
  if(typeof e.components.State?.initial.shop==='string')add(anchors,'shop:'+e.id,e.name,'commerce',q,e.id);
  if(e.components.Interactable&&!e.components.DialogueActor)add(anchors,'interaction:'+e.id,e.name,'interaction',q,e.id);
  if(e.components.State?.initial.portN1Authored===true)add(anchors,'port:'+e.id,e.name,'maritime',q,e.id);
 }
 const quests=Object.values(p.libraries.objectives).map(o=>{
  const actors=[...(questActors.get(o.id)??[])],starts=o.initialStatus!=='locked'||allActions.some(a=>a.type==='setObjective'&&a.objectiveId===o.id&&a.status==='active'),completes=o.initialStatus==='complete'||allActions.some(a=>a.type==='setObjective'&&a.objectiveId===o.id&&a.status==='complete');
  for(const id of actors){const q=position(id);if(q)add(anchors,'quest:'+o.id+':'+id,o.name,'quest',q,id);}
  if(!starts||!completes)findings.push({code:'QUEST_FLOW_INCOMPLETE',message:o.name+' : activation ou fin structurelle absente.',x:position(actors[0])?.x??0,z:position(actors[0])?.z??0,sourceId:o.id});
  return {id:o.id,name:o.name,starts,completes,actorIds:actors};
 });
 const authoredQuests=Object.values(p.libraries.questCatalog??{}).map(offer=>{
  const name=String(offer.bindings.title??offer.questKey);
  const giver=byId.get(offer.giverId);
  const q=position(offer.giverId);
  const hasGiver=!!(giver?.components.Character&&q);
  if(hasGiver)add(anchors,'quest-offer:'+offer.questKey,name,'quest',q,offer.giverId);
  const report=(code:string,message:string)=>findings.push({
   code,message:name+' · '+message,x:q?.x??0,z:q?.z??0,sourceId:offer.questKey,
  });
  if(!hasGiver)report('QUEST_GIVER_MISSING','le PNJ donneur est absent.');
  for(const step of offer.steps){
   if(step.kind==='race'&&(!step.islandId||step.islandId===p.world.worldId)&&
    !p.libraries.races?.[step.raceId])
    report('QUEST_RACE_REVIEW','aucun circuit source référencé dans ce projet ('+step.raceId+').');
  }
  if(typeof offer.bindings.farmPlotId==='string'){
   const farm=p.libraries.zones?.[offer.bindings.farmPlotId];
   if(farm?.kind!=='farm-plot'||farm.farm?.assignment!=='player')
    report('QUEST_PLOT_MISSING','la parcelle de guidage du joueur est absente.');
  }
  return {id:offer.questKey,name,giverId:offer.giverId,hasGiver,steps:offer.steps.length};
 });
 const zones=Object.values(p.libraries.zones??{});
 for(const z of zones)if(z.polygon.length)add(anchors,z.id,z.name,z.kind==='mine'?'mine':'farm',center(z.polygon));
 for(const r of Object.values(p.libraries.races??{}))for(const [i,g]of [r.gates[0],r.gates.at(-1)!].entries())add(anchors,r.id+':'+i,r.name,'race',g.center,r.id,r.kind==='surf'?'water':undefined);
 for(const a of Object.values(p.libraries.alpine??{}))for(const [i,q]of [a.points[0],a.points.at(-1)!].entries())add(anchors,a.id+':'+i,a.name,'ski',q,a.id);
 const scenicPresets=new Set(['landmark-site','ancient-ruins','waterfall-gorge','mountain-pass','volcanic-field','forest-valley','sandy-beach','marsh-basin']);
 for(const l of Object.values(p.libraries.landscapes??{}))if(scenicPresets.has(l.presetId))add(scenic,l.id,l.name,'landscape',l.center);
 if(anchors.length>4096)findings.push({code:'AUDIT_ANCHOR_LIMIT',message:'Audit limité aux 4 096 premières entrées ; fraction de proximité sous-estimée.',x:0,z:0});
 const validAnchors=anchors.slice(0,4096).filter(a=>{
  const h=geo.height(a.x,a.z),water=geo.water(a.x,a.z,h),submerged=water!==null&&water>h+.1;
  if(a.surface==='water'){
   if(submerged)return true;
   findings.push({code:'CONTENT_SURF_DRY',message:a.name+' · vérifier que la porte est sur l’eau.',...a});
  }else{
   if(h>p.world.seaLevel+.5&&!submerged)return true;
   findings.push({code:'CONTENT_WET',message:a.name+' : vérifier le sol sec et l’accès.',...a});
  }
  return false;
 });
 const near=(q:PointXZ,list:ContentAnchor[])=>{let d=Infinity;for(const a of list)d=Math.min(d,Math.hypot(a.x-q.x,a.z-q.z));return Number.isFinite(d)?Math.round(d):null;},cells:ContentCell[]=[];
 for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const x=b.minX+(ix+.5)*width/nx,z=b.minZ+(iz+.5)*length/nz,h=geo.height(x,z),water=geo.water(x,z,h),land=h>p.world.seaLevel+1&&(water===null||water<=h+.1),q={x,z};cells.push({...q,land,activeDistanceM:land?near(q,validAnchors):null,scenicDistanceM:land?near(q,scenic):null});}
 const dry=cells.filter(c=>c.land),covered=dry.filter(c=>c.activeDistanceM!==null&&c.activeDistanceM<=radius),gaps=dry.filter(c=>c.activeDistanceM===null||c.activeDistanceM>radius).sort((a,b)=>(b.activeDistanceM??1e9)-(a.activeDistanceM??1e9));
 if(gaps.length)findings.push({code:'CONTENT_GAPS',message:`${gaps.length}/${dry.length} cellules terrestres à plus de ${radius} m d’une entrée d’activité enregistrée ; inspecter ou conserver comme espace calme.`,x:gaps[0].x,z:gaps[0].z});
 if(!quests.length&&!authoredQuests.length)findings.push({code:'NO_AUTHORED_QUEST',message:'Aucune mission enregistrée ; les dialogues et activités libres peuvent rester intentionnels.',x:0,z:0});
 if(!p.libraries.settlements&&entities.some(e=>/^architecture\./.test(e.components.Visual?.assetId??'')))findings.push({code:'LEGACY_HOUSES',message:'Les bâtiments historiques ne constituent pas des villages modulaires régénérables.',x:0,z:0});
 const buckets=new Map<string,{entities:number;npcs:number;lights:number}>();for(const e of entities){const q=e.components.Transform?.position;if(!q)continue;const key=Math.floor(q.x/250)+':'+Math.floor(q.z/250),v=buckets.get(key)??{entities:0,npcs:0,lights:0};v.entities++;if(e.components.Character)v.npcs++;if(e.components.Light)v.lights++;buckets.set(key,v);}
 const pathIssues:{id:string;x:number;z:number}[]=[],paths=Object.values(p.libraries.paths);let inspected=0,uninspected=0,uninspectedPaths=0;const limit=Math.max(0,Math.min(2048,options.pathSegments??512)),context={bounds:b,height:geo.height,seaLevel:p.world.seaLevel,wet:(x:number,z:number)=>{const h=geo.height(x,z),w=geo.water(x,z,h);return w!==null&&w>h+.05;}};
 for(const path of paths){if(path.supportId)continue;if(inspected>=limit){uninspectedPaths++;continue;}const line=centerline(path);let bad=false;for(let i=1;i<line.length;i+=10){if(inspected>=limit){uninspected++;continue;}inspected++;const a=line[i-1],q=line[Math.min(i+8,line.length-1)];if(!inspectGroundSegment(a,q,context,{maxSlope:.35,widthM:path.width}).valid)bad=true;}if(bad){pathIssues.push({id:path.id,...path.points[0]});findings.push({code:'PATH_TERRAIN_REVIEW',message:path.id+' : pente ou eau incompatibles sur un échantillon ; vérifier le parcours.',x:path.points[0].x,z:path.points[0].z,sourceId:path.id});}}
 const stats={sourceEntities:entities.length,npcs:entities.filter(e=>e.components.Character).length,lights:entities.filter(e=>e.components.Light).length,colliders:entities.filter(e=>e.components.Collider).length,dialogues:Object.keys(p.libraries.dialogues).length,quests:quests.length+authoredQuests.length,activitiesLibrary:Object.keys(p.libraries.activities).length,shops:anchors.filter(a=>a.kind==='commerce').length,shopsWithUsePose:entities.filter(e=>e.components.ShopAccess&&typeof e.components.State?.initial.shop==='string').length,farms:zones.filter(z=>z.kind==='farm-plot').length,playerFarms:zones.filter(z=>z.farm?.assignment==='player').length,npcFarms:zones.filter(z=>z.farm?.assignment==='npc').length,mines:zones.filter(z=>z.kind==='mine').length,races:Object.keys(p.libraries.races??{}).length,skiAreas:Object.keys(p.libraries.alpine??{}).length,modularSettlements:Object.keys(p.libraries.settlements??{}).length,landscapes:Object.keys(p.libraries.landscapes??{}).length,nativePorts:anchors.filter(a=>a.kind==='maritime').length,explicitAudio:!!p.world.audio,paths:paths.length,chunks:Object.keys(p.chunkIndex).length,assets:Object.keys(p.assets).length};
 return {version:1,worldId:p.world.worldId,name:p.manifest.name,bounds:b,stats,method:{nx,nz,spacingX:width/nx,spacingZ:length/nz,radiusM:radius,distance:'horizontal-euclidean' as const,conditionAware:false,includesProceduralForage:false},coverage:{dryCells:dry.length,sampledLandKm2:Math.round(dry.length*width/nx*length/nz/1e4)/100,nearActivePercent:dry.length?Math.round(100*covered.length/dry.length):0,largestGapM:gaps[0]?.activeDistanceM??null},localBudget:{cellM:250,maxEntities:Math.max(0,...[...buckets.values()].map(v=>v.entities)),maxNPCs:Math.max(0,...[...buckets.values()].map(v=>v.npcs)),maxLights:Math.max(0,...[...buckets.values()].map(v=>v.lights)),gpuMeasured:false},paths:{inspectedSegments:inspected,uninspectedSegments:uninspected,uninspectedPaths,flagged:pathIssues},quests,authoredQuests,anchors:validAnchors,scenic,cells,gaps:gaps.slice(0,24),findings};
}
export type PlayabilityAudit=ReturnType<typeof auditPlayability>;
