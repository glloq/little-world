import type {DialogueSession} from '../dialogue.ts';
import type {GameplayRuntime} from './runtime.ts';
/** Same dialogue panel and rig expressions; V3 consequences stay in the logical engine. */
export function gameplayDialogueSession(runtime:GameplayRuntime,actorId:string):DialogueSession|undefined {
 const linked=runtime.data.entities.find(e=>e.id===actorId)?.dialogueIds,graph=linked?runtime.data.dialogues.find(d=>d.id===linked[0]):runtime.data.dialogues.find(d=>d.actorId===actorId);if(!graph)return;
 let current=graph.start,closed=false;runtime.enterDialogueLine(graph.id,current);
 return {
  get line(){return graph.lines.find(l=>l.id===current)!;},
  get choices(){return runtime.availableChoices(graph.id,current);},get closed(){return closed;},
  choose(index){if(closed)return false;const line=graph.lines.find(l=>l.id===current)!,choice=runtime.availableChoices(graph.id,current)[index];if(!choice)return false;
   const id=choice.id??current+':'+line.choices.indexOf(choice),next=runtime.dialogueChoice(graph.id,current,id);if(next===undefined)return false;if(next===null)closed=true;else{current=next;runtime.enterDialogueLine(graph.id,current);}return true;
  },close(){closed=true;}
 };
}
