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
import {createResidentAssignmentPlanner,MAX_PLAY_ANCHOR_OCCUPANTS} from './assignments.ts';
import {MAX_RESIDENT_DAILY_STOPS,residentDutyShift,validResidentRoutine,type ResidentActivityStop,type ResidentPoint,type ResidentRole,type ResidentRoutineV1} from './schedule.ts';
import {withVillageActivities} from './generation-agenda.ts';
import {validateResidentAgendaRoutes} from './agenda.ts';
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
 const loc=p.entityIndex[id],source=loc?p.chunks[loc.ownerChunkId]?.entities[id]:undefined,
  routine=source?resolveEntity(p,source).components.Resident:undefined;
 if(!source||!routine)throw Error('Resident inconnu');
 // Assignment capacities are checked against the active settlement, not
 // against stale generated placement caches. Shared play anchors are exempt.
 const records=p.libraries.settlements?.[choices.settlementId]?.amenities??[];
 const occupied=records.filter(record=>record.id!==id).map(record=>{
  const index=p.entityIndex[record.id];
  return index?p.chunks[index.ownerChunkId]?.entities[record.id]?.components.Resident:undefined;
 }).filter((r):r is NonNullable<typeof r>=>!!r);
 const conflict=residentReassignmentConflict(occupied,homeId,jobId,routine.role);
 if(conflict)throw Error(conflict);
 const routes=createResidentStudioPlanner(p);
 const path=routes.routeBetween(home.point,job.point);
 if(!path||path.length<.15)throw Error('Aucun trajet piéton valide entre domicile et poste');
 const [start,end]=residentDutyShift(routine);
 if(path.length/1.1/1200*24>(end-start)/2)throw Error('Le trajet dépasse la plage de travail');
 const base={...routine,home:{...home.point},work:{...job.point},
    homeAnchorId:home.id,workAnchorId:job.id};
 const publicPlaces=localLifeCapabilities(
     p.libraries.settlements![choices.settlementId].recipe,
     p.libraries.settlements![choices.settlementId].buildings,
     p.libraries.settlements![choices.settlementId].amenities??[],
     Object.keys(p.libraries.settlements![choices.settlementId].zoneHashes??{})
       .map(zone=>p.libraries.zones?.[zone]).filter((z):z is NonNullable<typeof z>=>!!z),p).play;
 // Do not silently discard an authored agenda when changing its house/job.
 // Reject an unreachable retained visit, so the author can fix it explicitly.
 const authored=!!routine.activities?.length;
 const amended=authored?base:withVillageActivities({...base,activities:undefined},publicPlaces,routes,path);
 if(authored){
  const known=new Map(publicPlaces.map(place=>[place.id,place.point]));
  for(const visit of amended.activities??[]){
   const location=known.get(visit.anchorId);
   if(!location||Math.hypot(location.x-visit.point.x,location.z-visit.point.z)>.5)
    throw Error('Le lieu de pause a changé : réviser les activités avant la réaffectation');
  }
  const legs=(amended.activities??[]).map(visit=>{
   const to=routes.routeBetween(amended.work,visit.point),
     back=routes.routeBetween(visit.point,amended.work);
   if(!to||!back)throw Error('Pause inaccessible depuis le nouveau poste');
   return {to,back};
  });
  const issue=validateResidentAgendaRoutes(amended,{work:path,activities:legs},1200,1.1);
  if(issue)throw Error(issue);
 }
 const next=structuredClone(source);
 next.components.Resident=amended;
 if(next.components.Transform)next.components.Transform.position={...next.components.Transform.position,x:home.point.x,z:home.point.z};
 next.ownerChunkId=chunkAt(p.world,home.point.x,home.point.z);
 putEntity(p,next);
}

/** Pure rule shared by Studio and validation tests. Never auto-reassign another actor. */
export function residentReassignmentConflict(
 occupied:readonly ResidentRoutineV1[],homeId:string,jobId:string,role:ResidentRole,
):string|null{
 if(occupied.filter(r=>r.homeAnchorId===homeId).length>=2)
  return 'Domicile complet : deux autres résidents y sont déjà affectés';
 const sharedPlay=role==='child'||role==='villager';
 const coworkers=occupied.filter(r=>r.workAnchorId===jobId);
 if(coworkers.some(r=>!sharedPlay||!['child','villager'].includes(r.role)))
  return 'Poste déjà attribué à un autre travailleur';
 if(sharedPlay&&coworkers.length>=MAX_PLAY_ANCHOR_OCCUPANTS)
  return 'Lieu de jeu complet : quatre habitants y sont déjà affectés';
 return null;
}

