import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import {resolveEntity} from '../studio-core/references.ts';
import {putEntity} from '../studio-core/source.ts';
import {makeCollect,makeDeliver,makeDoor,makeLever} from '../gameplay/templates.ts';
import {gameplayDataFromProject} from '../gameplay/project-adapter.ts';
import type {EntityDefinitionV3} from '../studio-core/types.ts';
export async function mountInteractions(host:HTMLElement,s:StudioSession){
 const p=s.document,selected=s.selection.state.selected,entry=selected?p.entityIndex[selected.id]:undefined;
 if(!entry){host.replaceChildren(node('p','Sélectionnez un objet ou un PNJ sur la carte.','workspace-empty'));return;}
 await s.hydrate([entry.ownerChunkId]);const source=p.chunks[entry.ownerChunkId].entities[entry.id],primaryId=resolveEntity(p,source).components.Interactable?.interactionIds[0],existing=primaryId?p.libraries.interactions[primaryId]:undefined,resourceId=existing?.sequence.flatMap(a=>a.type==='giveItem'?[a.itemId]:[])[0];
 const panel=node('section','','section-card'),feedback=node('p','','muted');panel.append(node('div','ACTIONS DÉCLARATIVES','kicker'),node('h2',source.name),node('p','Choisissez un comportement prêt à l’emploi. Les changements passent par le même historique que la carte.','muted'));
 let kind='collect',targetId=Object.keys(p.entityIndex).find(id=>id!==source.id)??'',itemId=Object.keys(p.libraries.items)[0]??'',name=resourceId?p.libraries.items[resourceId].name:'Gland',quantity=1,prompt='Ramasser',chosenSound=existing?.sequence.flatMap(a=>a.type==='playSound'?[a.soundId]:[])[0]??(p.world.audio?.sounds.collect?'collect':'');
 const fields=node('div'),selector=select(kind,[['collect','Collecter une ressource'],['deliver','Livrer un objet / petite mission'],['door','Ouvrir / fermer cet objet'],['lever','Levier relié à un autre objet']],v=>{kind=v;const candidate=kind==='collect'?'collect':kind==='deliver'?'mission':'lever';chosenSound=p.world.audio?.sounds[candidate]?candidate:'';render();});panel.append(field('Comportement',selector),fields);
 function render(){fields.replaceChildren(field('Message d’interaction',input(prompt,v=>prompt=v)));if(p.world.audio)fields.append(field('Son de confirmation',select(chosenSound,[['','Aucun'],...Object.values(p.world.audio.sounds).map(s=>[s.id,p.world.audio!.assets[s.assetId].name] as const)],v=>chosenSound=v)));if(kind==='collect')fields.append(field('Nom de la ressource',input(name,v=>name=v)));if(kind==='deliver')fields.append(field('Ressource à livrer',select(itemId,Object.values(p.libraries.items).map(i=>[i.id,i.name] as const),v=>itemId=v)));if(kind==='lever')fields.append(field('Objet à ouvrir',select(targetId,Object.values(p.entityIndex).filter(e=>e.id!==source.id).map(e=>[e.id,e.name] as const),v=>targetId=v)));if(kind==='collect'||kind==='deliver')fields.append(field('Quantité',numberInput(quantity,v=>quantity=v,1,99,'1')));}
 render();panel.append(button('Appliquer le comportement',async()=>{try{
  if(!prompt.trim())throw Error('Indiquez un message d’interaction.');if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw Error('Quantité entre 1 et 99.');
  const target=kind==='lever'?p.entityIndex[targetId]:undefined;if(kind==='lever'&&!target)throw Error('Sélectionnez un autre objet.');if(kind==='deliver'&&!p.libraries.items[itemId])throw Error('Créez d’abord une ressource à collecter.');
  const affected=[entry.ownerChunkId,...(target?[target.ownerChunkId]:[])],id=primaryId??'interaction:'+source.id,objectiveId='objective:delivery:'+source.id;
  await s.change('Configurer '+source.name,affected,d=>{
   const entity=structuredClone(d.chunks[entry.ownerChunkId].entities[source.id]);
   const state=(entity:EntityDefinitionV3,values:Record<string,boolean>)=>{const resolved=resolveEntity(d,entity);entity.components.State={type:'State',initial:{...resolved.components.State?.initial,...values}};entity.components.Persistence={type:'Persistence',fields:[...new Set([...(resolved.components.Persistence?.fields??[]),...Object.keys(values)])]};};
   const resolved=resolveEntity(d,entity);entity.components.Interactable={type:'Interactable',prompt,range:4,interactionIds:[...new Set([...(resolved.components.Interactable?.interactionIds??[]),id])]};
   let interaction;
   if(kind==='collect'){const resource=resourceId??'item:'+source.id;d.libraries.items={...d.libraries.items,[resource]:{id:resource,name,category:'nature',maxQuantity:99}};state(entity,{collected:false});interaction=makeCollect(id,source.id,resource,quantity);}
   else if(kind==='deliver'){d.libraries.objectives={...d.libraries.objectives,[objectiveId]:{id:objectiveId,name:'Livrer '+quantity+' '+p.libraries.items[itemId].name,initialStatus:'active',persistent:true}};interaction=makeDeliver(id,source.id,itemId,objectiveId,quantity);}
   else if(kind==='door'){entity.components.Collider??={type:'Collider',shape:'box',size:{x:2,y:2,z:2},layer:'solid'};state(entity,{open:false});interaction=makeDoor(id,source.id);}
   else{const destination=structuredClone(d.chunks[target!.ownerChunkId].entities[targetId]);destination.components.Collider??={type:'Collider',shape:'box',size:{x:2,y:2,z:2},layer:'solid'};state(destination,{open:false});putEntity(d,destination);state(entity,{active:false});interaction=makeLever(id,source.id,targetId);}
   if(chosenSound&&d.world.audio?.sounds[chosenSound])interaction.sequence.push({type:'playSound',soundId:chosenSound});
   d.libraries.interactions={...d.libraries.interactions,[id]:interaction};putEntity(d,entity);
   // Validate complete logical references using the lightweight index, including unloaded sources.
   gameplayDataFromProject(d);
  });feedback.textContent='Comportement appliqué. « Tester la copie » permet de l’utiliser avec E.';
 }catch(error){feedback.textContent=String(error);}},'primary-button'),feedback,node('p','L’ouverture est représentée par une rotation et libère la collision. Les volumes sont des enveloppes simples ; les effets audio restent à raccorder.','muted'));host.replaceChildren(panel);
}
