/** Studio-only preflight for NPC quest generation.
 * This is eligibility, NOT a claim of route solvability. The actual route
 * remains authoritative at runtime via the same NPC pedestrian router.
 */
import type {ProjectDocument} from '../studio-core/types.ts';
import {residentRegistry} from './registry.ts';
export interface ResidentQuestReadiness{
 residents:number;dialogueActors:number;potentialSocialPairs:number;
 positionedWorkAnchors:number;missingDialogueIds:string[];routeQualified:false;
}
export function residentQuestReadiness(
 project:ProjectDocument,settlementId:string,
):ResidentQuestReadiness{
 const residents=residentRegistry(project,settlementId).residents;
 const talking=residents.filter(r=>{
  const loc=project.entityIndex[r.id],actor=loc?project.chunks[loc.ownerChunkId]?.entities[r.id]:null;
  const ids=actor?.components.DialogueActor?.dialogueIds??[];
  return ids.some(id=>{
   const dialogue=project.libraries.dialogues?.[id];
   return !!dialogue?.lines?.some(line=>line.choices?.length);
  });
 });
 const entityPositions=new Set(Object.values(project.entityIndex).filter(e=>
  e.position&&Number.isFinite(e.position.x)&&Number.isFinite(e.position.z))
  .map(e=>e.id));
 const workplace= talking.filter(r=>r.workAnchorId&&entityPositions.has(r.workAnchorId)).length;
 return {residents:residents.length,dialogueActors:talking.length,
  potentialSocialPairs:Math.min(2,Math.max(0,talking.length-1)),
  positionedWorkAnchors:workplace,
  missingDialogueIds:residents.filter(r=>!talking.some(t=>t.id===r.id)).map(r=>r.id),
  routeQualified:false};
}