/** Shared bounded route/collision validation for every Studio routine edit. */
function createResidentStudioPlanner(p:ProjectDocument){
 const c=terrainAccessContext(p),query=new WorldCollisionQuery(c.height,()=>null);
 const doors=new Set(Object.values(p.libraries.settlements??{}).flatMap(s=>s.buildings.map(b=>b.doorId)));
 for(const obj of collisionDefinitionsFromProject(p))query.add({...obj,
   position:{...obj.position,y:obj.position.y+c.height(obj.groundAnchor.x,obj.groundAnchor.z)},
   enabled:()=>!doors.has(obj.id)});
 return createResidentAssignmentPlanner(Object.values(p.libraries.paths),c,{
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

}

/** Public anchors are derived from existing settlement data, never synthesized. */
export function residentActivityChoices(p:ProjectDocument,id:string):ResidentAnchorChoice[]{
 const choices=residentAnchorChoices(p,id);
 if(!choices)return [];
 const settlement=p.libraries.settlements?.[choices.settlementId];
 if(!settlement)return [];
 const zones=Object.keys(settlement.zoneHashes??{}).map(key=>p.libraries.zones?.[key]).filter((v):v is NonNullable<typeof v>=>!!v);
 const caps=localLifeCapabilities(settlement.recipe,settlement.buildings,settlement.amenities??[],zones,p);
 return [...new Map(caps.play.map(place=>[place.id,{id:place.id,name:p.entityIndex[place.id]?.name??place.id,point:place.point}])).values()]
  .sort((a,b)=>a.id.localeCompare(b.id));
}

/** Compile an author's explicit daytime activities against navigable routes.
 * The single persisted Resident component remains the sole game data source.
 */
export function setResidentStudioActivities(p:ProjectDocument,id:string,
 activities:readonly {kind:ResidentActivityStop['kind'];anchorId:string;startHour:number;endHour:number;weather?:ResidentActivityStop['weather']}[]):void{
 const index=p.entityIndex[id],source=index?p.chunks[index.ownerChunkId]?.entities[id]:undefined;
 const routine=source?resolveEntity(p,source).components.Resident:undefined;
 if(!source||!routine)throw Error('Résident introuvable');
 if(activities.length>MAX_RESIDENT_DAILY_STOPS)throw Error(MAX_RESIDENT_DAILY_STOPS+' activités maximum');
 const choices=new Map(residentActivityChoices(p,id).map(a=>[a.id,a]));
 const resolved:ResidentActivityStop[]=activities.map(a=>{
  const anchor=choices.get(a.anchorId);
  if(!anchor)throw Error('Lieu public inexistant ou supprimé : '+a.anchorId);
  return {kind:a.kind,anchorId:a.anchorId,point:{...anchor.point},startHour:a.startHour,endHour:a.endHour,
    ...(a.weather&&a.weather!=='any'?{weather:a.weather}:{})};
 }).sort((a,b)=>a.startHour-b.startHour||a.anchorId.localeCompare(b.anchorId));
 const amended:ResidentRoutineV1={...routine,activities:resolved.length?resolved:undefined};
 if(!validResidentRoutine(amended))throw Error('Horaires ou activités incompatibles');
 const routes=createResidentStudioPlanner(p),commute=routes.routeBetween(routine.home,routine.work);
 if(!commute)throw Error('Domicile et travail non reliés');
 const legs=resolved.map(activity=>{
  const to=routes.routeBetween(routine.work,activity.point);
  const back=routes.routeBetween(activity.point,routine.work);
  if(!to||!back)throw Error('Lieu non accessible à pied : '+activity.anchorId);
  return {to,back};
 });
 const issue=validateResidentAgendaRoutes(amended,{work:commute,activities:legs},1200,1.1);
 if(issue)throw Error(issue);
 const next=structuredClone(source);
 next.components.Resident=amended;
 putEntity(p,next);
}
