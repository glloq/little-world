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
