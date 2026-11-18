import test from 'node:test';
import assert from 'node:assert/strict';
import {ECONOMY_ITEMS} from '../src/gameplay/economy.ts';
import {PRODUCTION_ITEMS} from '../src/economy/starter-catalog.ts';
import {workshopStationId,createShopWorkshops} from '../src/economy/workshop-services.ts';
import {parseGameSave,createGameSaveStore} from '../src/gameplay/save.ts';
import {memoryBlobStore} from '../src/gameplay/save-blobs.ts';
import {foodGasValue} from '../src/gameplay/food-effects.ts';

function bag(initial={},limits={}){
  const inv={...initial};
  const max=(id)=>limits[id]??[...ECONOMY_ITEMS,...PRODUCTION_ITEMS].find(i=>i.id===id)?.maxQuantity??999;
  return {inv,count:id=>inv[id]??0,max,apply:changes=>{
    const next={...inv};
    for(const c of changes){
      next[c.itemId]=(next[c.itemId]??0)+c.quantity;
      if(!Number.isInteger(next[c.itemId])||next[c.itemId]<0||next[c.itemId]>max(c.itemId))return false;
    }
    Object.assign(inv,next);return true;
  }};
}
function service(purse){
  let time=10,changes=0;
  const make=()=>createShopWorkshops({
    items:[...ECONOMY_ITEMS,...PRODUCTION_ITEMS],
    purse,elapsedSeconds:()=>time,dayLengthSeconds:1440,
    onChange:()=>{changes++;},
  });
  return {make,setTime:t=>{time=t;},get changes(){return changes;}};
}
function storage(){const m=new Map();return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,
  getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
const baseSave=()=>({schemaVersion:2,worldId:'island-forest',worldBuildVersion:'v1',slotId:'slot-1',
  savedAt:1000,time:10,position:{x:0,y:0,z:0},inventory:{coin:15},variables:{},objectives:{},
  entities:{},executed:{},cooldowns:{},dialogueFlags:{},pending:[],mines:{},farms:{}});

test('each real counter owns only its own jobs, with no 3D world or server',()=>{
  const money=bag({coin:20,'wood:log':4});
  const env=service(money),a=env.make(),forest='counter:forest-1';
  assert.equal(a.list('forest',forest).length,2);
  assert.equal(a.list('market',forest).length,2);
  assert.notEqual(workshopStationId(forest,'sawmill'),workshopStationId('counter:forest-2','sawmill'));
  const started=a.start('forest',forest,'sawmill:planks',1,'req-first');
  assert.equal(started.ok,true);
  assert.equal(money.inv['wood:log'],2);assert.equal(money.inv.coin,19);
  assert.equal(a.start('forest',forest,'sawmill:planks',1,'req-first').ok,false,'request replay');
  assert.equal(a.start('port',forest,'sawmill:planks',1,'bad-station').ok,false,'wrong station');
  const first=a.list('forest',forest).find(x=>x.stationType==='sawmill');
  assert.equal(first.jobs.length,1);
  assert.equal(a.list('forest','counter:forest-2').find(x=>x.stationType==='sawmill').jobs.length,0);
  assert.equal(first.jobs[0].status,'running');

  env.setTime(16);a.advanceDue();
  const job=a.list('forest',forest).find(x=>x.stationType==='sawmill').jobs[0];
  assert.equal(job.status,'ready');
  const wrong=a.collect('forest','counter:forest-2',job.jobId,'take-wrong');
  assert.equal(wrong.ok,false);
  const claimed=a.collect('forest',forest,job.jobId,'take-1');
  assert.equal(claimed.ok,true);
  assert.equal(money.inv['material:plank'],4);
  assert.equal(a.collect('forest',forest,job.jobId,'take-1').ok,false,'no duplicate outputs');
  assert.equal(env.changes>0,true);
});

test('unfinished jobs persist in game saves and complete after a game-time jump',async()=>{
  const money=bag({coin:20,'wood:log':6}),env=service(money),a=env.make();
  const launched=a.start('forest','counter:forest-1','sawmill:planks',1,'craft-save');
  assert.equal(launched.ok,true);
  const state=a.serialize();
  const save=baseSave();save.workshops=state;
  const parsed=parseGameSave(save);
  assert.ok(parsed.workshops[Object.keys(state)[0]]);
  const slots=createGameSaveStore(storage(),memoryBlobStore());
  await slots.save(save);
  const reloaded=await slots.load('island-forest','slot-1');
  assert.deepEqual(reloaded.workshops,JSON.parse(JSON.stringify(state)));

  const b=env.make();b.restore(reloaded.workshops);
  env.setTime(17);b.advanceDue();
  const job=b.list('forest','counter:forest-1').find(x=>x.stationType==='sawmill').jobs[0];
  assert.equal(job.status,'ready');
  assert.equal(b.collect('forest','counter:forest-1',job.jobId,'take-after-load').ok,true);
  assert.equal(money.inv['material:plank'],4);
  assert.equal(b.collect('forest','counter:forest-1',job.jobId,'take-after-load').ok,false);
  assert.throws(()=>parseGameSave({...save,workshops:{different:Object.values(state)[0]}}),/incohérente/);
  assert.deepEqual(parseGameSave({...save,workshops:undefined}).workshops,{},'old saves are accepted');
});

test('full bag preserves the finished output at its original workshop',()=>{
  const money=bag({coin:10,'wood:log':2,'material:plank':999}),env=service(money),a=env.make();
  assert.equal(a.start('forest','a','sawmill:planks',1,'r1').ok,true);
  env.setTime(17);a.advanceDue();
  const job=a.list('forest','a').find(x=>x.stationType==='sawmill').jobs[0];
  assert.equal(a.collect('forest','a',job.jobId,'try-full').ok,false);
  assert.equal(a.list('forest','a').find(x=>x.stationType==='sawmill').jobs[0].status,'ready');
  delete money.inv['material:plank'];
  assert.equal(a.collect('forest','a',job.jobId,'try-again').ok,true);
  assert.equal(money.inv['material:plank'],4);
});

test('new foods are explicitly edible but unknown forage is not',()=>{
  assert.ok(foodGasValue('food:bread')>0);
  assert.ok(foodGasValue('food:jam')>0);
  assert.ok(foodGasValue('food:soup')>0);
  assert.equal(foodGasValue('forage:mushroom'),0);
});
