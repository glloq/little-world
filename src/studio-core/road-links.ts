/** Road links for a whole project (doc 109 §6): every destination the circulation audit finds
 * isolated is joined to the main network by a planned road — bridges square to the streams, capped
 * gradient with hairpins, ground fitted where needed. One entry point for the composition pipeline
 * and the Studio. Pure plan + explicit apply: nothing is written until `applyRoadLinks`. */
import type {ProjectDocument,EntityDefinitionV3} from './types.ts';
import type {PathDefinition} from '../world-data.ts';
import type {EarthworkV1} from '../geography/earthworks.ts';
import {EARTHWORK_LIMIT} from '../geography/earthworks.ts';
import {buildCirculationGraph,circulationReport,type DestinationKind} from './circulation.ts';
import {projectRoadContext,bridgePlacement,roadPaths} from './road-network.ts';
import {projectGeography} from './geo-context.ts';
import {classifyPoint} from '../geography/classify.ts';
import {createRaceCorridorIndex} from '../gameplay/race-corridors.ts';
import {planRoadTiered,nearestRoadPoint,ROAD_POLICIES,type BridgeSite} from '../paths/road-planner.ts';
import {planRoadGrading} from '../paths/road-grading.ts';
import {pathRibbon} from '../paths/path-geometry.ts';
import {putPath,putEntity} from './source.ts';
import {putEarthworks,projectEarthworks} from './earthworks-planner.ts';
import {chunkAt} from './schema.ts';
import {assetDefinitionFor,colliderFor} from '../world-production/registry.ts';

export const ROAD_LINK_PREFIX='road-link-',ROAD_BRIDGE_PREFIX='road-bridge-',ROAD_BRIDGE_ASSET='structure.bridge_wooden_arch';
export interface RoadLinkReport {pathId:string;destinationId:string;name:string;lengthM:number;bridges:number;maxGrade:number}
export interface RoadLinkPlan {paths:PathDefinition[];bridges:EntityDefinitionV3[];earthworks:EarthworkV1[];failed:{id:string;name:string;reason:string}[];links:RoadLinkReport[];
 /** Works left out because the project already holds the format limit. */earthworksDropped:number}
export interface RoadLinkOptions {maxLinks?:number;maxDistanceM?:number;/** Cut and fill the ground under the new roads. */grading?:boolean}

/** Cart roads serve places people live and trade in; the rest gets a footpath. */
const CART:ReadonlySet<DestinationKind>=new Set(['port','settlement','shop','farm']);
/** Reached from the shore or by boat: never forced by a road (the path planner serves the beach). */
const WATERSIDE:ReadonlySet<DestinationKind>=new Set(['surf','dive']);

export function bridgeEntity(p:ProjectDocument,id:string,site:BridgeSite,height:(x:number,z:number)=>number):EntityDefinitionV3{
 const b=bridgePlacement(site,height),collider=colliderFor(ROAD_BRIDGE_ASSET);
 return {id,name:'Passerelle',kind:'prop',ownerChunkId:chunkAt(p.world,b.x,b.z),components:{Transform:{type:'Transform',position:{x:b.x,y:b.y,z:b.z},rotation:{x:0,y:Math.sin(b.yaw/2),z:0,w:Math.cos(b.yaw/2)},scale:{x:b.stretch,y:1,z:1}},
  Visual:{type:'Visual',assetId:ROAD_BRIDGE_ASSET},...(collider?{Collider:collider}:{})}} as EntityDefinitionV3;
}

