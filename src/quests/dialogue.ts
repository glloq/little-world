/** Optional quest choices layered over existing native dialogue sessions.
 * Never edits authored dialogue lines, gates, actions or persistent choice IDs.
 */
import type {DialogueChoice,DialogueSession} from '../dialogue.ts';
import type {createQuestDirector} from './director.ts';
type Director=ReturnType<typeof createQuestDirector>;
const back:DialogueChoice={text:'Revenir à la conversation'};
export function questDialogueSession(
 base:DialogueSession|undefined,quests:Director,actorId:string,
 gameMinute:()=>number,
 claim:(instanceId:string,claimId:string)=>{ok:boolean;reason:string},
 onChange?:()=>void,
):DialogueSession|undefined{
 const available=()=>quests.offers().filter(e=>e.giverId===actorId&&!quests.get(e.questKey));
 const ready=()=>Object.values(quests.serialize()).filter(i=>i.giverId===actorId&&i.status==='ready')
  .sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
 if(!base&&!available().length&&!ready().length)return undefined;
 let response:string|null=null,closed=false;
 const choices=()=> {
  // Leave space for the resident contextual dialogue choice when available.
  const room=Math.max(0,7-(base?.choices.length??0));
  const offers=available().slice(0,room),claims=ready().slice(0,Math.max(0,room-offers.length));
  return {offers,claims};
 };
 return {
  get line(){
   return response!==null?{id:'quest:response',text:response,choices:[back]}:
    base?.line??{id:'quest:intro',text:'Bonjour !',choices:[]};
  },
  get choices(){
   if(response!==null)return [back];
   const {offers,claims}=choices();
   return [...(base?.choices??[]),
    ...offers.map(o=>({text:'Mission : '+String(o.bindings.title??o.templateId).slice(0,150)})),
    ...claims.map(()=>({text:'Recevoir ma récompense de mission'}))];
  },
  get locked(){return response!==null?[]:base?.locked??[];},
  hint(index){
   if(response!==null)return undefined;
   const baseCount=base?.choices.length??0,{offers,claims}=choices();
   return index<baseCount?base?.hint?.(index):
    index<baseCount+offers.length?'mission':
    index<baseCount+offers.length+claims.length?'récompense':undefined;
  },
  get closed(){return closed||response===null&&!!base?.closed;},
  choose(index:number){
   if(closed||!Number.isInteger(index)||index<0)return false;
   if(response!==null){
    if(index!==0)return false;
    response=null;return true;
   }
   const baseCount=base?.choices.length??0;
   if(index<baseCount)return !!base?.choose(index);
   const {offers,claims}=choices(),offset=index-baseCount;
   if(offset<offers.length){
    const offer=offers[offset];
    try{
     quests.accept(offer.questKey,offer.questKey,gameMinute());
     response='Mission acceptée : '+String(offer.bindings.title??offer.templateId)+'.';
     onChange?.();
    }catch{response='Impossible d’accepter cette mission pour le moment.';}
    return true;
   }
   const item=claims[offset-offers.length];
   if(!item)return false;
   const result=claim(item.instanceId,'claim:'+item.instanceId);
   response=result.ok?'Récompense remise. Merci pour votre aide !':
    'Récompense indisponible : '+(result.reason==='giver-unreachable'?'approchez-vous du personnage.':
      result.reason==='failed'?'votre inventaire est peut-être plein.':'conditions non remplies.');
   if(result.ok)onChange?.();
   return true;
  },
  close(){closed=true;base?.close();},
 };
}
