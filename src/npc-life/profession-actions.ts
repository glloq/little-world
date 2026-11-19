/** Professional action intents bind only to real sources from LifeCapabilityIndex.
 * A visual gesture is never a gameplay outcome or an economic transaction.
 * Executors from fishing/mining/production will be attached through explicit
 * authenticated adapters in F04/Q2, not hidden in render frames.
 */
import type {LifeJob} from './capabilities.ts';
import type {ResidentRole} from './schedule.ts';

export interface ResidentProfessionalAction{
 id:string;role:ResidentRole;
 /** Existing world source, not a synthetic action destination. */
 sourceKind:LifeJob['kind'];
 /** Native action service name; this is metadata, not an executable callback. */
 service:'farming'|'fishing'|'woodcutting'|'gathering'|'mining'|'trade'|'workshop'|'civic';
 presentation:string;
}
const specs:Readonly<Partial<Record<ResidentRole,Readonly<{id:string;kind:LifeJob['kind'];service:ResidentProfessionalAction['service'];presentation:string}>>>>={
 farmer:{id:'profession:farmer',kind:'farm',service:'farming',presentation:'farm-water'},
 fisher:{id:'profession:fisher',kind:'amenity',service:'fishing',presentation:'fish-cast'},
 merchant:{id:'profession:merchant',kind:'amenity',service:'trade',presentation:'interact'},
 woodcutter:{id:'profession:woodcutter',kind:'amenity',service:'woodcutting',presentation:'fell'},
 gatherer:{id:'profession:gatherer',kind:'amenity',service:'gathering',presentation:'collect'},
 miner:{id:'profession:miner',kind:'mine',service:'mining',presentation:'mine'},
 miller:{id:'profession:miller',kind:'amenity',service:'workshop',presentation:'collect'},
 artisan:{id:'profession:artisan',kind:'amenity',service:'workshop',presentation:'mine'},
 innkeeper:{id:'profession:innkeeper',kind:'amenity',service:'trade',presentation:'interact'},
 dockworker:{id:'profession:dockworker',kind:'amenity',service:'civic',presentation:'collect'},
 musician:{id:'profession:musician',kind:'amenity',service:'civic',presentation:'interact'},
 blacksmith:{id:'profession:blacksmith',kind:'amenity',service:'workshop',presentation:'mine'},
};
export function residentProfessionalAction(role:ResidentRole,job:LifeJob|null|undefined):ResidentProfessionalAction|null{
 const spec=specs[role];
 if(!spec||!job||job.role!==role||job.kind!==spec.kind||
  !job.id||job.id!==job.sourceId||!Number.isFinite(job.point.x)||!Number.isFinite(job.point.z))return null;
 return {id:spec.id,role,sourceKind:spec.kind,service:spec.service,presentation:spec.presentation};
}
export function residentProfessionalActionCatalog():readonly ResidentProfessionalAction[]{
 return Object.entries(specs).map(([role,spec])=>({
  id:spec!.id,role:role as ResidentRole,sourceKind:spec!.kind,
  service:spec!.service,presentation:spec!.presentation,
 })).sort((a,b)=>a.id.localeCompare(b.id));
}

/** Read-only capability projection for Studio diagnostics and NPC planners.
 * No dispatch or inventory mutation. Each record is grounded in a native job.
 */
export interface ResidentAvailableProfessionalAction{
  jobId:string;action:ResidentProfessionalAction;
}
export function availableResidentProfessionalActions(
 jobs:readonly LifeJob[],
):ResidentAvailableProfessionalAction[]{
 return [...jobs].sort((a,b)=>a.id.localeCompare(b.id)||a.role.localeCompare(b.role))
  .flatMap(job=>{
   const action=residentProfessionalAction(job.role,job);
   return action?[{jobId:job.id,action}]:[];
  });
}
