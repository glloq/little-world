/** Journal (J): missions and activities, read from the gameplay state only. `questChanges`
 * detects new / completed objectives between two snapshots for the HUD banner. */
import type {ObjectiveDefinition,ObjectiveStatus,ActivityDefinition} from '../../gameplay/schema.ts';
import {el} from '../shared/dom.ts';

export interface QuestEntry {id:string;name:string;description?:string;status:ObjectiveStatus;activity?:string}
export interface QuestViewModel {active:QuestEntry[];completed:QuestEntry[];hiddenCount:number}
export function questViewModel(objectives:readonly ObjectiveDefinition[],status:Readonly<Record<string,ObjectiveStatus>>,activities:readonly ActivityDefinition[]=[]):QuestViewModel{
  const activityOf=new Map(activities.filter(a=>a.objectiveId).map(a=>[a.objectiveId!,a.name])),active:QuestEntry[]=[],completed:QuestEntry[]=[];let hidden=0;
  for(const o of objectives){const s=status[o.id]??o.initialStatus,entry:QuestEntry={id:o.id,name:o.name,status:s,...(o.description?{description:o.description}:{}),...(activityOf.has(o.id)?{activity:activityOf.get(o.id)}:{})};
    if(s==='active')active.push(entry);else if(s==='complete')completed.push(entry);else hidden++;}
  return {active,completed,hiddenCount:hidden};
}
/** Objectives that became active or complete since the previous snapshot. */
export function questChanges(objectives:readonly ObjectiveDefinition[],before:Readonly<Record<string,ObjectiveStatus>>,after:Readonly<Record<string,ObjectiveStatus>>):string[]{
  const out:string[]=[];for(const o of objectives){const a=before[o.id],b=after[o.id];if(a===b||!b)continue;if(b==='active')out.push('Nouvelle mission : '+o.name);else if(b==='complete')out.push('Mission terminée : '+o.name);}return out;
}
export function journalPanel(deps:{objectives():readonly ObjectiveDefinition[];status():Readonly<Record<string,ObjectiveStatus>>;activities():readonly ActivityDefinition[]}){
  return {render(body:HTMLElement){
    const vm=questViewModel(deps.objectives(),deps.status(),deps.activities());body.replaceChildren();
    const section=(title:string,list:QuestEntry[],empty:string)=>{const s=el('section','ui-journal-section');s.append(el('h3','ui-group',title));if(!list.length)s.append(el('p','ui-empty',empty));
      for(const q of list){const card=el('article','ui-quest');card.dataset.status=q.status;card.append(el('strong','',(q.status==='complete'?'✓ ':'• ')+q.name));if(q.activity)card.append(el('span','ui-muted',q.activity));if(q.description)card.append(el('p','',q.description));s.append(card);}return s;};
    body.append(section('En cours',vm.active,'Aucune mission en cours. Parlez aux habitants pour en découvrir.'),section('Terminées',vm.completed,'Aucune mission terminée pour le moment.'));
    if(vm.hiddenCount)body.append(el('p','ui-muted',`${vm.hiddenCount} mission(s) encore à découvrir.`));
  }};
}
