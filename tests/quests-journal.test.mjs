import test from 'node:test';
import assert from 'node:assert/strict';
import {questViewModel} from '../src/ui/journal/journal.ts';
import {acceptQuest,advanceQuest} from '../src/quests/progress.ts';
const catalog={questKey:'quest:one',templateId:'resident:introduction',templateVersion:1,
 islandId:'island:1',giverId:'npc:a',bindings:{title:'Faire connaissance avec B'},
 steps:[{kind:'talk',npcId:'npc:b'}],rewards:[],dependencies:[],
 catalogRevision:'v1',proof:{capabilityIds:['npc:a','npc:b'],validatorVersion:'v1'}};
test('Q5 generated quest appears in the same journal without changing old objectives',()=>{
 const legacy=[{id:'legacy',name:'Mission historique',initialStatus:'active',persistent:true}];
 const state=acceptQuest(catalog,'quest:one',0);
 const first=questViewModel(legacy,{legacy:'active'},[],[state]);
 assert.equal(first.active.length,2);
 assert.equal(first.active[0].name,'Mission historique');
 assert.equal(first.active[1].name,'Faire connaissance avec B');
 const finished=advanceQuest(state,{schemaVersion:1,eventId:'event:1',type:'npc.talked',
  worldId:'w',islandId:'island:1',gameMinute:1,sequence:1,targetId:'npc:b'}).instance;
 const vm=questViewModel(legacy,{legacy:'active'},[],[finished]);
 assert.equal(vm.active[1].status,'active');
 assert.match(vm.active[1].description,/Retournez voir le donneur/);
 const claimed=questViewModel(legacy,{legacy:'active'},[],[{...finished,status:'claimed',rewardClaimId:'claim:1'}]);
 assert.equal(claimed.completed.length,1);
 assert.equal(claimed.hiddenCount,0);
});
