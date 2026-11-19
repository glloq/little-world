/** Read-only canonical view of V3 residents; no parallel saved NPC model.
 * Resolve source identities here for Studio, diagnostics and future QuestDirector.
 */
import type {ProjectDocument,EntityDefinitionV3} from '../studio-core/types.ts';
import type {ResidentRole,ResidentPoint} from './schedule.ts';

export interface RegistryResident {
  id:string;name:string;role:ResidentRole;settlementId:string;
  homeAnchorId:string|null;workAnchorId:string|null;
  home:ResidentPoint;work:ResidentPoint;generated:boolean;authored:boolean;
}
export interface RegistryIssue {code:string;targetId:string;message:string}
export interface ResidentRegistrySnapshot {
  residents:RegistryResident[];
  issues:RegistryIssue[];
  byRole:Partial<Record<ResidentRole,number>>;
  homes:Record<string,string[]>;
}
const distance=(a:ResidentPoint,b:ResidentPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const midpoint=(points:ResidentPoint[])=>points.reduce((v,q)=>({x:v.x+q.x/points.length,z:v.z+q.z/points.length}),{x:0,z:0});
export function residentRegistry(project:ProjectDocument,onlySettlementId?:string):ResidentRegistrySnapshot{
  const residents:RegistryResident[]=[],issues:RegistryIssue[]=[],byRole:Partial<Record<ResidentRole,number>>={},homes:Record<string,string[]>={};
  const seenJobs=new Map<string,string>();
  const settlements=Object.values(project.libraries.settlements??{})
    .filter(s=>!onlySettlementId||s.id===onlySettlementId).sort((a,b)=>a.id.localeCompare(b.id));
  for(const settlement of settlements){
    const homeIds=new Map(settlement.buildings.map(b=>[b.id,b.entry]));
    const workIds=new Map((settlement.amenities??[]).map(a=>[a.id,a.entry]));
    for(const z of Object.values(project.libraries.zones??{}))if(z.polygon?.length>=3)
      workIds.set(z.id,midpoint(z.polygon));
    for(const record of (settlement.amenities??[]).filter(a=>a.role==='resident'||a.role==='host').sort((a,b)=>a.id.localeCompare(b.id))){
      const loc=project.entityIndex[record.id];
      const entity:EntityDefinitionV3|undefined=loc?project.chunks[loc.ownerChunkId]?.entities[record.id]:undefined;
      if(!entity)continue;
      const r=entity.components.Resident;
      if(!r)continue; // static greeter is an intentional fallback
      const person:RegistryResident={id:record.id,name:entity.name,role:r.role,settlementId:settlement.id,
        homeAnchorId:r.homeAnchorId??null,workAnchorId:r.workAnchorId??null,
        home:{...r.home},work:{...r.work},generated:true,
        authored:record.locked||false};
      residents.push(person);byRole[r.role]=(byRole[r.role]??0)+1;
      const issue=(code:string,message:string)=>issues.push({code,targetId:record.id,message});
      if(!person.homeAnchorId||!homeIds.has(person.homeAnchorId))
        issue('LIFE_HOME_MISSING','Le domicile du résident ne référence plus une maison de ce village.');
      else if(distance(r.home,homeIds.get(person.homeAnchorId)!)>.5)
        issue('LIFE_HOME_MOVED','L’entrée de la maison a changé : vérifier le trajet du résident.');
      if(!person.workAnchorId||!workIds.has(person.workAnchorId))
        issue('LIFE_WORK_MISSING','Le poste ou le lieu de jeu du résident a disparu.');
      else if(distance(r.work,workIds.get(person.workAnchorId)!)>1)
        issue('LIFE_WORK_MOVED','Le lieu de travail a changé : recalculer la route du résident.');
      if(person.homeAnchorId)(homes[person.homeAnchorId]??=[]).push(person.id);
      if(r.role!=='child'&&person.workAnchorId){
        const key=settlement.id+':'+person.workAnchorId,other=seenJobs.get(key);
        if(other)issue('LIFE_JOB_DUPLICATED','Le poste est déjà affecté au résident '+other+'.');
        else seenJobs.set(key,person.id);
      }
    }
  }
  return {residents,issues,byRole,homes};
}
