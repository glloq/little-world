/** Project adapter of the road planner: final terrain, compiled water, and the native paths and
 * bridge placements of a planned road. Pure: the caller commits paths and entities. */
import type {ProjectDocument} from './types.ts';
import type {PathDefinition,PathKind} from '../world-data.ts';
import {projectGeography} from './geo-context.ts';
import {WaterSpatialIndex} from '../water/profile.ts';
import {planRoadTiered,BRIDGE_APPROACH_M,type RoadContext,type PlannedRoad,type BridgeSite,type RoadPolicy} from '../paths/road-planner.ts';
import type {EntityDefinitionV3} from './types.ts';
import type {EarthworkV1} from '../geography/earthworks.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {chunkAt} from './schema.ts';
import {yawQuaternion} from './transforms.ts';
import {auditRoads,ROAD_AUDIT,type RoadAuditEnv} from '../paths/road-audit.ts';
import {centerline} from '../paths/path-geometry.ts';

/** `avoid`: extra forbidden ground (buildings, fields, activity corridors). */
export function projectRoadContext(p:ProjectDocument,avoid?:(x:number,z:number)=>boolean):RoadContext{
 const geo=projectGeography(p),index=new WaterSpatialIndex(Object.values(p.libraries.water),geo.source,p.world.seaLevel);
 return {bounds:p.world.bounds,height:geo.ctx.height,seaLevel:p.world.seaLevel,
  blocked:(x,z,margin)=>index.query(x,z,margin).length>0||!!avoid?.(x,z),wet:(x,z)=>index.query(x,z).some(h=>h.inside),
  streams:index.bodies.filter(w=>w.kind!=='lake').map(w=>({id:w.id,points:w.points.map(q=>({x:q.x,z:q.z,half:q.half??w.width/2,level:q.level}))}))};
}
export interface BridgePlacement {x:number;z:number;/** Yaw of a prop whose deck runs along local X. */yaw:number;/** Height of the model origin above the carved bed. */y:number;stretch:number;site:BridgeSite}
/** GLB footbridge of `spanM` whose deck sits `anchorY` above its origin, laid along the road. */
export function bridgePlacement(site:BridgeSite,height:(x:number,z:number)=>number,asset={spanM:5.6,anchorY:.86}):BridgePlacement{
 const x=(site.a.x+site.b.x)/2,z=(site.a.z+site.b.z)/2,r=(v:number)=>Math.round(v*100)/100;
 return {x:r(x),z:r(z),yaw:Math.atan2(-site.axisZ,site.axisX),y:r(Math.max(0,site.bankY-asset.anchorY-height(x,z))),stretch:r(Math.max(1,site.spanM/asset.spanM)),site};
}
/** Native footbridge of a planned crossing (doc 109 §3): the flat supported deck of doc 88, so the
 * player and the residents both walk it (`supportId`), set above the water — never level with it —
 * and reached by a short ramp raised on each bank. Pure: the caller commits. */
export const ROAD_BRIDGE={rampTalusM:1.2,maxDeckPathM:2.2} as const;
export interface RoadBridgeWorks {entity:EntityDefinitionV3;path:PathDefinition;earthworks:EarthworkV1[];deckY:number}
export function roadBridge(p:ProjectDocument,id:string,site:BridgeSite,roadWidthM:number,height:(x:number,z:number)=>number):RoadBridgeWorks{
 const r=(v:number)=>Math.round(v*100)/100,sea=p.world.seaLevel,a={x:r(site.a.x),z:r(site.a.z)},b={x:r(site.b.x),z:r(site.b.z)},center={x:r((a.x+b.x)/2),z:r((a.z+b.z)/2)};
 const deckY=r(Math.max(height(a.x,a.z),height(b.x,b.z),site.deckY)),span=Math.hypot(b.x-a.x,b.z-a.z);
 const entity={id,name:'Passerelle',kind:'prop',ownerChunkId:chunkAt(p.world,center.x,center.z),components:{
  Transform:{type:'Transform',position:{...center,y:r(deckY-height(center.x,center.z))},rotation:yawQuaternion(-Math.atan2(b.z-a.z,b.x-a.x)),scale:{x:r(Math.max(3,span)),y:1,z:r(Math.max(2.5,Math.min(6,roadWidthM+1)))}},
  Visual:{type:'Visual',assetId:'settlement.bridge'},Bridge:{type:'Bridge',version:1}}} as EntityDefinitionV3;
 // Ramps: from the natural ground at the end of each straight approach up to the deck at the abutment.
 const ramp=(end:PointXZ,sign:number,key:string):EarthworkV1=>{const foot={x:r(end.x-site.axisX*sign*BRIDGE_APPROACH_M),z:r(end.z-site.axisZ*sign*BRIDGE_APPROACH_M)};
  return {id:`road:${id}:${key}`,kind:'corridor',points:[foot,end],levels:[r(height(foot.x,foot.z)-sea),r(deckY-sea)],widthM:r(roadWidthM),talusM:ROAD_BRIDGE.rampTalusM};};
 return {entity,deckY,path:{id:id+'-deck',points:[a,b],width:Math.min(roadWidthM,ROAD_BRIDGE.maxDeckPathM),kind:'wood',supportId:id},earthworks:[ramp(a,1,'a'),ramp(b,-1,'b')]};
}
const MAX_POINTS=100;
/** Native paths of a planned road: one per dry piece, split again past the schema point budget.
 * Consecutive chunks share their end point; pieces stop at the bridge ends. */
