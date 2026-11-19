/** One useful animal inhabitant at a validated public access; native dialogues, no new runtime. */
import type {ProjectDocument,EntityDefinitionV3} from '../studio-core/types.ts';
import type {SettlementRecipe,AmenityRecord,BuildingRecord} from './schema.ts';
import type {ActivityZoneV3} from '../studio-core/types.ts';
import type {ResidentRole} from '../npc-life/schedule.ts';
import type {ResidentAssignmentPlanner} from '../npc-life/assignments.ts';
import {localLifeCapabilities} from '../npc-life/capabilities.ts';
import type {GameplayDialogue} from '../gameplay/schema.ts';
import {DEFAULT_APPEARANCE} from '../character-style.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {amenityChanged} from './services.ts';
export function localLife(p:ProjectDocument,r:SettlementRecipe,amenities:AmenityRecord[],buildings:readonly BuildingRecord[]=[],zones:readonly ActivityZoneV3[]=[],assignment?:ResidentAssignmentPlanner){
 const old=p.libraries.settlements?.[r.id]?.amenities?.find(a=>a.role==='host'),oldEntity=old&&p.chunks[p.entityIndex[old.id]?.ownerChunkId]?.entities[old.id];
 if(old&&oldEntity&&amenityChanged(p,old)){
  const routine=oldEntity.components.Resident;
  if(routine){if(routine.homeAnchorId)assignment?.reserve(routine.homeAnchorId);if(routine.workAnchorId)assignment?.reserveJob(routine.workAnchorId);}
  return {entity:structuredClone(oldEntity),record:structuredClone(old),dialogue:p.libraries.dialogues[old.id+'-talk'],preserved:true};
 }
 if(!r.localLife)return null;
 const anchor=amenities.find(a=>a.role==='counter')??amenities.find(a=>a.role==='well');if(!anchor)return null;
 const index=localLifeCapabilities(r,buildings,amenities,zones,p);
 const desired:ResidentRole=r.activity==='agriculture'?'farmer':r.activity==='fishing'?'fisher':
   r.activity==='forest'?'woodcutter':r.activity==='mine'?'miner':
   r.activity==='commerce'?'merchant':'villager';
 // No phantom professions: a host with no reachable native post is a static greeter.
 const candidates=index.jobs.filter(j=>j.role===desired);
 if(!candidates.length&&desired==='villager')
   candidates.push(...index.play.map(j=>({...j,role:'villager' as const})));
 const previousRoutine=oldEntity?.components.Resident;
 const selected=r.residentRoutines&&assignment
   ?candidates.map(job=>assignment.allocate(job,index.homes,job.role,previousRoutine?.homeAnchorId)).find(Boolean)
   :undefined;
 const resident=selected?{Resident:{type:'Resident' as const,version:1 as const,
   role:selected.job.role,home:{...selected.home.point},work:{...selected.job.point},
   homeAnchorId:selected.home.id,workAnchorId:selected.job.id}}:{};
 const warning=r.residentRoutines&&!selected?'LIFE_HOST_UNREACHABLE':undefined;
 const id=r.id+'-host',point=anchor.entry,entity:EntityDefinitionV3={id,kind:'character',name:r.activity==='fishing'?'Habitant du rivage':'Habitant du village',ownerChunkId:chunkAt(p.world,point.x,point.z),components:{Transform:{type:'Transform',position:{...point,y:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Character:{type:'Character',species:'hamster',rigId:'hamster-rigid',appearance:{...DEFAULT_APPEARANCE}},DialogueActor:{type:'DialogueActor',dialogueIds:[id+'-talk']},...resident}};
 const dialogue:GameplayDialogue={id:id+'-talk',actorId:id,start:'hello',lines:[{id:'hello',text:'Bienvenue ! Que cherchez-vous ?',choices:[{id:'activity',text:'Que fait-on ici ?',next:'activity'},{id:'places',text:'Où aller ?',next:'places'},{id:'bye',text:'Au revoir !'}]},{id:'activity',text:r.activity==='fishing'?'Notre comptoir achète les poissons. Les poissons de rivière et de mer sont différents.':r.activity==='agriculture'?'Le comptoir propose des semences pour les cultures.':'Le comptoir permet de vendre les produits locaux et de trouver des provisions.',choices:[{text:'Merci.'}]},{id:'places',text:amenities.some(a=>a.role==='bridge')?'Le pont relie les deux rives. Les maisons de l’autre quartier sont accessibles à pied.':amenities.some(a=>a.role==='inn')?'Une auberge se trouve près du village. Son comptoir propose des provisions.':'Les équipements communs sont près du point d’activité du village.',choices:[{text:'Merci.'}]}]};
 return {entity,dialogue,record:{id,role:'host',entry:point,locked:false,entityHash:fingerprint(entity),dialogueHash:fingerprint(dialogue)} as AmenityRecord,preserved:false,...(warning?{warning}:{})};
}
