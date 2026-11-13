import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../src/gameplay/runtime.ts';
import {parseGameplayData,parseCondition,parseAction,validateInstantEventCycles,gameplayReferences} from '../src/gameplay/schema.ts';
import {makeDoor,makeLever,makeCollect,makeDeliver,makeFish,makePuzzle,makeReaction} from '../src/gameplay/templates.ts';
import {createGameSaveStore,GAME_SAVE_PREFIX,parseGameSave} from '../src/gameplay/save.ts';
const entity=(id,x,state,persistent=Object.keys(state))=>({id,ownerChunkId:x<0?'west':'east',position:{x,y:0,z:0},initialState:state,persistentState:persistent,interactable:{prompt:id,range:5}});
function fixture(){return {worldId:'valley',buildVersion:'build-a',entities:[entity('door',4000,{open:false,temporary:false},['open']),entity('lever',-10,{active:false}),entity('acorn',-10,{collected:false}),entity('villager',-10,{}),entity('pond',-10,{}),entity('puzzle',-10,{})],variables:[{id:'met',scope:'entity',ownerId:'villager',valueType:'boolean',initialValue:false,persistent:true},{id:'weather',scope:'world',valueType:'string',initialValue:'sun',persistent:false},{id:'visits',scope:'zone',ownerId:'west',valueType:'number',initialValue:0,persistent:true}],items:[{id:'acorn',name:'Gland',category:'nature',maxQuantity:9},{id:'fish',name:'Poisson',category:'nature',maxQuantity:9}],objectives:[{id:'delivery',name:'Apporter un gland',initialStatus:'active',persistent:true}],dialogues:[],interactions:[],activities:[]};}
const at={x:-10,y:0,z:0};
test('templates compose collectible, delivery mission and state outside loaded chunks',()=>{
  const source=fixture();source.interactions=[makeCollect('collect','acorn','acorn'),makeDeliver('deliver','villager','acorn','delivery'),makeLever('lever-action','lever','door'),makeReaction('react','door','villager','La porte est ouverte.')];
  const runtime=createGameplay(source);assert.equal(runtime.interact('villager',at),false);
  assert.equal(runtime.interact('acorn',at),true);assert.equal(runtime.state.inventory.acorn,1);assert.equal(runtime.interact('acorn',at),false);
  assert.equal(runtime.interact('villager',at),true);assert.equal(runtime.state.inventory.acorn,0);assert.equal(runtime.state.objectives.delivery,'complete');
  assert.equal(runtime.interact('lever',at),true);assert.equal(runtime.state.entities.door.open,true);
  assert.ok(runtime.drainEffects().some(e=>e.type==='showText'&&e.entityId==='villager'));
  assert.equal(source.entities[0].initialState.open,false);assert.equal(runtime.interact('door',at),false);
});
test('bounded boolean trees gate typed variables, inventory and puzzle sequences',()=>{
  const data=fixture();data.interactions=[makePuzzle('puzzle-action','puzzle','door',[{type:'all',conditions:[{type:'not',condition:{type:'stateEquals',entityId:'door',key:'open',value:true}},{type:'any',conditions:[{type:'variableEquals',variableId:'met',value:true},{type:'hasItem',itemId:'acorn',quantity:1}]}]}]),{id:'meet',trigger:{type:'onEvent',eventId:'meet'},repeat:'once',persistent:true,sequence:[{type:'setVariable',variableId:'met',value:true},{type:'setVariable',variableId:'visits',value:2}]}];
  const runtime=createGameplay(data);assert.equal(runtime.interact('puzzle',at),false);runtime.emit({type:'onEvent',eventId:'meet'});assert.equal(runtime.state.variables.visits,2);assert.equal(runtime.interact('puzzle',at),true);assert.equal(runtime.state.entities.door.open,true);
  const wrong=fixture();wrong.interactions=[{id:'bad',trigger:{type:'onEvent',eventId:'event'},repeat:'once',sequence:[{type:'setVariable',variableId:'met',value:'yes'}]}];assert.throws(()=>parseGameplayData(wrong));
  let condition={type:'hasItem',itemId:'acorn',quantity:1};for(let i=0;i<10;i++)condition={type:'not',condition};assert.throws(()=>parseCondition(condition));
  assert.throws(()=>parseAction({type:'script',source:'alert(1)'}));
});
test('fishing waits resume from a selective game save without mutating authoring state',()=>{
  const data=fixture();data.interactions=[makeFish('fishing','pond','fish',2),makeLever('lever-action','lever','door')];
  const runtime=createGameplay(data);runtime.interact('pond',at);runtime.update(.75);assert.equal(runtime.state.inventory.fish,undefined);
  runtime.interact('lever',at);runtime.state.entities.door.temporary=true;runtime.state.variables.weather='rain';
  const saved=runtime.save('slot-a',at);assert.equal(saved.entities.door.open,true);assert.equal(saved.entities.door.temporary,undefined);assert.equal(saved.variables.weather,undefined);assert.equal(saved.pending.length,1);
  const resumed=createGameplay(data);assert.deepEqual(resumed.restore(saved),[]);assert.equal(resumed.state.entities.door.open,true);assert.equal(resumed.state.entities.door.temporary,false);assert.equal(resumed.state.variables.weather,'sun');resumed.update(1);assert.equal(resumed.state.inventory.fish,undefined);resumed.update(.25);assert.equal(resumed.state.inventory.fish,1);assert.equal(resumed.pendingSequences,0);
  const incompatible=structuredClone(saved);incompatible.worldId='other';assert.throws(()=>resumed.restore(incompatible));
});
test('instant event cycles fail preflight and runtime guards still bound execution',()=>{
  const data=fixture();data.interactions=[{id:'a',trigger:{type:'onEvent',eventId:'a'},sequence:[{type:'emitEvent',eventId:'b'}],repeat:'always'},{id:'b',trigger:{type:'onEvent',eventId:'b'},sequence:[{type:'emitEvent',eventId:'a'}],repeat:'always'}];
  assert.throws(()=>validateInstantEventCycles({interactions:Object.fromEntries(data.interactions.map(i=>[i.id,i]))}));
  const runtime=createGameplay(data);runtime.emit({type:'onEvent',eventId:'a'});assert.ok(runtime.state.metrics.actions<=256);assert.ok(runtime.state.diagnostics.length>0);
  data.interactions[1].sequence.unshift({type:'wait',seconds:1});assert.doesNotThrow(()=>validateInstantEventCycles({interactions:Object.fromEntries(data.interactions.map(i=>[i.id,i]))}));
});
test('declarative dialogue choices gate shared variables and run typed consequences',()=>{
  const data=fixture();data.dialogues=[{id:'talk',actorId:'villager',start:'hello',lines:[{id:'hello',text:'Bonjour',choices:[{id:'accept',text:'Je vais aider.',gate:{type:'not',condition:{type:'variableEquals',variableId:'met',value:true}},actions:[{type:'setVariable',variableId:'met',value:true},{type:'giveItem',itemId:'acorn',quantity:1}]}]}]}];
  const runtime=createGameplay(data);assert.equal(runtime.availableChoices('talk','hello').length,1);assert.equal(runtime.dialogueChoice('talk','hello','accept'),null);assert.equal(runtime.state.inventory.acorn,1);assert.equal(runtime.availableChoices('talk','hello').length,0);assert.equal(runtime.dialogueChoice('talk','hello','accept'),undefined);
});
test('cooldown and wait timing remain independent of presentation frequency',()=>{
  for(const hz of [20,30,60]){const d=fixture();d.interactions=[makeFish('fishing','pond','fish',1)];const runtime=createGameplay(d);assert.equal(runtime.interact('pond',at),true);assert.equal(runtime.interact('pond',at),false);for(let i=0;i<hz;i++)runtime.update(1/hz);assert.equal(runtime.state.inventory.fish,1);}
});
test('save slots use a separate namespace and corrupted slots remain diagnosable',async()=>{
  const values=new Map([['little-world-editor','authoring-unchanged']]);const storage={get length(){return values.size;},key(i){return [...values.keys()][i]??null;},getItem(k){return values.get(k)??null;},setItem(k,v){values.set(k,v);},removeItem(k){values.delete(k);}};
  const store=createGameSaveStore(storage),runtime=createGameplay(fixture());await store.save(runtime.save('one',at));runtime.state.inventory.acorn=2;await store.save(runtime.save('two',at));assert.equal((await store.list('valley')).length,2);assert.equal((await store.load('valley','one')).inventory.acorn,undefined);assert.equal((await store.load('valley','two')).inventory.acorn,2);assert.equal(values.get('little-world-editor'),'authoring-unchanged');
  values.set(GAME_SAVE_PREFIX+'valley:broken','{');assert.ok((await store.list('valley')).find(s=>s.slotId==='broken').error);assert.equal(values.get(GAME_SAVE_PREFIX+'valley:broken'),'{');await store.delete('valley','one');assert.equal(await store.load('valley','one'),null);assert.equal(values.get('little-world-editor'),'authoring-unchanged');
  const bad=runtime.save('bad',at);bad.position.x=Infinity;assert.throws(()=>parseGameSave(bad));
});
test('dependency extraction includes cross-sector entity and registry links',()=>{
  const interactions={a:makeLever('a','lever','door')},references=gameplayReferences({interactions});assert.ok(references.some(r=>r.sourceId==='a'&&r.targetId==='door'&&r.kind==='entity'));
});
test('logical index metadata supports actions while every source chunk is unloaded',async()=>{
  const {gameplayDataFromProject}=await import('../src/gameplay/project-adapter.ts');const data=fixture();data.interactions=[makeLever('lever-action','lever','door')];
  const project={manifest:{revision:2},world:{worldId:data.worldId},entityIndex:Object.fromEntries(data.entities.map(e=>[e.id,{id:e.id,ownerChunkId:e.ownerChunkId,position:e.position,logical:{initialState:e.initialState,persistentState:e.persistentState,interactable:e.interactable}}])),chunks:{},libraries:Object.fromEntries(['variables','interactions','items','objectives','dialogues','activities'].map(key=>[key,Object.fromEntries(data[key].map(item=>[item.id,item]))]))};
  const runtime=createGameplay(gameplayDataFromProject(project));assert.equal(runtime.interact('lever',at),true);assert.equal(runtime.state.entities.door.open,true);assert.deepEqual(project.chunks,{});
});
test('full inventory leaves a collectible available for a later successful attempt',()=>{
  const d=fixture();d.interactions=[makeCollect('collect','acorn','acorn')];const runtime=createGameplay(d);runtime.state.inventory.acorn=9;assert.equal(runtime.interact('acorn',at),true);assert.equal(runtime.state.entities.acorn.collected,false);runtime.state.inventory.acorn=8;runtime.interact('acorn',at);assert.equal(runtime.state.entities.acorn.collected,true);assert.equal(runtime.state.inventory.acorn,9);
});
