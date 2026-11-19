import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestDirector} from '../src/quests/director.ts';
import {questDialogueSession} from '../src/quests/dialogue.ts';
import {createDialogue} from '../src/dialogue.ts';
const entry={
 questKey:'quest:dialogue:1',templateId:'resident:introduction',templateVersion:1,
 islandId:'island:1',giverId:'npc:giver',bindings:{title:'Rencontrer le pêcheur'},
 steps:[{kind:'talk',npcId:'npc:target'}],rewards:[{kind:'coins',quantity:3}],
 dependencies:['npc:giver','npc:target'],catalogRevision:'rev:1',
 proof:{capabilityIds:['npc:giver','npc:target'],validatorVersion:'v1'},
};
const base=()=>createDialogue({start:'hello',lines:[{id:'hello',text:'Bonjour',
 choices:[{text:'Mon dialogue personnel',action:{flag:'original',value:true}}]}]},{});
const event={schemaVersion:1,eventId:'npc:talk:1',type:'npc.talked',
 worldId:'world:1',islandId:'island:1',gameMinute:11,sequence:1,targetId:'npc:target'};
test('Q5 PNJ dialogue offers one generated mission and keeps authored choices untouched',()=>{
 const director=createQuestDirector([entry],{islandId:'island:1',maxActive:3});
 const original=base(),q=questDialogueSession(original,director,'npc:giver',()=>10,()=>({ok:false,reason:'failed'}));
 assert.ok(q);
 assert.equal(q.choices.length,2);
 assert.equal(q.hint(1),'mission');
 assert.equal(q.choose(1),true);
 assert.equal(director.get(entry.questKey).status,'active');
 assert.match(q.line.text,/Mission acceptée/);
 assert.equal(q.choose(0),true);
 assert.equal(q.line.text,'Bonjour');
 assert.equal(q.choices.length,1,'offer cannot be accepted twice');
 assert.equal(q.choose(0),true);
 assert.equal(original.closed,true,'native author dialogue still executes');
});
test('Q5 reward choice stays at the giver, cannot grant twice and remains on refusal',()=>{
 const director=createQuestDirector([entry],{islandId:'island:1',maxActive:3});
 director.accept(entry.questKey,entry.questKey,10);
 director.consume(event);
 let attempts=0,successful=false;
 const claim=(id,claimId)=>{attempts++;if(!successful)return {ok:false,reason:'failed'};
  return director.claim(id,claimId,()=>true);
 };
 const q=questDialogueSession(base(),director,'npc:giver',()=>11,claim);
 assert.equal(q.choices.at(-1).text,'Recevoir ma récompense de mission');
 assert.equal(q.choose(1),true);
 assert.match(q.line.text,/inventaire/);
 assert.equal(director.get(entry.questKey).status,'ready');
 assert.equal(q.choose(0),true);
 successful=true;
 assert.equal(q.choose(1),true);
 assert.equal(director.get(entry.questKey).status,'claimed');
 assert.equal(q.choose(0),true);
 assert.equal(q.choices.length,1,'claimed quest no longer offers a reward');
 assert.equal(attempts,2);
});
