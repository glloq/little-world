/** Author-facing quest editor. Source-owned offers are validated by the same
 * strict parser as compiled gameplay. No executable scripts in quest data.
 * All edits use StudioSession change (Undo/Redo, save and export archive).
 */
import {node,button,field,input,select,numberInput,download} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {QuestCatalogEntryV1,QuestStepV1} from '../quests/schema.ts';
import {parseQuestCatalogEntry} from '../quests/validation.ts';

export function mountQuestsPanel(host:HTMLElement,session:StudioSession,
 status:(message:string,error?:boolean)=>void){
 const project=session.document;
 const knownNpcs=Object.values(project.entityIndex).filter(e=>e.kind==='character')
  .sort((a,b)=>a.name.localeCompare(b.name));
 const entities=Object.values(project.entityIndex).sort((a,b)=>a.name.localeCompare(b.name));
 const knownItems=Object.values(project.libraries.items).sort((a,b)=>a.name.localeCompare(b.name));
 const playerPlots=Object.values(project.libraries.zones??{}).filter(zone=>
  zone.kind==='farm-plot'&&zone.farm?.assignment==='player').sort((a,b)=>a.name.localeCompare(b.name));
 const fixedRaces=Object.values(project.libraries.races??{}).sort((a,b)=>a.name.localeCompare(b.name));
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
   const local=(!('islandId'in step)||!step.islandId||step.islandId===project.world.worldId);
   if(step.kind==='talk'&&step.npcId&&local){refs.add(step.npcId);if(!project.entityIndex[step.npcId])issues.push('Interlocuteur manquant : '+step.npcId);}
   if(step.kind==='visit'&&local){refs.add(step.targetId);if(!project.entityIndex[step.targetId])issues.push('Lieu manquant : '+step.targetId);}
   if(step.kind==='race'&&local&&project.libraries.races?.[step.raceId])refs.add(step.raceId);
   if(step.kind==='acquire'&&project.libraries.items[step.itemId])refs.add(step.itemId);
   if(step.kind==='deliver'&&local){refs.add(step.giverId);if(!project.entityIndex[step.giverId])issues.push('Destinataire manquant : '+step.giverId);}
  }
  if(typeof value.bindings.farmPlotId==='string'){
   const plot=playerPlots.find(plot=>plot.id===value.bindings.farmPlotId);
   if(plot)refs.add(plot.id);
   else issues.push('Parcelle de guidage du joueur absente : '+value.bindings.farmPlotId);
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
   field('Consigne dans le journal',input(String(q.bindings.instruction??''),v=>{
    if(v.trim())q.bindings.instruction=v.trim();else delete q.bindings.instruction;
   })),
   field('Donneur PNJ',select(q.giverId,knownNpcs.map(n=>[n.id,n.name] as const),v=>q.giverId=v)),
   node('p','ID stable : '+q.questKey,'muted'));
  if(playerPlots.length||q.bindings.farmPlotId!==undefined){
   const plotId=String(q.bindings.farmPlotId??'');
   const plots: [string,string][]=[['','Aucune'],...playerPlots.map(plot=>[plot.id,plot.name] as [string,string])];
   if(plotId&&!plots.some(([id])=>id===plotId))plots.push([plotId,plotId+' (absente)']);
   form.append(field('Parcelle indiquée dans le journal',select(plotId,plots,v=>{
    if(v)q.bindings.farmPlotId=v;else delete q.bindings.farmPlotId;
   })));
  }
  const steps=node('div','','section-card');steps.append(node('h4','Étapes successives (maximum 8)'));
  const defaults:Record<QuestStepV1['kind'],QuestStepV1>={
   talk:{kind:'talk',npcId:q.giverId},
   visit:{kind:'visit',targetId:entities[0]?.id??q.giverId,withinM:4},
   acquire:{kind:'acquire',itemId:knownItems[0]?.id??'coin',quantity:1,source:'any'},
   deliver:{kind:'deliver',itemId:knownItems[0]?.id??'coin',quantity:1,giverId:q.giverId},
   craft:{kind:'craft',recipeId:'sawmill:planks',quantity:1},
   race:{kind:'race',raceId:Object.keys(project.libraries.races??{})[0]??'race:unknown'},
   travel:{kind:'travel',fromIslandId:project.world.worldId,toIslandId:'destination-island'},
   event:{kind:'event',eventType:'npc.talked',count:1},
  };
  const stepKinds:readonly (readonly [QuestStepV1['kind'],string])[]=[
   ['talk','Parler'],['visit','Visiter'],['acquire','Obtenir'],['deliver','Livrer'],
   ['craft','Fabriquer'],['race','Terminer une course'],['travel','Prendre le ferry'],['event','Événement natif']];
  q.steps.forEach((step,index)=>{
   const line=node('div','','feature-row');
   line.append(node('strong','Étape '+(index+1)),
    field('Action',select(step.kind,stepKinds,v=>{
     q.steps[index]=structuredClone(defaults[v as QuestStepV1['kind']]);render();
    })));
   const parameter=(key:string,label:string,value:string)=>{
    line.append(field(label,input(value,v=>{(q.steps[index] as unknown as Record<string,unknown>)[key]=v;})));
   };
   if(step.kind==='talk')line.append(field('PNJ cible',input(step.npcId??q.giverId,
    v=>{step.npcId=v;})));
   else if(step.kind==='visit')line.append(field('Entité cible',select(step.targetId,
    entities.map(e=>[e.id,e.name] as const),v=>step.targetId=v)),
    field('Rayon (m)',numberInput(step.withinM,v=>step.withinM=v,.5,100)));
   else if(step.kind==='acquire'||step.kind==='deliver'){
    const item=step;
    line.append(field('Objet',select(step.itemId,knownItems.map(e=>[e.id,e.name] as const),
      v=>item.itemId=v)),field('Quantité',numberInput(step.quantity,v=>item.quantity=v,1,9999,'1')));
    if(step.kind==='deliver')line.append(field('Destinataire',input(step.giverId,
      v=>step.giverId=v)));
    else line.append(field('Source',select(step.source??'any',[
      ['any','Toute origine'],['gather','Cueillette'],['fishing','Pêche'],
      ['mine','Mine'],['farm','Agriculture'],['trade','Achat'],['craft','Atelier']],
      v=>step.source=v as typeof step.source)));
   }else if(step.kind==='craft'){
    parameter('recipeId','Recette',step.recipeId);
    line.append(field('Lots',numberInput(step.quantity,v=>step.quantity=v,1,9999,'1')));
   }else if(step.kind==='race'){
    const race=input(step.raceId,v=>step.raceId=v.trim());
    if(fixedRaces.length){
     const options=node('datalist');options.id='quest-fixed-races-'+index;
     for(const fixed of fixedRaces){
      const choice=node('option');choice.value=fixed.id;choice.label=fixed.name;options.append(choice);
     }
     race.setAttribute('list',options.id);line.append(options);
    }
    line.append(field('Course',race));
   }else if(step.kind==='travel'){
    parameter('fromIslandId','Île de départ',step.fromIslandId);
    parameter('toIslandId','Île de destination',step.toIslandId);
   }
   else if(step.kind==='event'){
    parameter('eventType','Événement natif',step.eventType);
    line.append(field('Nombre',numberInput(step.count,v=>step.count=v,1,9999,'1')));
   }
   if(step.kind!=='travel'&&step.kind!=='acquire'){
    line.append(field('Île cible (vide = île du donneur)',input(
      'islandId'in step?step.islandId??'':'',
      v=>{const raw=q.steps[index] as unknown as Record<string,unknown>;
        if(v.trim())raw.islandId=v.trim();else delete raw.islandId;
      })));
   }
   if(step.kind==='acquire')line.append(field('Île de provenance (optionnelle)',input(
     step.fromIslandId??'',v=>{if(v.trim())step.fromIslandId=v.trim();
      else delete step.fromIslandId;})));
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
  const advanced=node('details','','section-card');
  const editor=node('textarea');editor.rows=16;editor.value=JSON.stringify(q,null,2);
  advanced.append(node('summary','Édition avancée · JSON versionné'),
    node('p','Toutes les étapes, contraintes, récompenses multiples et dépendances. Les scripts et champs inconnus sont refusés.','muted'),
    field('Définition complète (JSON)',editor),
    button('Vérifier et appliquer le JSON',()=>{
      try{
        const value=parseQuestCatalogEntry(JSON.parse(editor.value));
        if(value.questKey!==q.questKey||value.islandId!==project.world.worldId)
          throw Error('L’identité de la mission ou du monde est protégée');
        draft=value;render();status('Définition structurée validée. Enregistrer pour conserver les modifications.');
      }catch(error){status('JSON invalide : '+String(error),true);}
    }),
    button('Exporter ce modèle JSON',()=>download(q.questKey.replace(/[^a-z0-9._-]/gi,'_')+'.json',
      JSON.stringify(q,null,2),'application/json')));
  form.append(steps,rewards,advanced,diagnostics,button('Enregistrer la quête',()=>void save(),'primary-button'),
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
