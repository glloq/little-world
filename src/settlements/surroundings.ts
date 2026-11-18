/** Native farm zones and small waterfront props, fitted after streets and houses. */
import type {ActivityZoneV3,EntityDefinitionV3,ProjectDocument} from '../studio-core/types.ts';
import type {SettlementRecipe,AmenityRecord} from './schema.ts';
import type {SettlementDiagnostic} from './planner.ts';
import type {PathDefinition} from '../world-data.ts';
import {settlementTerrain} from './terrain.ts';
import {terrainAccessContext} from '../studio-core/terrain-access.ts';
import {defaultFarmSettings} from '../farm/farm-data.ts';
import {compilePolygon} from '../geography/archipelago.ts';
import {inspectGroundSegment} from '../paths/terrain-route.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {worldAsset,colliderFor} from '../world-production/registry.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {yawQuaternion} from '../studio-core/transforms.ts';
import {authoredPortLayout} from '../archipelago/port-n1-plan.ts';
import type {WorldCollisionQuery} from '../physics/collision-world.ts';

const distance=(p:{x:number;z:number},a:{x:number;z:number},b:{x:number;z:number})=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};
export function settlementSurroundings(p:ProjectDocument,r:SettlementRecipe,paths:PathDefinition[],query:WorldCollisionQuery,entities:EntityDefinitionV3[],amenities:AmenityRecord[],diagnostics:SettlementDiagnostic[],preserved:string[]){
 const old=p.libraries.settlements?.[r.id],zones:ActivityZoneV3[]=[],raw=terrainAccessContext(p),owned=old?.zoneHashes??{},terrain=settlementTerrain({...p,libraries:{...p.libraries,zones:Object.fromEntries(Object.entries(p.libraries.zones??{}).filter(([id,z])=>!owned[id]||fingerprint(z)!==owned[id]))}});
 for(const [id,hash]of Object.entries(owned)){const z=p.libraries.zones?.[id];if(z&&fingerprint(z)!==hash){zones.push(structuredClone(z));preserved.push(id);}}
 const blocked=(x:number,z:number,rad:number,h:number)=>query.intersectsVolume({minX:x-rad,maxX:x+rad,minZ:z-rad,maxZ:z+rad,minY:h+.15,maxY:h+4});
 const roads=paths.filter(v=>!v.supportId);
 if(r.cultivation){
  const target=r.form==='hamlet'?4:r.form==='village'?5:7,playerTarget=r.form==='hamlet'?1:2;
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(let slot=0;slot<target;slot++){
   const id=r.id+'-field-'+slot;if(p.libraries.zones?.[id]&&!owned[id]){diagnostics.push({severity:'ERROR',code:'SET_FIELD_CONFLICT',message:'Une zone manuelle utilise un identifiant de parcelle.',targetId:id});continue;}
   if(zones.some(z=>z.id===id))continue;
   // Deleted generated fields remain deleted when regenerating this settlement.
   if(owned[id]&&!p.libraries.zones?.[id])continue;
   let chosen:ActivityZoneV3|undefined;
   const phase=parseInt(fingerprint([r.seed,slot]).slice(0,8),16)/0xffffffff*Math.PI*2;
   search:for(const scale of [1,.75])for(const radius of [.5,.7,.9,1.1])for(let k=0;k<48;k++){
    const a=phase+k*Math.PI*2/48,center={x:r.center.x+Math.cos(a)*r.radius*radius,z:r.center.z+Math.sin(a)*r.radius*radius},w=(slot<playerTarget?4:5)*scale,d=(slot<playerTarget?5:6)*scale,yaw=a*.25+r.orientation*Math.PI/180;
    const polygon=corners.map(([x,z])=>({x:center.x+x*w*Math.cos(yaw)+z*d*Math.sin(yaw),z:center.z-x*w*Math.sin(yaw)+z*d*Math.cos(yaw)}));
    const samples=[center,...polygon,...polygon.map((q,i)=>({x:(q.x+polygon[(i+1)%4].x)/2,z:(q.z+polygon[(i+1)%4].z)/2}))],heights=samples.map(q=>raw.height(q.x,q.z)),h=Math.max(...heights),rad=Math.hypot(w,d)+1;
    if(samples.some(q=>q.x<raw.bounds.minX||q.x>raw.bounds.maxX||q.z<raw.bounds.minZ||q.z>raw.bounds.maxZ||terrain.wet(q.x,q.z))||Math.min(...heights)<=raw.seaLevel+1.3||h-Math.min(...heights)>.7||blocked(center.x,center.z,rad,h))continue;
    if(roads.some(path=>path.points.slice(1).some((b,i)=>distance(center,path.points[i],b)<rad+path.width/2+1)))continue;
    if(zones.some(z=>{const poly=compilePolygon(z.polygon);return samples.some(q=>poly(q.x,q.z)>=-2)||z.polygon.some(q=>Math.hypot(q.x-center.x,q.z-center.z)<rad+2);}))continue;
    const near=roads.flatMap(path=>path.points).sort((a,b)=>Math.hypot(a.x-center.x,a.z-center.z)-Math.hypot(b.x-center.x,b.z-center.z)).find(q=>Math.hypot(q.x-center.x,q.z-center.z)<60&&inspectGroundSegment(center,q,raw,{maxSlope:.35,widthM:1.5}).valid);
    if(!near)continue;
    const assignment=slot<playerTarget?'player':'npc';chosen={id,kind:'farm-plot',name:(assignment==='player'?'Jardin du joueur ':'Champ des habitants ')+(slot+1),polygon,farm:{...defaultFarmSettings(polygon),assignment,initialCrop:assignment==='npc'?['wheat','carrot','pumpkin'][slot%3]:null,rowAngle:yaw}};break search;
   }
   if(chosen)zones.push(chosen);
  }
  const players=zones.filter(z=>z.farm?.assignment==='player').length,npcs=zones.filter(z=>z.farm?.assignment==='npc').length;
  if(players<playerTarget||npcs<2)diagnostics.push({severity:!old&&(players<1||npcs<2)?'ERROR':'WARNING',code:'SET_FIELDS_PARTIAL',message:`Parcelles : ${players}/${playerTarget} pour le joueur, ${npcs} pour les habitants ; terrain disponible insuffisant pour compléter.`});
 }
 // Reuse only a real source port close to this settlement, never invent a second maritime service.
 const port=Object.values(p.chunks).flatMap(c=>Object.values(c.entities)).map(e=>authoredPortLayout([{initialState:e.components.State?.initial}])).find(v=>v&&Math.hypot(v.shore.x-r.center.x,v.shore.z-r.center.z)<Math.max(300,r.radius*3));
 const roles=['shore-hut','shore-boat'];
 for(const a of old?.amenities??[])if(roles.includes(a.role)){
  const idx=p.entityIndex[a.id],e=idx?p.chunks[idx.ownerChunkId]?.entities[a.id]:undefined;
  if(e&&(a.locked||fingerprint(e)!==a.entityHash)){entities.push(structuredClone(e));amenities.push(structuredClone(a));preserved.push(a.id);}
 }
 if(r.waterfront&&port){
  const count=r.form==='hamlet'?3:r.form==='village'?5:7,co=Math.cos(port.heading),si=Math.sin(port.heading);
  for(let slot=0;slot<count;slot++){
   const id=r.id+'-shore-'+slot,role=slot%3===0?'shore-hut':'shore-boat',assetId=role==='shore-hut'?'structure.pier_hut':slot%2?'boat.rowboat_wood':'boat.sailboat_small';
   if(amenities.some(a=>a.id===id)||old?.suppressedAmenities?.includes(role))continue;
   if(p.entityIndex[id]&&!old?.amenities?.some(a=>a.id===id)){diagnostics.push({severity:'ERROR',code:'SET_SHORE_CONFLICT',message:'Objet manuel sur un identifiant du rivage.',targetId:id});continue;}
   const asset=worldAsset(assetId);if(!asset)continue;
   const [sx,,sz]=asset.size,rad=Math.hypot(sx,sz)/2+.8;
   for(let attempt=0;attempt<64;attempt++){
    const side=(slot%2?1:-1)*(12+slot*5+(attempt%8)*3),inland=role==='shore-hut'?8+Math.floor(attempt/8)*7:2+Math.floor(attempt/8)*3,x=port.shore.x+side*co-inland*si,z=port.shore.z-side*si-inland*co,h=raw.height(x,z),samples=[{x,z},...[[-rad,-rad],[rad,-rad],[rad,rad],[-rad,rad]].map(([dx,dz])=>({x:x+dx,z:z+dz}))],hs=samples.map(q=>raw.height(q.x,q.z));
    if(samples.some(q=>q.x<raw.bounds.minX||q.x>raw.bounds.maxX||q.z<raw.bounds.minZ||q.z>raw.bounds.maxZ||terrain.wet(q.x,q.z))||Math.min(...hs)<=raw.seaLevel+.3||Math.max(...hs)-Math.min(...hs)>.4||role==='shore-boat'&&h>raw.seaLevel+3||blocked(x,z,rad,h)||roads.some(path=>path.points.slice(1).some((b,i)=>distance({x,z},path.points[i],b)<rad+path.width/2+1))||zones.some(zone=>compilePolygon(zone.polygon)(x,z)>=-rad))continue;
    if(entities.some(e=>{const t=e.components.Transform;return t&&Math.hypot(t.position.x-x,t.position.z-z)<rad+4;}))continue;
    const yaw=port.heading+(slot%2?.3:-.4),collider=colliderFor(assetId),e:EntityDefinitionV3={id,kind:role==='shore-hut'?'building':'prop',name:role==='shore-hut'?'Cabane des pêcheurs':'Bateau sur la rive',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y:Math.max(...hs)-h,z},rotation:yawQuaternion(yaw),scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId},...(collider?{Collider:collider}:{})}};
    entities.push(e);amenities.push({id,role,entityHash:fingerprint(e),entry:{x,z},locked:false});break;
   }
  }
 }
 return zones;
}