export function roadPaths(id:string,road:PlannedRoad,o:{kind:PathKind;width:number}):PathDefinition[]{
 const out:PathDefinition[]=[];
 for(const piece of road.pieces)for(let i=0;i<piece.length-1;i+=MAX_POINTS-1)
  out.push({id:out.length?id+'-'+(out.length+1):id,points:piece.slice(i,i+MAX_POINTS),width:o.width,kind:o.kind});
 return out;
}

/** Repair of one generated access (preset trails, site paths): a path that runs into the sea or a
 * lake is cut back to its longest dry run, and a drowned or too steep one is planned again between
 * the same two ends. Sound paths are left untouched (`null`). Pure: the caller commits. */
export interface PathRepair {pathId:string;action:'replanned'|'trimmed'|'removed'|'kept';paths:PathDefinition[];bridges:BridgeSite[];reason:string}
export function repairPath(path:PathDefinition,rc:RoadContext,env:RoadAuditEnv,policies:readonly RoadPolicy[]):PathRepair|null{
 if(path.supportId)return null;
 const report=auditRoads([path],env),audit=report.paths[0];if(!audit)return null;
 // A stream crossed on foot (ribbon in the bed, with or without a prop above) is planned again too.
 const fords=report.crossings.length;
 const line=centerline(path),drowned=line.map(s=>{const h=env.height(s.x,s.z);return h<env.seaLevel+.3||env.water(s.x,s.z).some(w=>w.lake&&w.level>h+ROAD_AUDIT.shoreM);});
 const wetM=line.reduce((n,s,i)=>n+(i&&(drowned[i]||drowned[i-1])?s.d-line[i-1].d:0),0);
 // Short local steps (village lanes on a bank) are not worth moving a street for.
 if(wetM<2&&audit.steepM<20&&audit.fallLineM<30&&!fords)return null;
 const reason=`${fords?fords+' traversée(s) à gué, ':''}${Math.round(wetM)} m noyés, ${Math.round(audit.steepM)} m trop raides, ${Math.round(audit.fallLineM)} m dans la pente`;
 // Longest dry run of the drawn line.
 let from=-1,to=-1;for(let i=0;i<line.length;i++){if(drowned[i])continue;let k=i;while(k+1<line.length&&!drowned[k+1])k++;if(from<0||line[k].d-line[i].d>line[to].d-line[from].d){from=i;to=k;}i=k;}
 if(from<0||line[to].d-line[from].d<10)return {pathId:path.id,action:'removed',paths:[],bridges:[],reason};
 const a={x:line[from].x,z:line[from].z},b={x:line[to].x,z:line[to].z},kind=path.kind??'dirt';
 const road=planRoadTiered([a,b],rc,policies.map(p=>({...p,widthM:path.width})));
 // A repair must not turn a short access into a long detour.
 if(road.pieces.length&&road.lengthM<=Math.max(120,(line[to].d-line[from].d)*4))return {pathId:path.id,action:'replanned',paths:roadPaths(path.id,road,{kind,width:path.width}),bridges:road.bridges,reason};
 if(wetM<2)return {pathId:path.id,action:'kept',paths:[path],bridges:[],reason:reason+' — '+(road.reason??'détour trop long')};
 const run=line.slice(from,to+1),every=Math.max(1,Math.ceil(run.length/60)),points=run.filter((_,i)=>i%every===0||i===run.length-1).map(s=>({x:Math.round(s.x*100)/100,z:Math.round(s.z*100)/100}));
 return {pathId:path.id,action:'trimmed',paths:[{id:path.id,points,width:path.width,kind}],bridges:[],reason};
}
