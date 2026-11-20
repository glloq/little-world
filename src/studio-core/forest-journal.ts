import {ECONOMY_ITEMS} from '../gameplay/economy.ts';
import type {ActionStep,ConditionExpr} from '../gameplay/schema.ts';
import {assetDefinitionFor,colliderFor} from '../world-production/registry.ts';
import {createCharacter} from './character-authoring.ts';
import {chunkAt} from './schema.ts';
import {putEntity} from './source.ts';
import type {ProjectDocument} from './types.ts';

const ID='forest:lost-journal';
const JOURNAL='forest:journal-item';
type Stage='locked'|'active'|'complete';

export function addForestJournal(project:ProjectDocument){
  const objective=(status:Stage):ConditionExpr=>({type:'objectiveState',objectiveId:ID,status});
  const setObjective=(status:Stage):ActionStep=>({type:'setObjective',objectiveId:ID,status});
  const found:ConditionExpr={type:'hasItem',itemId:JOURNAL,quantity:1};
  project.libraries.objectives[ID]={id:ID,name:'Le carnet du val',initialStatus:'locked',persistent:true,
    description:'Retrouvez le carnet de la cartographe dans les ruines au nord du village. Rapportez-le à Mésange, près du chemin des ruines.'};
  project.libraries.items[JOURNAL]={id:JOURNAL,name:'Carnet du val',category:'quest',maxQuantity:1};
  const coin=ECONOMY_ITEMS.find(item=>item.id==='coin')!;
  project.libraries.items.coin??={id:coin.id,name:coin.name,category:coin.category,maxQuantity:coin.maxQuantity};
  const guide=createCharacter(project,{id:'forest:cartographer',name:'Mésange, la cartographe',x:-67,z:-146,species:'hamster'});
  const dialogue=project.libraries.dialogues['dialogue:'+guide];
  dialogue.start='bonjour';
  dialogue.lines=[
    {id:'bonjour',text:'Je relève les chemins du val. Vous partez en exploration ?',choices:[
      {text:'Que cherchez-vous ?',gate:objective('locked'),next:'proposition'},
      {text:'Un indice pour les ruines ?',gate:{type:'all',conditions:[objective('active'),{type:'not',condition:found}]},next:'indice'},
      {text:'J’ai retrouvé votre carnet.',gate:{type:'all',conditions:[objective('active'),found]},actions:[
        {type:'takeItem',itemId:JOURNAL,quantity:1},{type:'giveItem',itemId:'coin',quantity:35},setObjective('complete')],next:'retour'},
      {text:'Qu’avez-vous noté sur la cascade ?',gate:objective('complete'),next:'cascade'},
      {text:'À bientôt.'}]},
    {id:'proposition',text:'J’ai oublié mon carnet près d’un mur effondré au nord du village. Rapportez-le-moi et je vous donnerai 35 pièces.',choices:[
      {text:'Je pars à sa recherche.',actions:[setObjective('active')],next:'indice'},
      {text:'Je reviendrai plus tard.'}]},
    {id:'indice',text:'Prenez le sentier qui monte au nord du village. Le coffre est vers le côté est du mur effondré.',choices:[{text:'Je vais regarder.'}]},
    {id:'retour',text:'Tout y est ! Voici 35 pièces. Passez quand vous voulez pour parler du val.',choices:[{text:'Bonne continuation !'}]},
    {id:'cascade',text:'Le torrent descend à l’est des ruines. Depuis la passerelle, on peut voir la cascade en amont.',choices:[{text:'Merci du conseil.'}]},
  ];

  const cache='forest:journal-cache',open='forest:recover-journal';
  const position={x:-105,y:0,z:131};
  const asset=assetDefinitionFor('structure.chest')!;
  project.assets[asset.id]=asset;
  putEntity(project,{id:cache,name:'Coffre des ruines',kind:'prop',ownerChunkId:chunkAt(project.world,position.x,position.z),components:{
    Transform:{type:'Transform',position,rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
    Visual:{type:'Visual',assetId:asset.id},Collider:colliderFor(asset.id)??undefined,
    State:{type:'State',initial:{opened:false}},Persistence:{type:'Persistence',fields:['opened']},
    Interactable:{type:'Interactable',prompt:'Fouiller le coffre des ruines',range:2.5,interactionIds:[open]},
  }});
  project.libraries.interactions[open]={id:open,trigger:{type:'onInteract',entityId:cache},condition:objective('active'),repeat:'once',persistent:true,
    sequence:[{type:'giveItem',itemId:JOURNAL,quantity:1},{type:'setState',entityId:cache,key:'opened',value:true},{type:'showText',text:'Vous avez retrouvé le carnet de la cartographe.'}]};
}
