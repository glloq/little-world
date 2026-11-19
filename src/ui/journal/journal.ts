/** Journal (J): missions and activities, read from the gameplay state only. `questChanges`
 * detects new / completed objectives between two snapshots for the HUD banner. */
import type {ObjectiveDefinition,ObjectiveStatus,ActivityDefinition} from '../../gameplay/schema.ts';
import type {QuestInstanceV1} from '../../quests/schema.ts';
import {el,button} from '../shared/dom.ts';

export interface QuestEntry {id:string;name:string;description?:string;status:ObjectiveStatus;activity?:string}
export interface QuestViewModel {active:QuestEntry[];completed:QuestEntry[];hiddenCount:number}
export function questViewModel(objectives:readonly ObjectiveDefinition[],status:Readonly<Record<string,ObjectiveStatus>>,activities:readonly ActivityDefinition[]=[],generated:readonly QuestInstanceV1[]=[]):QuestViewModel{
  const activityOf=new Map(activities.filter(a=>a.objectiveId).map(a=>[a.objectiveId!,a.name])),active:QuestEntry[]=[],completed:QuestEntry[]=[];let hidden=0;
  for(const o of objectives){const s=status[o.id]??o.initialStatus,entry:QuestEntry={id:o.id,name:o.name,status:s,...(o.description?{description:o.description}:{}),...(activityOf.has(o.id)?{activity:activityOf.get(o.id)}:{})};
    if(s==='active')active.push(entry);else if(s==='complete')completed.push(entry);else hidden++;}
  for(const q of generated){
    if(q.status==='available'||q.status==='cancelled'||q.status==='expired')continue;
    const done=q.status==='ready'||q.status==='claimed';
    const step=q.steps[q.stepIndex];
    const name=String(q.bindings.title??q.templateId);
    const progress=done?'Objectifs accomplis':
      'Étape '+(q.stepIndex+1)+'/'+q.steps.length+' · '+(step?.kind??'mission');
    const entry:QuestEntry={id:q.instanceId,name,status:q.status==='claimed'?'complete':'active',
      description:done&&q.status==='ready'?progress+' · Retournez voir le donneur pour recevoir la récompense.':progress};
    (entry.status==='complete'?completed:active).push(entry);
  }
  return {active,completed,hiddenCount:hidden};
}
/** Objectives that became active or complete since the previous snapshot. */
export function questChanges(objectives:readonly ObjectiveDefinition[],before:Readonly<Record<string,ObjectiveStatus>>,after:Readonly<Record<string,ObjectiveStatus>>):string[]{
  const out:string[]=[];for(const o of objectives){const a=before[o.id],b=after[o.id];if(a===b||!b)continue;if(b==='active')out.push('Nouvelle mission : '+o.name);else if(b==='complete')out.push('Mission terminée : '+o.name);}return out;
}
export interface JournalDeps {
  objectives():readonly ObjectiveDefinition[];
  status():Readonly<Record<string,ObjectiveStatus>>;
  activities():readonly ActivityDefinition[];
  generated?():readonly QuestInstanceV1[];
  locate?(id:string):{x:number;z:number;label:string}|null;
  openMap?(x:number,z:number,label:string):void;
}
/** One expanded quest at a time, kept across event-driven refreshes. */
export function journalPanel(deps:JournalDeps){
  let expanded:string|null=null;
  return {render(body:HTMLElement){
    const vm=questViewModel(deps.objectives(),deps.status(),deps.activities(),deps.generated?.()??[]);body.replaceChildren();
    const content=el('div','ui-journal-scroll');
    const section=(title:string,list:QuestEntry[],empty:string)=>{
      const group=el('section','ui-journal-section');group.append(el('h3','ui-group',title));
      if(!list.length)group.append(el('p','ui-empty',empty));
      for(const q of list){
        const card=el('article','ui-quest');card.dataset.status=q.status;
        const open=expanded===q.id;
        const toggle=button('',()=>{expanded=expanded===q.id?null:q.id;this.render(body);
          const next=[...body.querySelectorAll<HTMLButtonElement>('.ui-quest-toggle')].find(el=>el.dataset.focusKey==='quest:'+q.id);
          next?.focus();},'ui-quest-toggle');
        toggle.dataset.focusKey='quest:'+q.id;toggle.setAttribute('aria-expanded',String(open));
        toggle.setAttribute('aria-label',(open?'Masquer':'Afficher')+' la mission '+q.name);
        toggle.append(el('span','ui-quest-symbol',q.status==='complete'?'✓ ':'✦ '),el('span','ui-quest-title',q.name),el('span','ui-quest-chevron',open?'−':'+'));
        card.append(toggle);
        if(open){
          const info=el('div','ui-quest-expanded');
          info.append(el('p','ui-quest-description',q.description??'Aucune description pour cette mission.'));
          if(q.activity)info.append(el('p','ui-quest-objective','Objectif : '+q.activity));
          const place=deps.locate?.(q.id);
          if(place&&deps.openMap)info.append(button('⌖ Voir sur la carte · '+place.label,()=>deps.openMap!(place.x,place.z,place.label),'ui-button ui-quest-locate'));
          else info.append(el('p','ui-muted','Localisation du demandeur non renseignée pour cette mission.'));
          card.append(info);
        }
        group.append(card);
      }
      return group;
    };
    content.append(section('En cours',vm.active,'Aucune mission en cours.'),section('Terminées',vm.completed,'Aucune mission terminée.'));
    body.append(content);
    if(vm.hiddenCount)body.append(el('p','ui-muted ui-journal-footer',vm.hiddenCount+' mission(s) encore à découvrir.'));
  }};
}
