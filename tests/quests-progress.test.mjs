import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptQuest,advanceQuest} from '../src/quests/progress.ts';
const offer={
 questKey:'quest:fisher:1',templateId:'quest:fisher',templateVersion:1,
 islandId:'island:1',giverId:'npc:fisher',bindings:{},catalogRevision:'rev:1',
 steps:[{kind:'talk',npcId:'npc:fisher'},{kind:'acquire',itemId:'fish:trout',quantity:3,source:'fishing'},
   {kind:'deliver',itemId:'fish:trout',quantity:3,giverId:'npc:fisher'}],
 rewards:[{kind:'coins',quantity:5}],dependencies:[],
 proof:{capabilityIds:['npc:fisher','fishing.spot'],validatorVersion:'q1'},
};
const event=(id,type,extra={})=>({
 schemaVersion:1,eventId:id,type,worldId:'world:1',islandId:'island:1',
 gameMinute:10,sequence:1,...extra,
});
test('Q3 ordered native events advance counters without granting rewards',()=>{
 const original=acceptQuest(offer,'instance:1',10);
 assert.equal(original.status,'active');
 assert.equal(original.stepIndex,0);
 const buy=advanceQuest(original,event('buy:1','market.traded',{itemId:'fish:trout',quantity:3}));
 assert.equal(buy.applied,false);
 const fishingTooEarly=advanceQuest(original,event('catch:1','fishing.caught',{itemId:'fish:trout',quantity:3}));
 assert.equal(fishingTooEarly.applied,false);
 const greeting=advanceQuest(original,event('talk:1','npc.talked',{targetId:'npc:fisher'}));
 assert.equal(greeting.applied,true);
 assert.equal(greeting.instance.stepIndex,1);
 assert.equal(original.stepIndex,0,'previous state must remain immutable');
 let state=greeting.instance;
 const bought=advanceQuest(state,event('buy:2','market.traded',{itemId:'fish:trout',quantity:99}));
 assert.equal(bought.applied,false,'purchase must not count as fishing');
 let catchOne=advanceQuest(state,event('catch:1','fishing.caught',{itemId:'fish:trout',quantity:2}));
 assert.equal(catchOne.applied,true);
 assert.equal(catchOne.instance.stepProgress[1],2);
 assert.equal(advanceQuest(catchOne.instance,event('catch:1','fishing.caught',{itemId:'fish:trout',quantity:2})).reason,'duplicate');
 state=advanceQuest(catchOne.instance,event('catch:2','fishing.caught',{itemId:'fish:trout',quantity:1})).instance;
 assert.equal(state.stepIndex,2);
 assert.equal(state.status,'active');
 const unsolicited=advanceQuest(state,event('talk:2','npc.talked',{targetId:'npc:fisher'}));
 assert.equal(unsolicited.applied,false);
 const delivery=advanceQuest(state,event('deliver:1','quest.delivered',{itemId:'fish:trout',quantity:3,targetId:'npc:fisher'}));
 assert.equal(delivery.instance.status,'ready');
 assert.equal(delivery.instance.stepIndex,3);
 assert.deepEqual(delivery.instance.rewards,[{kind:'coins',quantity:5}]);
 assert.equal(advanceQuest(delivery.instance,event('deliver:2','quest.delivered',{itemId:'fish:trout',quantity:3,targetId:'npc:fisher'})).reason,'not-active');
});
test('Q3 rejects other island, earlier commits, duplicate IDs and fake animation success',()=>{
 const state=acceptQuest(offer,'instance:2',100);
 assert.equal(advanceQuest(state,event('other:1','npc.talked',{targetId:'npc:fisher',islandId:'island:2',gameMinute:101})).reason,'wrong-island');
 assert.equal(advanceQuest(state,event('past:1','npc.talked',{targetId:'npc:fisher',gameMinute:99})).reason,'past');
 assert.equal(advanceQuest(state,event('gesture:1','npc.fish-animation',{targetId:'npc:fisher',gameMinute:101})).reason,'not-matched');
 assert.throws(()=>advanceQuest(state,{...event('corrupt','npc.talked',{targetId:'npc:fisher'}),quantity:-1}));
});
test('Q3 refuses premature claims: director only prepares a ready state',()=>{
 let state=acceptQuest({...offer,steps:[{kind:'visit',targetId:'zone:harbor',withinM:5}]},'instance:3',10);
 const result=advanceQuest(state,event('visit:1','location.visited',{targetId:'zone:harbor',distanceM:3}));
 assert.equal(result.instance.status,'ready');
 assert.equal(result.instance.rewardClaimId,undefined);
 state=result.instance;
 assert.equal(advanceQuest(state,event('visit:1','location.visited',{targetId:'zone:harbor',distanceM:3})).reason,'duplicate');
});
