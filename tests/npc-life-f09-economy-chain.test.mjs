import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcHarvestAccount} from '../src/npc-life/harvest-ledger.ts';
import {createNpcWorkshopEconomy} from '../src/npc-life/economy.ts';
import {transferNativeRawMaterial} from '../src/npc-life/raw-transfers.ts';
import {STARTER_RECIPES} from '../src/economy/starter-catalog.ts';
import {createIslandMarkets,marketUnitPrices} from '../src/economy/island-markets.ts';
const limits={'farm:wheat':999,'wood:log':999,'material:flour':99,coin:9999};
test('F09-E authentic farmer wheat reaches nearby funded mill and yields flour only after native craft',()=>{
 const harvest=createNpcHarvestAccount('npc:farmer','plot:1','farmer',limits);
 const mill=createNpcWorkshopEconomy('npc:miller','miller',
  {id:'mill:1',sourceId:'mill:1',kind:'amenity',role:'miller',point:{x:7,z:2}},
  'mill',STARTER_RECIPES,limits);
 assert.equal(harvest.commitHarvest('harvest:1','farm:wheat',3,10),true);
 const farmer={x:1,z:1},miller={x:7,z:2};
 assert.equal(transferNativeRawMaterial(harvest,mill,'farm:wheat',3,farmer,{x:90,z:0}),false);
 assert.equal(transferNativeRawMaterial(harvest,mill,'farm:wheat',3,farmer,miller),true);
 assert.equal(transferNativeRawMaterial(harvest,mill,'farm:wheat',3,farmer,miller),false);
 assert.equal(harvest.inventory()['farm:wheat'],0);
 assert.equal(mill.inventory()['farm:wheat'],3);
 assert.equal(mill.start('mill:wheat-flour',1,11,'mill:job:1').ok,false,
  'raw ingredients alone do not create free flour without a real coin fee');
 assert.equal(mill.receive('coin',1),true);
 assert.equal(mill.start('mill:wheat-flour',1,11,'mill:job:1').ok,true);
 mill.advance(16);
 assert.equal(mill.collect(mill.jobs()[0].jobId,16,'collect:1').ok,true);
 assert.equal(mill.inventory()['material:flour'],1);
 assert.equal(mill.inventory()['farm:wheat'],0);
});
test('F09-E fish reach real port market and buy actual coins without affecting player purse',()=>{
 const purse={count:()=>0,max:()=>9999,apply:()=>{throw Error('NPC sale must not touch player bag');}};
 const markets=createIslandMarkets({islandId:'volcano-island',purse,
  itemName:id=>id,gameMinute:()=>60,onChange:()=>{}});
 const worker=createNpcHarvestAccount('npc:fisher','dock:1','fisher',
  {'fish:trout':99,coin:9999});
 assert.equal(worker.commitHarvest('catch:1','fish:trout',3,30),true);
 const cash=marketUnitPrices('volcano-island','fish:trout').sell;
 assert.ok(cash>0);
 const before=markets.view('port','port:1');
 assert.equal(markets.supplyFromNpc('port','port:1','fish:trout',2,worker,'fish-sale:1'),true);
 assert.equal(worker.inventory()['fish:trout'],1);
 assert.equal(worker.inventory().coin,2*cash);
 const after=markets.view('port','port:1');
 assert.equal(after.cashCoins,before.cashCoins-2*cash);
 assert.equal(markets.supplyFromNpc('port','port:1','fish:trout',2,worker,'fish-sale:1'),false);
 assert.equal(markets.supplyFromNpc('forest','forest:1','fish:trout',1,worker,'wrong-market'),false);
 assert.equal(worker.inventory().coin,2*cash);
 assert.equal(after.revision,1);
});