export function planRoadLinks(p:ProjectDocument,o:RoadLinkOptions={}):RoadLinkPlan{
 const geo=projectGeography(p),sea=p.world.seaLevel;
 const corridors=createRaceCorridorIndex([...Object.values(p.libraries.races??{}).flatMap(r=>r.track?[r.track]:[]),
  ...Object.values(p.libraries.alpine??{}).map(a=>({points:a.points,width:a.widthM,material:'dirt' as const,smooth:false,features:[]}))],8);
 const water=projectRoadContext(p);
 const rc=projectRoadContext(p,(x,z)=>{const occ=classifyPoint(geo.ctx,x,z).occupation;return occ==='built'||occ==='farm'||occ==='exclusion'||corridors.contains(x,z);});
// Ends of a road stand where the place really is (a field lane, a village street): only water rules there.
 const dry={...rc,blocked:(x:number,z:number,m:number)=>water.blocked(x,z,m)};
 const plan:RoadLinkPlan={paths:[],bridges:[],earthworks:[],failed:[],links:[],earthworksDropped:0},taken=new Set([...Object.keys(p.libraries.paths),...Object.keys(p.entityIndex)]);
 const next=(prefix:string)=>{let n=0;while(taken.has(prefix+n))n++;taken.add(prefix+n);return prefix+n;};
 const maxLinks=o.maxLinks??24,maxDistance=o.maxDistanceM??1800,served=new Set<string>();
 for(let round=0;round<maxLinks;round++){
  const all=[...Object.values(p.libraries.paths) as PathDefinition[],...plan.paths],g=buildCirculationGraph(p,all,plan.bridges),report=circulationReport(g);
  const hubComponent=g.hub?.component??g.destinations.find(d=>d.id===report.destinations.find(r=>r.status==='reachable')?.id)?.component??null;
  if(hubComponent===null)break;
  const hub=g.nodes.filter((_,i)=>g.component[i]===hubComponent);
  const unreached=g.destinations.filter(d=>!WATERSIDE.has(d.kind)&&report.destinations.find(r=>r.id===d.id)!.status!=='reachable'&&!plan.failed.some(f=>f.id===d.id));
  // A place still cut off after its road was laid is reported once, never planned again.
  for(const d of unreached)if(served.has(d.id))plan.failed.push({id:d.id,name:d.name,reason:'route posée mais lieu encore hors de portée'});
  const pending=unreached.filter(d=>!served.has(d.id)).map(d=>{
    // Leave from the destination's own paths when it has some, else from its edge facing the network —
    // on ground a road may use, and close enough for the place to count as served.
    const width=CART.has(d.kind)?3:2,own=d.component!==null?g.nodes.filter((_,i)=>g.component[i]===d.component):d.footprint??[{x:d.x,z:d.z}];
    const starts=own.map(v=>({v,target:hub.reduce((m,b)=>{const dist=Math.hypot(v.x-b.x,v.z-b.z);return dist<m.dist?{b,dist}:m;},{b:hub[0],dist:Infinity})})).sort((x,y)=>x.target.dist-y.target.dist).slice(0,12);
    // Its own paths are joined exactly at one of their points (a few metres apart would stay a separate network).
    // A place without paths is served from free ground beside it: outside its field, off its race roadbed.
    for(const {v,target}of starts){const from=d.component!==null?nearestRoadPoint(dry,v,width,0):nearestRoadPoint(rc,v,width,d.attachM*.8);if(from&&Math.hypot(from.x-v.x,from.z-v.z)<=d.attachM*.8)return {d,from,to:target.b,dist:target.dist,width};}
    return {d,from:null,to:starts[0].target.b,dist:starts[0].target.dist,width};
   }).sort((a,b)=>a.dist-b.dist||a.d.id.localeCompare(b.d.id));
  if(!pending.length)break;
  const {d,from:a,to,dist,width}=pending[0],fail=(reason:string)=>plan.failed.push({id:d.id,name:d.name,reason});
  if(dist>maxDistance){fail(`à ${Math.round(dist)} m du réseau`);continue;}
  const cart=CART.has(d.kind),b=nearestRoadPoint(dry,to,width,0);
  if(!a||!b){fail('aucun sol praticable près du départ ou du réseau');continue;}
  const tiers=(cart?[ROAD_POLICIES.road,ROAD_POLICIES.trail,ROAD_POLICIES.steep]:[ROAD_POLICIES.trail,ROAD_POLICIES.steep]).map(t=>({...t,widthM:width}));
  // Only the main network is followed: a road must not inherit the defects of an unrelated path.
  const network=[...all.filter(q=>!q.supportId&&q.points.some(v=>hub.some(h=>Math.abs(h.x-v.x)<.01&&Math.abs(h.z-v.z)<.01))).map(q=>pathRibbon(q).points),...plan.bridges.map(e=>bridgeSpan(e))];
  const road=planRoadTiered([a,b],{...rc,network},tiers);
  // Hairpins up a mountain are long by nature: only an absurd detour is refused.
  if(!road.pieces.length||road.lengthM>Math.max(600,dist*10)){fail(road.reason??'détour trop long');continue;}
  const id=next(ROAD_LINK_PREFIX),paths=roadPaths(id,road,{kind:cart?'dirt':'trail',width});
  if(!paths.length){fail('déjà au bord du réseau, sans raccord possible');continue;}
  for(const q of paths.slice(1))taken.add(q.id);
  plan.paths.push(...paths);
  for(const site of road.bridges)plan.bridges.push(bridgeEntity(p,next(ROAD_BRIDGE_PREFIX),site,geo.ctx.height));
  served.add(d.id);
  plan.links.push({pathId:id,destinationId:d.id,name:d.name,lengthM:road.lengthM,bridges:road.bridges.length,maxGrade:road.policy!.maxGrade});
 }
 if(o.grading!==false&&p.world.terrain?.kind==='archipelago'){
  const room=EARTHWORK_LIMIT-projectEarthworks(p).length,// The bed and its talus keep clear of water and of every ground something else owns: buildings, fields,
  // race roadbeds and ski runs are validated on their own terrain.
  env={height:geo.ctx.height,seaLevel:sea,nearWater:(x:number,z:number,m:number)=>rc.blocked(x,z,m)||rc.blocked(x+m,z,0)||rc.blocked(x-m,z,0)||rc.blocked(x,z+m,0)||rc.blocked(x,z-m,0)};
  for(const path of plan.paths){const works=planRoadGrading(path,env).works;if(plan.earthworks.length+works.length<=room)plan.earthworks.push(...works);else plan.earthworksDropped+=works.length;}
 }
 return plan;
}
/** Deck of a planned bridge entity as a segment (network following, circulation). */
function bridgeSpan(e:EntityDefinitionV3){
 const t=e.components.Transform!,yaw=2*Math.atan2(t.rotation.y,t.rotation.w),half=2.8*t.scale.x,ax=Math.cos(yaw),az=-Math.sin(yaw);
 return [{x:t.position.x-ax*half,z:t.position.z-az*half},{x:t.position.x+ax*half,z:t.position.z+az*half}];
}
/** Commit a plan: native paths, bridge props (asset registered once) and earthworks. */
export function applyRoadLinks(p:ProjectDocument,plan:RoadLinkPlan):void{
 for(const path of plan.paths)putPath(p,path);
 if(plan.bridges.length&&!p.assets[ROAD_BRIDGE_ASSET]){const def=assetDefinitionFor(ROAD_BRIDGE_ASSET);if(def)p.assets[ROAD_BRIDGE_ASSET]=def;}
 for(const e of plan.bridges)putEntity(p,e);
 if(plan.earthworks.length)putEarthworks(p,plan.earthworks);
}
