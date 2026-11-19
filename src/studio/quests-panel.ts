/** Author-facing quest editor. Source-owned offers are validated by the same
 * strict parser as compiled gameplay. No executable scripts in quest data.
 * All edits use StudioSession change (Undo/Redo, save and export archive).
 */
import {node,button,field,input,select,numberInput,download} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {QuestCatalogEntryV1,QuestStepV1,QuestRewardV1} from '../quests/schema.ts';
import {parseQuestCatalogEntry} from '../quests/validation.ts';

export function mountQuestsPanel(host:HTMLElement,session:StudioSession,
 status:(message:string,error?:boolean)=>void){
 const project=session.document;
 const knownNpcs=Object.values(project.entityIndex).filter(e=>e.kind==='character')
  .sort((a,b)=>a.name.localeCompare(b.name));
 const entities=Object.values(project.entityIndex).sort((a,b)=>a.name.localeCompare(b.name));
 const knownItems=Object.values(project.libraries.items).sort((a,b)=>a.name.localeCompare(b.name));
 const list=node('div'),form=node('section','','section-card'),diagnostics=node('div');
 const catalog=()=>project.libraries.questCatalog??{};
 let selected:string|null=null;
 let draft:QuestCatalogEntryV1|null=null;
 const template=(giverId:string):QuestCatalogEntryV1=>({
  questKey:'quest:authored:'+crypto.randomUUID(),templateId:'studio:authored',
  templateVersion:1,islandId:project.world.worldId,giverId,
  bindings:{title:'Nouvelle mission'},
  steps:[{kind:'talk',npcId:giverId}],rewards:[],
  dependencies:[giverId],catalogRevision:'studio-v1',
  proof:{capabilityIds:[giverId],validatorVersion:'studio-author-v1'},
 });
 function diagnose(value:QuestCatalogEntryV1){
  const issues:string[]=[];
  if(!project.entityIndex[value.giverId])issues.push('Donneur absent du monde');
  const refs=new Set<string>([value.giverId]);
  for(const step of value.steps){
   if(step.kind==='talk'&&step.npcId){refs.add(step.npcId);if(!project.entityIndex[step.npcId])issues.push('Interlocuteur manquant : '+step.npcId);}
   if(step.kind==='visit'){refs.add(step.targetId);if(!project.entityIndex[step.targetId])issues.push('Lieu manquant : '+step.targetId);}
   if(step.kind==='deliver'){refs.add(step.giverId);if(!project.entityIndex[step.giverId])issues.push('Destinataire manquant : '+step.giverId);}
  }
  for(const reward of value.rewards)if(reward.kind==='item'&&!project.libraries.items[reward.itemId])
    issues.push('Objet de récompense absent : '+reward.itemId);
  return {issues,refs:[...refs].sort()};
 }
 async function save(){
  if(!draft)return;
  try{
   const validation=diagnose(draft);
   if(validation.issues.length)throw Error(validation.issues.join(' · '));
   const normalized=parseQuestCatalogEntry({...draft,
    dependencies:validation.refs,
    proof:{capabilityIds:validation.refs,validatorVersion:'studio-author-v1'}});
   await session.change('Enregistrer la quête '+normalized.questKey,[],p=>{
    p.libraries.questCatalog??={};
    p.libraries.questCatalog[normalized.questKey]=normalized;
   });
   selected=normalized.questKey;draft=structuredClone(normalized);
   status('Quête enregistrée dans le projet : tester via « Jouer ici ».');
   render();
  }catch(error){status(String(error),true);}
 }
 function render(){
  list.replaceChildren(node('h3','Missions auteur'),
   node('p','Les objectifs historiques restent indépendants. Créez ici les offres qui seront compilées avec la carte.','muted'));
  for(const q of Object.values(catalog()).sort((a,b)=>a.questKey.localeCompare(b.questKey))){
   list.append(button((selected===q.questKey?'● ':'')+String(q.bindings.title??q.questKey),()=>{
    selected=q.questKey;draft=structuredClone(q);render();
   }));
  }
  form.replaceChildren();diagnostics.replaceChildren();
  if(!draft){
   form.append(node('p','Choisir une mission ou créer un modèle.','muted'));return;
  }
  const q=draft;
  form.append(node('h3','Éditer la mission'),
   field('Titre',input(String(q.bindings.title??''),v=>q.bindings.title=v)),
   field('Donneur PNJ',select(q.giverId,knownNpcs.map(n=>[n.id,n.name] as const),v=>q.giverId=v)),
   node('p','ID stable : '+q.questKey,'muted'));
  const steps=node('div','','section-card');steps.append(node('h4','Étapes successives (maximum 8)'));
  const defaults:Record<QuestStepV1['kind'],QuestStepV1>={
   talk:{kind:'talk',npcId:q.giverId},
   visit:{kind:'visit',targetId:entities[0]?.id??q.giverId,withinM:4},
   acquire:{kind:'acquire',itemId:knownItems[0]?.id??'coin',quantity:1,source:'any'},
   deliver:{kind:'deliver',itemId:knownItems[0]?.id??'coin',quantity:1,giverId:q.giverId},
   craft:{kind:'craft',recipeId:'sawmill:planks',quantity:1},
   race:{kind:'race',raceId:Object.keys(project.libraries.races??{})[0]??'race:unknown'},
   event:{kind:'event',eventType:'npc.talked',count:1},
  };
  const stepKinds:readonly (readonly [QuestStepV1['kind'],string])[]=[
   ['talk','Parler'],['visit','Visiter'],['acquire','Obtenir'],['deliver','Livrer'],
   ['craft','Fabriquer'],['race','Terminer une course'],['event','Événement natif']];
  q.steps.forEach((step,index)=>{
   const line=node('div','','feature-row');
   line.append(node('strong','Étape '+(index+1)),
    field('Action',select(step.kind,stepKinds,v=>{
     q.steps[index]=structuredClone(defaults[v as QuestStepV1['kind']]);render();
    })));
   const parameter=(key:string,label:string,value:string)=>{
    line.append(field(label,input(value,v=>{(q.steps[index] as unknown as Record<string,unknown>)[key]=v;})));
   };
   if(step.kind==='talk')line.append(field('PNJ cible',select(step.npcId??q.giverId,
    knownNpcs.map(n=>[n.id,n.name] as const),v=>{q.steps[index]={kind:'talk',npcId:v};})));
   else if(step.kind==='visit')line.append(field('Entité cible',select(step.targetId,
    entities.map(e=>[e.id,e.name] as const),v=>step.targetId=v)),
    field('Rayon (m)',numberInput(step.withinM,v=>step.withinM=v,.5,100)));
   else if(step.kind==='acquire'||step.kind==='deliver'){
    const item=step;
    line.append(field('Objet',select(step.itemId,knownItems.map(e=>[e.id,e.name] as const),
      v=>item.itemId=v)),field('Quantité',numberInput(step.quantity,v=>item.quantity=v,1,9999,'1')));
    if(step.kind==='deliver')line.append(field('Destinataire',select(step.giverId,
      knownNpcs.map(n=>[n.id,n.name] as const),v=>step.giverId=v)));
    else line.append(field('Source',select(step.source??'any',[
      ['any','Toute origine'],['gather','Cueillette'],['fishing','Pêche'],
      ['mine','Mine'],['farm','Agriculture'],['trade','Achat'],['craft','Atelier']],
      v=>step.source=v as typeof step.source)));
   }else if(step.kind==='craft'){
    parameter('recipeId','Recette',step.recipeId);
    line.append(field('Lots',numberInput(step.quantity,v=>step.quantity=v,1,9999,'1')));
   }else if(step.kind==='race')parameter('raceId','Course',step.raceId);
   else if(step.kind==='event'){
    parameter('eventType','Événement natif',step.eventType);
    line.append(field('Nombre',numberInput(step.count,v=>step.count=v,1,9999,'1')));
   }
   line.append(button('Retirer cette étape',()=>{if(q.steps.length>1){q.steps.splice(index,1);render();}}));
   steps.append(line);
  });
  steps.append(button('Ajouter une étape',()=>{if(q.steps.length<8){
   q.steps.push({kind:'talk',npcId:q.giverId});render();
  }}));
  const rewards=node('div','','section-card');
  rewards.append(node('h4','Récompense'));
  const current=q.rewards[0],rewardType=current?.kind??'none';
  rewards.append(field('Type',select(rewardType,[['none','Aucune'],['coins','Pièces'],['item','Objet']],v=>{
   q.rewards=v==='none'?[]:v==='coins'?[{kind:'coins',quantity:3}]:
     [{kind:'item',itemId:knownItems[0]?.id??'coin',quantity:1}];render();
  })));
  if(current?.kind==='coins'||current?.kind==='item')
   rewards.append(field('Quantité',numberInput(current.quantity,n=>current.quantity=n,1,9999,'1')));
  if(current?.kind==='item')rewards.append(field('Objet',select(current.itemId,
   knownItems.map(i=>[i.id,i.name] as const),v=>current.itemId=v)));
  const problems=diagnose(q).issues;
  diagnostics.append(node('p',problems.length?problems.join(' · '):
   'Données structurelles vérifiables. La solvabilité des chemins reste validée dans le jeu.',
   problems.length?'diagnostic WARNING':'muted'));
  form.append(steps,rewards,diagnostics,button('Enregistrer la quête',()=>void save(),'primary-button'),
   button('Supprimer cette mission',()=>void (async()=>{
    const id=q.questKey;await session.change('Supprimer la quête '+id,[],p=>{
     delete p.libraries.questCatalog?.[id];
    });draft=null;selected=null;render();
   })()));
 }
 host.replaceChildren(node('div','QUÊTES','kicker'),node('h2','Éditeur universel de missions'),
  node('p','Étapes déclaratives et récompenses validées ; toutes les modifications sont annulables.','muted'));
 const create=button('Nouvelle mission',()=>{const giver=knownNpcs[0];
  if(!giver){status('Placer un PNJ avant de créer une quête.',true);return;}
  selected=null;draft=template(giver.id);render();
 },'primary-button');
 host.append(create,list,form);
 render();
 return {dispose(){}};
}
