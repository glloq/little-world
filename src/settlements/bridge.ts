import {WaterSpatialIndex} from '../water/profile.ts';
import {terrainAccessContext} from '../studio-core/terrain-access.ts';
/** Flat pedestrian bridge: the same normalized parts drive rendering and native collision. */
import {housePoint} from './habitat.ts';
import {transformedCollider} from '../physics/definitions.ts';
import type {TransformComponent,ProjectDocument} from '../studio-core/types.ts';
import type {PathDefinition} from '../world-data.ts';
import type {GroundRouteContext} from '../paths/terrain-route.ts';
export interface BridgeComponent {type:'Bridge';version:1}
export function bridgeParts(){return [
 ...Array.from({length:32},(_,i)=>({x:(i+.5)/32-.5,z:0,bottom:-.2,sx:1/32+.002,sz:1,sy:.2})),
 ...[-1,1].flatMap(sign=>Array.from({length:32},(_,i)=>({x:(i+.5)/32-.5,z:sign*.48,bottom:0,sx:1/32+.002,sz:.04,sy:1})))];}
export function bridgeColliders(id:string,t:TransformComponent){return bridgeParts().map((b,i)=>({...transformedCollider(id+'::bridge:'+i,{shape:'box',size:{x:b.sx,y:b.sy,z:b.sz}},{...t,position:housePoint(t,b.x,b.bottom,b.z)}),ownerId:id,groundAnchor:{x:t.position.x,z:t.position.z}}));}
export function pathSupport(p:ProjectDocument,path:PathDefinition,c:GroundRouteContext){
 if(!path.supportId)return c;
 const index=p.entityIndex[path.supportId],e=index?p.chunks[index.ownerChunkId]?.entities[path.supportId]:undefined,t=e?.components.Transform;
 if(!e?.components.Bridge||!t)throw Error('Support du pont absent ou invalide : '+path.supportId);
 const water=new WaterSpatialIndex(Object.values(p.libraries.water),terrainAccessContext(p).source,p.world.seaLevel);
 const y=c.height(t.position.x,t.position.z)+t.position.y,angle=2*Math.atan2(t.rotation.y,t.rotation.w),co=Math.cos(angle),si=Math.sin(angle);
 const contains=(x:number,z:number)=>{const dx=x-t.position.x,dz=z-t.position.z;return Math.abs(dx*co-dz*si)<=t.scale.x/2+.02&&Math.abs(dx*si+dz*co)<=t.scale.z/2-.12;};
 return {...c,height:()=>y,wet:(x:number,z:number)=>!contains(x,z)||c.height(x,z)>y+.05||water.query(x,z).some(h=>h.level>=y-.1)};
}
