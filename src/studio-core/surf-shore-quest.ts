import type {ConditionExpr} from '../gameplay/schema.ts';
import {ECONOMY_ITEMS} from '../gameplay/economy.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {createCharacter} from './character-authoring.ts';
import type {ProjectDocument} from './types.ts';

const QUEST='surf-shore:survey';

export function addSurfShoreQuest(project:ProjectDocument,guide:PointXZ,markers:readonly string[]){
 const active:ConditionExpr={type:'objectiveState',objectiveId:QUEST,status:'active'};
 const visited:ConditionExpr={type:'all',conditions:markers.map(entityId=>({type:'stateEquals',entityId,key:'seen',value:true}))};
 const coin=ECONOMY_ITEMS.find(item=>item.id==='coin')!;
 project.libraries.items.coin??={id:coin.id,name:coin.name,category:coin.category,maxQuantity:coin.maxQuantity};
 project.libraries.objectives[QUEST]={id:QUEST,name:'Le tour des trois plages',initialStatus:'locked',persistent:true,
  description:'Lisez les trois fanions de plage sur l’île et revenez voir Céladon près du fanion A.'};
 const id=createCharacter(project,{id:'surf-shore:guide',name:'Céladon, le moniteur',...guide,species:'hamster'});
 const dialogue=project.libraries.dialogues['dialogue:'+id];
 dialogue.start='hello';
 dialogue.lines=[
  {id:'hello',text:'Bienvenue sur l’île des trois vagues. Les fanions indiquent où prendre la mer et ce qui vous attend à chaque plage.',choices:[
   {id:'start',text:'Je veux repérer les trois plages.',gate:{type:'objectiveState',objectiveId:QUEST,status:'locked'},
    actions:[{type:'setObjective',objectiveId:QUEST,status:'active'}],next:'route'},
   {id:'tip',text:'Où sont les deux autres fanions ?',gate:{type:'all',conditions:[active,{type:'not',condition:visited}]},next:'route'},
   {id:'claim',text:'J’ai lu les trois fanions.',gate:{type:'all',conditions:[active,visited]},
    actions:[{type:'giveItem',itemId:'coin',quantity:30},{type:'setObjective',objectiveId:QUEST,status:'complete'}],next:'thanks'},
   {text:'À plus tard.'}]},
  {id:'route',text:'Vous êtes au nord, sur la plage A. Le fanion B est sur la côte sud et le C sur la côte est. Ouvrez la carte pour situer le prochain fanion.',choices:[{text:'Je pars faire le tour.'}]},
  {id:'thanks',text:'Vous connaissez le rivage. Voici 30 pièces pour votre repérage. Essayez la plage A pour vous entraîner à passer les portes.',choices:[{text:'Merci, Céladon.'}]},
 ];
 return id;
}
