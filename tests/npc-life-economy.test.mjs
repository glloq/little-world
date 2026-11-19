import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcWorkshopEconomy} from '../src/npc-life/economy.ts';
import {STARTER_RECIPES} from '../src/economy/starter-catalog.ts';

const job={id:'workshop:one',sourceId:'workshop:one',kind:'amenity',role:'artisan',
 point:{x:10,z:20}};
const limits={'wood:log':999,'material:plank':99,coin:9999};
const make=(save)=>createNpcWorkshopEconomy('npc:artisan','artisan',job,'sawmill',
 STARTER_RECIPES,limits,save);
test('F04 native NPC workshop uses real ingredients and never touches player inventory',()=>{
 const npc=make();const player={'wood:log':9,'material:plank':0};
 assert.equal(npc.start('sawmill:planks',1,10,'start:1').ok,false,
  'NPC cannot mint products without inputs');
 assert.equal(npc.receive('wood:log',2),true);
 assert.equal(npc.receive('coin',1),true,'native service fee needs real funding');
 assert.equal(npc.receive('wood:log',9999),false,'source storage is bounded');
 assert.equal(npc.start('sawmill:planks',1,10,'start:1').ok,true);
 assert.equal(npc.start('sawmill:planks',1,10,'start:1').ok,false);
 assert.equal(npc.inventory()['wood:log'],0);
 assert.equal(npc.jobs()[0].status,'running');
 assert.equal(npc.collect(npc.jobs()[0].jobId,10,'take:early').ok,false);
 npc.advance(16);
 const snapshot=npc.save(),restored=make(snapshot);
 assert.equal(restored.jobs()[0].status,'ready');
 const jobId=restored.jobs()[0].jobId;
 assert.equal(restored.collect(jobId,16,'take:1').ok,true);
 assert.equal(restored.inventory()['material:plank'],4);
 assert.equal(restored.collect(jobId,16,'take:2').ok,false);
 assert.deepEqual(player,{'wood:log':9,'material:plank':0});
});
test('F04 reject wrong source, false owner, forged stocks and output overflow',()=>{
 assert.throws(()=>createNpcWorkshopEconomy('npc:fake','fisher',
  {...job,role:'fisher'},'sawmill',STARTER_RECIPES,limits),/non qualifié/);
 const npc=make();const forged=npc.save();
 assert.throws(()=>make({...forged,workAnchorId:'other'}),/incompatible/);
 assert.throws(()=>make({...forged,stock:{'wood:log':1000}}),/inventaire/);
 assert.throws(()=>make({...forged,workshop:{...forged.workshop,stationId:'forged'}}),/provenance/);
 const limited=createNpcWorkshopEconomy('npc:artisan','artisan',job,'sawmill',
 STARTER_RECIPES,{'wood:log':999,'material:plank':1});
 limited.receive('wood:log',2);
 limited.receive('coin',1);
 limited.start('sawmill:planks',1,10,'begin:1');
 limited.advance(16);
 assert.equal(limited.collect(limited.jobs()[0].jobId,16,'take:full').ok,false);
 assert.equal(limited.jobs()[0].status,'ready','uncredited items are never lost');
});
