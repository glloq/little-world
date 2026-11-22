/** Project adapter of the road audit (final terrain, compiled water, bridge entities). */
import type {ProjectDocument} from './types.ts';
import type {PathDefinition} from '../world-data.ts';
import {projectGeography} from './geo-context.ts';
import {WaterSpatialIndex} from '../water/profile.ts';
import {auditRoads,type RoadAudit,type RoadAuditEnv,type RoadBridge} from '../paths/road-audit.ts';

/** Bridges: native `Bridge` supports (deck along local X, length = scale.x) and bridge GLB props. */
export function projectBridges(p:ProjectDocument):RoadBridge[]{
 const out:RoadBridge[]=[];
 for(const c of Object.values(p.chunks))for(const e of Object.values(c.entities)){
  const t=e.components.Transform,asset=e.components.Visual?.assetId??'';
  if(!t||!(e.components.Bridge||/(^|\.)bridge/.test(asset)))continue;
  const yaw=2*Math.atan2(t.rotation.y,t.rotation.w);
  out.push({id:e.id,x:t.position.x,z:t.position.z,axisX:Math.cos(yaw),axisZ:-Math.sin(yaw),lengthM:e.components.Bridge?t.scale.x:5.6*Math.max(t.scale.x,t.scale.z)});
 }
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}
export function projectRoadAuditEnv(p:ProjectDocument):RoadAuditEnv{
 const geo=projectGeography(p),index=new WaterSpatialIndex(Object.values(p.libraries.water),geo.source,p.world.seaLevel);
 return {height:geo.ctx.height,seaLevel:p.world.seaLevel,bridges:projectBridges(p),
  water:(x,z)=>index.query(x,z).filter(h=>h.inside).map(h=>({id:h.water.id,level:h.level,lake:h.water.kind==='lake',flowX:h.flowX,flowZ:h.flowZ}))};
}
export function auditProjectRoads(p:ProjectDocument):RoadAudit{return auditRoads(Object.values(p.libraries.paths) as PathDefinition[],projectRoadAuditEnv(p));}
