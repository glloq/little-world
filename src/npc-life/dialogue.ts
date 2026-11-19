import type {DialogueChoice,DialogueLine,DialogueSession} from '../dialogue.ts';
import {residentShift,type ResidentPhase,type ResidentRole} from './schedule.ts';
const ROLE_LABEL:Record<ResidentRole,string>={
 farmer:'les champs',fisher:'la pêche',merchant:'le marché',
 woodcutter:'la forêt',miner:'la mine',miller:'le moulin',artisan:"l'atelier",
 innkeeper:"l'auberge",child:'les jeux sur la place',villager:'la vie du village',dockworker:'le port',sailor:'les bateaux',courier:'les livraisons',guard:'la surveillance',musician:'la musique',gatherer:'la cueillette',blacksmith:'la forge',traveler:'les voyages',instructor:'les entraînements',
};
const CONTEXT_CHOICE:DialogueChoice={text:'Que faites-vous dans la journée ?'};
const BACK_CHOICE:DialogueChoice={text:'Revenir à la conversation'};
/** Adds one optional conversational topic without altering any authored dialogue actions or IDs. */
export function residentDialogue(base:DialogueSession|undefined,role:ResidentRole,context:()=>{phase:ResidentPhase;hour:number;weather?:'clear'|'cloudy'|'rain'}):DialogueSession{
  let expanded=false,closed=false;
  return {
    get line():DialogueLine{
      if(!expanded)return base?.line??{id:'resident:hello',text:'Bonjour ! Que voulez-vous savoir ?',choices:[CONTEXT_CHOICE]};
      const {phase,hour,weather}=context(),activity=ROLE_LABEL[role];
      const message=phase==='activity'?'Je fais une pause près des autres habitants.':phase==='to-activity'?'Je rejoins les autres habitants pour une pause.':phase==='home'?'Il est '+Math.floor(hour)+' h. Je suis au repos ; je vais bientôt retrouver '+activity+'.':
        phase==='to-work'?'Je vais vers '+activity+'. On peut discuter pendant le chemin.':
        phase==='to-home'?'Je reviens de '+activity+'. À demain !':
        "Je m'occupe de "+activity+" aujourd'hui.";
      return {id:'resident:context',text:message+(weather==='rain'?' Il pleut sur le village.':weather==='cloudy'?' Le ciel est couvert.':''),choices:[BACK_CHOICE]};
    },
    get choices(){if(expanded)return [BACK_CHOICE];return [...(base?.choices??[]),CONTEXT_CHOICE];},
    get locked(){return expanded?[]:base?.locked??[];},
    hint(index){return expanded?undefined:base?.hint?.(index);},
    get closed(){return closed||(!expanded&&!!base?.closed);},
    choose(index){
      if(closed||!Number.isInteger(index))return false;
      if(expanded){if(index!==0)return false;expanded=false;return true;}
      const ownCount=base?.choices.length??0;
      if(index===ownCount){expanded=true;return true;}
      if(index<0||index>=ownCount)return false;
      return base!.choose(index);
    },
    close(){closed=true;base?.close();},
  };
}
export function residentContextForHour(role:ResidentRole,hour:number):{phase:ResidentPhase;hour:number}{
  const [begin,end]=residentShift(role);
  return {hour,phase:hour<begin||hour>=end?'home':'work'};
}
