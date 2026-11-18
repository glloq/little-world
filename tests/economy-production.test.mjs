import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductionRecipe,newWorkshopState,advanceWorkshop,parseWorkshopState,
  startProduction,collectProduction} from '../src/economy/production.ts';

const flourRecipe={
  recipeId:'mill:flour',version:1,stationType:'mill',
  inputs:[{itemId:'farm:wheat',quantity:3}],
  outputs:[{itemId:'food:flour',quantity:1}],
  durationGameMinutes:5,serviceFeeCoins:2,
};
function bag(start={},capacity={}) {
  const inventory={...start};
  const port={apply(changes){
    const next={...inventory};
    for(const x of changes){
      next[x.itemId]=(next[x.itemId]??0)+x.quantity;
      if(next[x.itemId]<0||next[x.itemId]>(capacity[x.itemId]??9999))return false;
    }
    Object.assign(inventory,next);return true;
  }};
  return {inventory,port};
}
const start=(state,port,requestId='create-1',batches=1,gameMinute=10)=>
  startProduction(state,flourRecipe,{requestId,ownerId:'player-1',batches,gameMinute,queueCapacity:3},port);

test('validate recipes and reject unknown, duplicate and free/invalid outputs',()=>{
  const ids=new Set(['farm:wheat','food:flour']);
  assert.deepEqual(parseProductionRecipe(flourRecipe,ids).outputs,[{itemId:'food:flour',quantity:1}]);
  assert.throws(()=>parseProductionRecipe(flourRecipe,new Set(['farm:wheat'])));
  assert.throws(()=>parseProductionRecipe({...flourRecipe,inputs:[{itemId:'farm:wheat',quantity:3},{itemId:'farm:wheat',quantity:2}]}));
  assert.throws(()=>parseProductionRecipe({...flourRecipe,outputs:[{itemId:'farm:wheat',quantity:5}]}));
  assert.throws(()=>parseProductionRecipe({...flourRecipe,inputs:[{itemId:'farm:wheat',quantity:-3}]}));
  assert.throws(()=>parseProductionRecipe({...flourRecipe,durationGameMinutes:NaN}));
});

test('workshop debits ingredients and fees once, completes by game time, and collects once',()=>{
  const state=newWorkshopState('station:mill','mill'),p=bag({'farm:wheat':9,coin:15});
  const first=start(state,p.port,'create-1',2,10);
  assert.equal(first.ok,true);
  assert.equal(p.inventory['farm:wheat'],3);
  assert.equal(p.inventory.coin,11);
  assert.equal(first.job.finishesAtGameMinute,20);
  assert.equal(state.revision,1);
  assert.equal(start(state,p.port,'create-1',2,10).ok,false,'replayed request does not debit');
  assert.equal(p.inventory['farm:wheat'],3);
  assert.equal(collectProduction(state,{jobId:first.job.jobId,requestId:'collect-1',ownerId:'player-1',gameMinute:19},p.port).ok,false);
  assert.equal(advanceWorkshop(state,20),1);
  assert.equal(state.jobs[0].status,'ready');
  const paid=collectProduction(state,{jobId:first.job.jobId,requestId:'collect-1',ownerId:'player-1',gameMinute:20},p.port);
  assert.equal(paid.ok,true);
  assert.equal(state.jobs[0].status,'collected');
  assert.equal(p.inventory['food:flour'],2);
  assert.equal(collectProduction(state,{jobId:first.job.jobId,requestId:'collect-1',ownerId:'player-1',gameMinute:20},p.port).ok,false);
  assert.equal(p.inventory['food:flour'],2,'never duplicate reward');
  const restored=parseWorkshopState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored,state);
});

test('full output bag leaves ready job intact; collection retry works',()=>{
  const state=newWorkshopState('station:mill','mill');
  const p=bag({'farm:wheat':3,coin:10,'food:flour':4},{'food:flour':4});
  const first=start(state,p.port,'job-one',1,1);
  assert.equal(first.ok,true);
  assert.equal(collectProduction(state,{jobId:first.job.jobId,requestId:'collect-failed',ownerId:'player-1',gameMinute:6},p.port).ok,false);
  assert.equal(state.jobs[0].status,'ready');
  assert.equal(p.inventory['food:flour'],4);
  delete p.inventory['food:flour'];
  assert.equal(collectProduction(state,{jobId:first.job.jobId,requestId:'collect-ok',ownerId:'player-1',gameMinute:6},p.port).ok,true);
  assert.equal(p.inventory['food:flour'],1);
});

test('queue starts subsequent batches at previous finish without ticking per frame',()=>{
  const state=newWorkshopState('station:mill','mill'),p=bag({'farm:wheat':20,coin:40});
  const one=start(state,p.port,'job-1',2,10),two=start(state,p.port,'job-2',1,10);
  assert.equal(one.ok,true);assert.equal(two.ok,true);
  assert.equal(two.job.startsAtGameMinute,20);
  assert.equal(two.job.finishesAtGameMinute,25);
  assert.equal(two.job.status,'queued');
  advanceWorkshop(state,25);
  assert.ok(state.jobs.every(j=>j.status==='ready'));
  assert.throws(()=>advanceWorkshop(state,24),'cannot turn workshop clock backward');
});
