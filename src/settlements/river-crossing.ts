import type {ProjectDocument,EntityDefinitionV3} from '../studio-core/types.ts';
import type {SettlementRecipe,AmenityRecord} from './schema.ts';
import type {PathDefinition} from '../world-data.ts';
import type {GroundRouteContext} from '../paths/terrain-route.ts';
import {planGroundRoute,inspectGroundSegment} from '../paths/terrain-route.ts';
import {layoutDimensions,nearestOnRoad} from './layout.ts';
import {corridorStreet} from './corridor.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {yawQuaternion} from '../studio-core/transforms.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {amenityChanged} from './services.ts';
export function riverCrossing(p:ProjectDocument,r:SettlementRecipe,c:GroundRouteContext,roads:PathDefinition[],clear:(q:{x:number;z:number}[],w:number)=>boolean){
 const old=p.libraries.settlements?.[r.id]?.amenities?.find(a=>a.role==='bridge');
 if(old&&amenityChanged(p,old)){const index=p.entityIndex[old.id],entity=index?p.chunks[index.ownerChunkId]?.entities[old.id]:undefined,ids=['-bridge-link','-crossing','-far-landing','-street-1'].map(s=>r.id+s),paths=ids.map(id=>p.libraries.paths[id]);if(entity&&paths.every(Boolean))return {entity:structuredClone(entity),paths:structuredClone(paths),record:structuredClone(old),preserved:true};return {reason:'Pont protégé incomplet : restaurer ses accès avant de recalculer.'};}
 const near=Object.values(p.libraries.water).filter(w=>w.kind!=='lake').map(w=>({w,n:nearestOnRoad(r.center,w.points)})).filter(v=>v.n).sort((a,b)=>a.n!.distance-b.n!.distance)[0];
 if(!near?.n)return {reason:'Aucune rivière pour relier deux rives.'};
 const {point,tangent}=near.n,normal={x:-tangent.z,z:tangent.x},sign=(r.center.x-point.x)*normal.x+(r.center.z-point.z)*normal.z>=0?1:-1;
 for(const shift of [0,-12,12,-24,24]){
  const mid={x:point.x+tangent.x*shift,z:point.z+tangent.z*shift};
  const bank=(side:number)=>{for(let distance=near.w.width/2+1;distance<=14;distance+=1){const q={x:mid.x+normal.x*side*distance,z:mid.z+normal.z*side*distance};if(!c.wet(q.x,q.z)&&c.height(q.x,q.z)>c.seaLevel+1)return q;}return null;};
  const a=bank(sign),b=bank(-sign);if(!a||!b)continue;
  const span=Math.hypot(b.x-a.x,b.z-a.z),ha=c.height(a.x,a.z),hb=c.height(b.x,b.z),deck=Math.max(ha,hb);
  if(span<3||span>28||Math.abs(ha-hb)>.15||near.w.level>deck-.15||!clear([a,b],2.2))continue;
  const land=roads.filter(p=>!p.supportId).map(p=>nearestOnRoad(a,p.points)).filter(v=>v).sort((a,b)=>a!.distance-b!.distance)[0];if(!land)continue;
  const link=planGroundRoute(land.point,a,c,{maxSlope:.35,widthM:2.2,maxCells:1024});if(!link.points.length||!clear(link.points,2.2))continue;
  const landing={x:b.x-normal.x*sign*5,z:b.z-normal.z*sign*5};
  if(!inspectGroundSegment(b,landing,c,{maxSlope:.35,widthM:1.8}).valid||!clear([b,landing],1.8))continue;
  const far=corridorStreet(p,{...r,center:landing,orientation:0},c,clear);if(far.reason)continue;
  // The full deck and both approaches must be above the terrain and water.
  if(Array.from({length:33},(_,i)=>({x:a.x+(b.x-a.x)*i/32,z:a.z+(b.z-a.z)*i/32})).some(q=>c.height(q.x,q.z)>deck+.02))continue;
  const id=r.id+'-bridge',center={x:(a.x+b.x)/2,z:(a.z+b.z)/2},entity:EntityDefinitionV3={id,kind:'prop',name:'Pont piéton des deux rives',ownerChunkId:chunkAt(p.world,center.x,center.z),components:{Transform:{type:'Transform',position:{...center,y:deck-c.height(center.x,center.z)},rotation:yawQuaternion(-Math.atan2(b.z-a.z,b.x-a.x)),scale:{x:span,y:1,z:4}},Visual:{type:'Visual',assetId:'settlement.bridge'},Bridge:{type:'Bridge',version:1}}};
  const paths:PathDefinition[]=[{id:r.id+'-bridge-link',points:link.points,width:2.2,kind:'dirt'},{id:r.id+'-crossing',points:[a,b],width:1.8,kind:'wood',supportId:id},{id:r.id+'-far-landing',points:[b,landing],width:1.8,kind:'dirt'},{id:r.id+'-street-1',points:far.points,width:layoutDimensions(r).streetWidth,kind:'dirt'}];
  const record:AmenityRecord={id,role:'bridge',entityHash:fingerprint(entity),entry:a,locked:false};return {entity,paths,record};
 }
 return {reason:'Aucun petit pont praticable : rapprocher le centre de berges stables, de niveaux similaires et au-dessus de l’eau.'};
}
