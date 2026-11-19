/** Explicit author-only reassignment of a resident to real native anchors.
 * No generated house/bridge/job gets moved or invented. The V3 source identity
 * and dialogue are kept, and the author change is protected on recomposition.
 */
import type {ProjectDocument} from '../studio-core/types.ts';
import {resolveEntity} from '../studio-core/references.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {putEntity} from '../studio-core/source.ts';
import {terrainAccessContext} from '../studio-core/terrain-access.ts';
import {collisionDefinitionsFromProject} from '../studio-core/collision-adapter.ts';
import {WorldCollisionQuery} from '../physics/collision-world.ts';
import {localLifeCapabilities} from './capabilities.ts';
import {createResidentAssignmentPlanner} from './assignments.ts';
import {residentDutyShift,type ResidentPoint} from './schedule.ts';
import {withVillageActivities} from './generation-agenda.ts';
export interface ResidentAnchorChoice {id:string;name:string;point:ResidentPoint}
export interface ResidentAnchorChoices {homes:ResidentAnchorChoice[];jobs:ResidentAnchorChoice[];settlementId:string}
export function residentAnchorChoices(p:ProjectDocument,id:string):ResidentAnchorChoices|null{
 const s=Object.values(p.libraries.settlements??{}).find(s=>(s.amenities??[]).some(a=>a.id===id&&(a.role==='resident'||a.role==='host')));
 const index=p.entityIndex[id],source=index?p.chunks[index.ownerChunkId]?.entities[id]:undefined;
 const routine=source?resolveEntity(p,source).components.Resident:undefined;
 if(!s||!routine)return null;
 const zones=Object.keys(s.zoneHashes??{}).map(id=>p.libraries.zones?.[id]).filter((x):x is NonNullable<typeof x>=>!!x);
 const caps=localLifeCapabilities(s.recipe,s.buildings,s.amenities??[],zones,p);
 const jobs=(routine.role==='child'||routine.role==='villager'?caps.play:
   caps.jobs.filter(job=>job.role===routine.role)).map(job=>({
     id:job.id,name:(p.entityIndex[job.id]?.name??job.role)+' · '+job.id,point:job.point,
   }));
 return {settlementId:s.id,homes:caps.homes.map(h=>({id:h.id,name:p.entityIndex[h.id]?.name??h.id,point:h.point})),
   jobs:jobs.sort((a,b)=>a.id.localeCompare(b.id))};
}
export function reassignResident(p:ProjectDocument,id:string,homeId:string,jobId:string):void{
 const choices=residentAnchorChoices(p,id);
 if(!choices)throw Error('Personnage sans résidence générée : utiliser le trajet manuel');
 const home=choices.homes.find(h=>h.id===homeId),job=choices.jobs.find(j=>j.id===jobId);
 if(!home||!job)throw Error('Maison ou activité non disponible pour le métier choisi');
 // Author edits must not silently double-book a single-worker station or overfill a home.
 // Children may share a playground, but employment anchors are exclusive.
 const records=p.libraries.settlements?.[choices.settlementId]?.amenities??[];
 const occupied=records.filter(record=>record.id!==id).map(record=>{
  const index=p.entityIndex[record.id];
  return index?p.chunks[index.ownerChunkId]?.entities[record.id]?.components.Resident:undefined;
 }).filter((r):r is NonNullable<typeof r>=>!!r);
 if(occupied.filter(r=>r.homeAnchorId===homeId).length>=2)
  throw Error('Domicile complet : deux autres résidents y sont déjà affectés');
 if(occupied.some(r=>r.workAnchorId===jobId&&r.role!=='child')&&
    !['child','villager'].includes(occupied.find(r=>r.workAnchorId===jobId)?.role??''))
  throw Error('Poste déjà attribué à un autre travailleur');
 const loc=p.entityIndex[id],source=loc?p.chunks[loc.ownerChunkId]?.entities[id]:undefined,
  routine=source?resolveEntity(p,source).components.Resident:undefined;
 if(!source||!routine)throw Error('Resident inconnu');
 const c=terrainAccessContext(p),query=new WorldCollisionQuery(c.height,()=>null);
 const doors=new Set(Object.values(p.libraries.settlements??{}).flatMap(s=>s.buildings.map(b=>b.doorId)));
 for(const obj of collisionDefinitionsFromProject(p))query.add({...obj,
   position:{...obj.position,y:obj.position.y+c.height(obj.groundAnchor.x,obj.groundAnchor.z)},
   enabled:()=>!doors.has(obj.id)});
 const routes=createResidentAssignmentPlanner(Object.values(p.libraries.paths),c,{
   maxRouteM:650,blocked:(x,z)=>query.intersectsVolume({minX:x-.22,maxX:x+.22,minZ:z-.22,maxZ:z+.22,
      minY:c.height(x,z)+.4,maxY:c.height(x,z)+1.5}),
   surfaces:{groundHeight:c.height,supportHeight:(supportId,x,z)=>{
     const ref=p.entityIndex[supportId],bridge=ref?p.chunks[ref.ownerChunkId]?.entities[supportId]:undefined;
     const t=bridge?.components.Bridge?bridge.components.Transform:undefined;
     if(!t)return null;
     const a=2*Math.atan2(t.rotation.y,t.rotation.w),co=Math.cos(a),si=Math.sin(a),dx=x-t.position.x,dz=z-t.position.z;
     if(Math.abs(dx*co-dz*si)>t.scale.x/2+.02||Math.abs(dx*si+dz*co)>t.scale.z/2-.12)return null;
     const deck=c.height(t.position.x,t.position.z)+t.position.y;
     return deck>=c.height(x,z)-.05?deck:null;
   }},
 });
 const path=routes.routeBetween(home.point,job.point);
 if(!path||path.length<.15)throw Error('Aucun trajet piéton valide entre domicile et poste');
 const [start,end]=residentDutyShift(routine);
 if(path.length/1.1/1200*24>(end-start)/2)throw Error('Le trajet dépasse la plage de travail');
 const amended=withVillageActivities({...routine,home:{...home.point},work:{...job.point},
    homeAnchorId:home.id,workAnchorId:job.id,activities:undefined},
   localLifeCapabilities(
     p.libraries.settlements![choices.settlementId].recipe,
     p.libraries.settlements![choices.settlementId].buildings,
     p.libraries.settlements![choices.settlementId].amenities??[],
     Object.keys(p.libraries.settlements![choices.settlementId].zoneHashes??{})
       .map(zone=>p.libraries.zones?.[zone]).filter((z):z is NonNullable<typeof z>=>!!z),p).play,routes,path);
 const next=structuredClone(source);
 next.components.Resident=amended;
 if(next.components.Transform)next.components.Transform.position={...next.components.Transform.position,x:home.point.x,z:home.point.z};
 next.ownerChunkId=chunkAt(p.world,home.point.x,home.point.z);
 putEntity(p,next);
}
