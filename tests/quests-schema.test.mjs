import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuestTemplate,parseQuestGameEvent,parseQuestCommand} from '../src/quests/validation.ts';

const template=()=>({
 id:'quest:fisher-intro',version:1,family:'fishing',difficulty:1,
 titleKey:'quest.fisher.title',descriptionKey:'quest.fisher.description',
 giverRoles:['fisher'],requiredCapabilities:['fishing.spot','equipment.rod'],
 steps:[
  {kind:'talk',npcRole:'fisher'},
  {kind:'acquire',itemId:'fish:trout',quantity:3,source:'fishing'},
  {kind:'deliver',itemId:'fish:trout',quantity:3,giverId:'npc:fisher'},
 ],
 rewardProfileId:'reward:starter-coins',repeatable:false,
});
test('Q1 versioned templates remain declarative, bounded and immutable',()=>{
 const source=template();
 const parsed=parseQuestTemplate(source);
 assert.deepEqual(parsed,source);
 assert.notEqual(parsed,source,'parser must clone authored input');
 parsed.steps[0]={kind:'talk',npcId:'npc:other'};
 assert.equal(source.steps[0].npcRole,'fisher','source template remains untouched');
 assert.throws(()=>parseQuestTemplate({...source,script:'alert(1)'}),/unknown field/);
 assert.throws(()=>parseQuestTemplate({...source,id:'<script>'}),/invalid fields/);
 assert.throws(()=>parseQuestTemplate({...source,difficulty:7}),/invalid fields/);
 assert.throws(()=>parseQuestTemplate({...source,steps:[]}),/invalid fields/);
 assert.throws(()=>parseQuestTemplate({...source,steps:Array.from({length:9},()=>source.steps[0])}),/invalid fields/);
});
test('Q1 steps reject extra fields, unknown kinds and invalid inventory quantities',()=>{
 const base=template();
 for(const steps of [
  [{kind:'talk'}],
  [{kind:'acquire',itemId:'fish:trout',quantity:10000,source:'fishing'}],
  [{kind:'acquire',itemId:'fish:trout',quantity:3,source:'fishing',script:'eval'}],
  [{kind:'deliver',itemId:'fish:trout',quantity:2,giverId:'<script>'}],
  [{kind:'teleport',targetId:'npc:one'}],
  [{kind:'visit',targetId:'zone:home',withinM:Infinity}],
 ])assert.throws(()=>parseQuestTemplate({...base,steps}));
 assert.deepEqual(parseQuestTemplate({...base,steps:[{kind:'visit',targetId:'waterfall:1',withinM:4}]}).steps,
  [{kind:'visit',targetId:'waterfall:1',withinM:4}]);
});
test('Q1 event and command envelopes require stable IDs and bounded provenance',()=>{
 const event={schemaVersion:1,eventId:'event:fish:0001',type:'fishing.caught',
  worldId:'world:1',islandId:'island:1',gameMinute:123,sequence:4,
  actorId:'player:1',itemId:'fish:trout',quantity:2,source:'fishing'};
 assert.deepEqual(parseQuestGameEvent(event),event);
 assert.throws(()=>parseQuestGameEvent({...event,eventId:'<script>'}),/invalid provenance/);
 assert.throws(()=>parseQuestGameEvent({...event,quantity:0}),/invalid provenance/);
 assert.throws(()=>parseQuestGameEvent({...event,script:'emit rewards'}),/unknown field/);
 const command={commandId:'cmd:17',instanceId:'quest:4',type:'claim',actorId:'player:1'};
 assert.deepEqual(parseQuestCommand(command),command);
 assert.throws(()=>parseQuestCommand({...command,type:'grantItems'}),/invalid/);
 assert.throws(()=>parseQuestCommand({...command,quantity:100}),/unknown field/);
});
