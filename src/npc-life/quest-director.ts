/** First native, solvable social quest seeded only from available NPC dialogue.
 * Source objectives/choices use the existing journal and savegame, not a second engine.
 * Never grant a reward or mark a quest complete outside validated dialogue actions.
 */
import type {EntityDefinitionV3} from '../studio-core/types.ts';
import type {GameplayDialogue,ObjectiveDefinition} from '../gameplay/schema.ts';
import type {SettlementRecipe,AmenityRecord} from '../settlements/schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';

export interface ResidentVillageQuest {
  objective:ObjectiveDefinition;giverId:string;targetId:string;
}
export function planResidentVillageQuest(
 r:SettlementRecipe,actors:readonly EntityDefinitionV3[],
 dialogues:Record<string,GameplayDialogue>,records:readonly AmenityRecord[],
 protectedIds:ReadonlySet<string>=new Set(),
):ResidentVillageQuest|null{
 if(!r.localLife||!r.residentRoutines)return null;
 const eligible=actors.filter(e=>e.kind==='character'&&
   e.components.DialogueActor&&!protectedIds.has(e.id)&&
   dialogues[e.id+'-talk']?.lines?.length).sort((a,b)=>a.id.localeCompare(b.id));
 const giver=eligible.find(e=>e.id===r.id+'-host')??eligible[0];
 const target=eligible.find(e=>e.id!==giver?.id&&e.components.Resident?.role!=='child')??
   eligible.find(e=>e.id!==giver?.id&&e.components.Resident);
 if(!giver||!target)return null;
 const a=dialogues[giver.id+'-talk'],b=dialogues[target.id+'-talk'];
 const first=a.lines.find(l=>l.id===a.start),second=b.lines.find(l=>l.id===b.start);
 if(!first||!second)return null;
 const id=r.id+'-meet-neighbor';
 const objective:ObjectiveDefinition={id,name:'Rencontrer '+target.name,initialStatus:'locked',
   persistent:true,description:'Parlez à '+giver.name+' puis allez rencontrer '+target.name+'.'};
 first.choices.push({id:'resident-quest-start',text:'Avez-vous une petite mission ?',
   gate:{type:'objectiveState',objectiveId:id,status:'locked'},
   actions:[{type:'setObjective',objectiveId:id,status:'active'}]});
 second.choices.push({id:'resident-quest-finish',text:'Je viens de la part de '+giver.name+'.',
   gate:{type:'objectiveState',objectiveId:id,status:'active'},
   actions:[{type:'setObjective',objectiveId:id,status:'complete'}]});
 for(const e of [giver,target]){
   const record=records.find(x=>x.id===e.id);
   if(record?.dialogueHash)record.dialogueHash=fingerprint(dialogues[e.id+'-talk']);
 }
 return {objective,giverId:giver.id,targetId:target.id};
}
