import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcHarvestDriver} from '../src/npc-life/harvest-runtime.ts';
import {createFishPopulation} from '../src/npc-life/fish-population.ts';
test('F09-F 100 residents compile into at most 32 qualified producers and one native action per cadence',()=>{
 const calls=[],npcs=Array.from({length:100},(_,i)=>({
   definition:{id:'farmer:'+i,routine:{role:'farmer',workAnchorId:'farm:'+i,
     work:{x:i*2,z:0}}},phase:'work',x:i*2,y:0,z:0,
 }));
 const farms=npcs.map((n,i)=>({id:'farm:'+i,farm:{assignment:'npc'}}));
 const driver=createNpcHarvestDriver({
   limits:{'farm:wheat':999},zones:{mines:[],farms},
   activities:{npcFarmAct:(id,request)=>{
     calls.push([id,request]);return {ok:true,action:'plant'};
   }},
   gathering:null,fishPopulation:createFishPopulation(),height:()=>0,
   anchor:id=>{const i=Number(id.slice(5));return {x:i*2,z:0};},
   shore:()=>null,
 });
 driver.install(npcs);
 assert.equal(driver.size,32);
 const snapshot=driver.serialize();
 const pending=createNpcHarvestDriver({
   limits:{'farm:wheat':999},zones:{mines:[],farms},
   activities:{npcFarmAct:()=>({ok:true,action:'plant'})},
   gathering:null,fishPopulation:createFishPopulation(),height:()=>0,
   anchor:id=>({x:Number(id.slice(5))*2,z:0}),shore:()=>null,
 });
 pending.restore(snapshot);
 assert.deepEqual(pending.serialize(),snapshot,
  'save before actor attach must not discard accepted source accounts');
 pending.install(npcs);
 assert.deepEqual(pending.serialize(),snapshot);
 assert.equal(driver.tick(1),0);
 assert.equal(driver.tick(5),0);
 assert.equal(calls.length,32);
 assert.equal(driver.tick(5),0);
 assert.equal(calls.length,32,'same minute cannot reissue work');
 assert.equal(driver.tick(6),0);
 assert.equal(calls.length,32);
 assert.equal(driver.tick(10),0);
 assert.equal(calls.length,64,'at most one action per qualified worker every 5 minutes');
 assert.deepEqual(Object.keys(driver.serialize()).length,32);
});
