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
 deliver?:(instanceId:string,targetId:string)=>{ok:boolean;reason:string},
 onChange?:()=>void,
):DialogueSession|undefined{
 const available=()=>quests.offers().filter(e=>e.giverId===actorId&&!quests.get(e.questKey));
 const deliveries=()=>Object.values(quests.serialize()).filter(i=>i.status==='active'&&
  i.steps[i.stepIndex]?.kind==='deliver'&&
  (i.steps[i.stepIndex] as {giverId?:string}).giverId===actorId).sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
 const ready=()=>Object.values(quests.serialize()).filter(i=>i.giverId===actorId&&i.status==='ready')
  .sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
 if(!base&&!available().length&&!ready().length&&!deliveries().length)return undefined;
 let response:string|null=null,closed=false;
 const choices=()=> {
  // Leave space for the resident contextual dialogue choice when available.
  const room=Math.max(0,7-(base?.choices.length??0));
  const claims=ready().slice(0,room),delivery=deliveries().slice(0,Math.max(0,room-claims.length)),
    offers=available().slice(0,Math.max(0,room-claims.length-delivery.length));
  return {offers,claims,delivery};
 };
 return {
  get line(){
   return response!==null?{id:'quest:response',text:response,choices:[back]}:
    base?.line??{id:'quest:intro',text:'Bonjour !',choices:[]};
  },
  get choices(){
   if(response!==null)return [back];
   const {offers,claims,delivery}=choices();
   return [...(base?.choices??[]),
    ...offers.map(o=>({text:'Mission : '+String(o.bindings.title??o.templateId).slice(0,150)})),
    ...claims.map(()=>({text:'Recevoir ma récompense de mission'})),
    ...delivery.map(()=>({text:'Livrer les objets demandés'}))];
  },
  get locked(){return response!==null?[]:base?.locked??[];},
  hint(index){
   if(response!==null)return undefined;
   const baseCount=base?.choices.length??0,{offers,claims,delivery}=choices();
   return index<baseCount?base?.hint?.(index):
    index<baseCount+offers.length?'mission':
    index<baseCount+offers.length+claims.length?'récompense':
    index<baseCount+offers.length+claims.length+delivery.length?'mission':undefined;
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
   const {offers,claims,delivery}=choices(),offset=index-baseCount;
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
   if(!item){
    const shipment=delivery[offset-offers.length-claims.length];
    if(!shipment||!deliver)return false;
    const result=deliver(shipment.instanceId,actorId);
    response=result.ok?'Livraison enregistrée. Merci !':
      'Livraison impossible : '+(result.reason==='missing-items'?'les objets demandés manquent.':
        result.reason==='giver-unreachable'?'approchez-vous du personnage.':'conditions non remplies.');
    if(result.ok)onChange?.();
    return true;
   }
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
