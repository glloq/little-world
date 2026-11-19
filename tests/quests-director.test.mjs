import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestDirector} from '../src/quests/director.ts';
const entry=(id)=>({
 questKey:id,templateId:'quest:talk',templateVersion:1,islandId:'island:1',giverId:'npc:1',
 bindings:{},steps:[{kind:'talk',npcId:'npc:1'}],rewards:[],dependencies:[],
 catalogRevision:'rev:1',proof:{capabilityIds:['npc:1'],validatorVersion:'q1'},
});
const event=(id)=>({schemaVersion:1,eventId:id,type:'npc.talked',worldId:'world:1',
 islandId:'island:1',gameMinute:10,sequence:1,targetId:'npc:1'});
test('Q3 director accepts offers, enforces active budget, consumes only matching events',()=>{
 const d=createQuestDirector([entry('quest:b'),entry('quest:a')],{islandId:'island:1',maxActive:1});
 assert.deepEqual(d.offers().map(x=>x.questKey),['quest:a','quest:b']);
 assert.equal(d.accept('quest:a','instance:a',9).status,'active');
 assert.throws(()=>d.accept('quest:b','instance:b',9),/active quest limit/);
 assert.deepEqual(d.consume({...event('foreign'),islandId:'island:2'}),[]);
 assert.deepEqual(d.consume(event('talk:1')),['instance:a']);
 assert.equal(d.get('instance:a').status,'ready');
 assert.deepEqual(d.consume(event('talk:1')),[]);
 assert.equal(d.get('instance:a').rewardClaimId,undefined);
});
test('Q3 snapshot restore validates all instances before commit and isolates caller objects',()=>{
 const d=createQuestDirector([entry('quest:a')],{islandId:'island:1',maxActive:2});
 d.accept('quest:a','instance:a',5);
 const save=d.serialize();
 const other=createQuestDirector([],{islandId:'island:1',maxActive:2});
 other.restore(save);
 save['instance:a'].stepProgress[0]=999;
 assert.equal(other.get('instance:a').stepProgress[0],0);
 assert.throws(()=>other.restore({...other.serialize(),broken:{...other.get('instance:a'),islandId:'elsewhere'}}),/invalid persisted reference/);
 assert.equal(other.get('instance:a').instanceId,'instance:a','failed restore is transactional');
 assert.throws(()=>createQuestDirector([entry('quest:a'),entry('quest:a')],{islandId:'island:1',maxActive:2}),/duplicate/);
});

test('Q4 reward claims are single-use, retryable on full inventory and survive reload',()=>{
 const rewardEntry={...entry('quest:reward'),rewards:[
  {kind:'item',itemId:'acorn',quantity:2},{kind:'coins',quantity:4},
 ]};
 const director=createQuestDirector([rewardEntry],{islandId:'island:1',maxActive:3});
 const i=director.accept('quest:reward','instance:reward',5);
 director.consume(event('talk:reward'));
 assert.equal(director.get(i.instanceId).status,'ready');
 let inventory={acorn:9,coin:0},nativeCalls=0;
 const apply=rewards=>{
  nativeCalls++;
  const ledger={...inventory};
  for(const reward of rewards){
   const itemId=reward.kind==='coins'?'coin':reward.kind==='item'?reward.itemId:null;
   if(!itemId)return false;
   ledger[itemId]=(ledger[itemId]??0)+reward.quantity;
   if(ledger[itemId]>(itemId==='acorn'?9:9999))return false;
  }
  inventory=ledger;return true;
 };
 assert.deepEqual(director.claim(i.instanceId,'claim:1',apply),{ok:false,reason:'failed'});
 assert.equal(inventory.acorn,9);
 assert.equal(director.get(i.instanceId).status,'ready');
 inventory.acorn=7;
 assert.deepEqual(director.claim(i.instanceId,'claim:1',apply),{ok:true,reason:'applied'});
 assert.deepEqual(inventory,{acorn:9,coin:4});
 assert.deepEqual(director.claim(i.instanceId,'claim:2',apply),{ok:false,reason:'claimed'});
 assert.equal(nativeCalls,2,'already claimed never re-enters the inventory port');
 const restored=createQuestDirector([],{islandId:'island:1',maxActive:3});
 restored.restore(director.serialize());
 assert.equal(restored.get(i.instanceId).rewardClaimId,'claim:1');
 assert.equal(restored.claim(i.instanceId,'claim:3',apply).ok,false);
 assert.equal(nativeCalls,2);
});
test('Q4 unsupported cosmetic unlocks cannot partially grant money or items',()=>{
 const director=createQuestDirector([{...entry('quest:unlock'),rewards:[
  {kind:'coins',quantity:30},{kind:'unlock',unlockId:'skin:wave',unlockKind:'glider'},
 ]}],{islandId:'island:1',maxActive:3});
 director.accept('quest:unlock','instance:unlock',5);
 director.consume(event('talk:unlock'));
 let invoked=0;
 assert.deepEqual(director.claim('instance:unlock','claim:unlock',()=>{invoked++;return true;}),
  {ok:false,reason:'unsupported'});
 assert.equal(invoked,0);
 assert.equal(director.get('instance:unlock').status,'ready');
});
