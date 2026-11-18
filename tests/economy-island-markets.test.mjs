import test from 'node:test';
import assert from 'node:assert/strict';
import {COIN,ECONOMY_ITEMS,SHOPS} from '../src/gameplay/economy.ts';
import {PRODUCTION_ITEMS} from '../src/economy/starter-catalog.ts';
import {marketCatalog,marketUnitPrices,newMarketState,marketView,advanceMarket,
  parseMarketState,executeMarketTrade,createIslandMarkets} from '../src/economy/island-markets.ts';
import {parseGameSave,createGameSaveStore} from '../src/gameplay/save.ts';
import {memoryBlobStore} from '../src/gameplay/save-blobs.ts';

const known=[...ECONOMY_ITEMS,...PRODUCTION_ITEMS];
function bag(initial={},limits={}){
  const inv={...initial};
  const max=itemId=>limits[itemId]??known.find(x=>x.id===itemId)?.maxQuantity??999;
  return {inv,count:id=>inv[id]??0,max,apply:changes=>{
    const next={...inv};
    for(const row of changes){
      const n=(next[row.itemId]??0)+row.quantity;
      if(!Number.isSafeInteger(n)||n<0||n>max(row.itemId))return false;
      next[row.itemId]=n;
    }
    Object.assign(inv,next);return true;
  }};
}
const make=(islandId,purse,clock=()=>0)=>createIslandMarkets({
  islandId,purse,itemName:id=>known.find(x=>x.id===id)?.name??id,
  gameMinute:clock,onChange:()=>{},
});
const trade=(s,mode,itemId,quantity,purse,requestId,expectedRevision)=>
  executeMarketTrade(s,{shopId:s.shopId,shopKind:s.shopKind,islandId:s.islandId,
    mode,itemId,quantity,requestId,expectedRevision},purse);
function memoryStorage(){const s=new Map();return {
  get length(){return s.size;},key:i=>[...s.keys()][i]??null,
  getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k),
};}
const blankSave=()=>({schemaVersion:2,worldId:'w',worldBuildVersion:'b',slotId:'slot-1',savedAt:1000,
  time:360,position:{x:0,y:0,z:0},inventory:{coin:200},variables:{},objectives:{},
  entities:{},executed:{},cooldowns:{},dialogueFlags:{},pending:[],mines:{},farms:{},workshops:{}});

test('all market counters have finite physical stock and realistic priced offers',()=>{
  for(const kind of Object.keys(SHOPS)){
    const s=newMarketState('counter:'+kind,'volcano-island',kind,0),v=marketView(s);
    assert.equal(v.cashCoins,2000);
    assert.ok(v.buy.length>0&&v.sell.length>0);
    for(const row of v.buy)assert.ok(row.available>0&&Number.isInteger(row.unitPrice));
    for(const row of v.sell)assert.ok(row.unitPrice>0);
    assert.deepEqual(parseMarketState(JSON.parse(JSON.stringify(s))),JSON.parse(JSON.stringify(s)));
    assert.equal(marketCatalog(kind).sells.length,new Set(marketCatalog(kind).sells).size);
  }
  assert.ok(marketCatalog('forest').sells.includes('material:plank'));
  assert.ok(marketCatalog('market').buys.includes('material:plank'));
  assert.ok(marketCatalog('inn').buys.includes('food:soup'));
});

test('buying stock and selling crafted objects is atomic and replay-safe',()=>{
  const s=newMarketState('camp:forest','volcano-island','forest'),p=bag({coin:200,'material:plank':4});
  const price=marketUnitPrices('volcano-island','material:plank').sell;
  const original=s.stock['material:plank'];
  const result=trade(s,'sell','material:plank',4,p,'sell-1',0);
  assert.equal(result.ok,true);
  assert.equal(p.inv['material:plank'],0);assert.equal(p.inv.coin,200+price*4);
  assert.equal(s.stock['material:plank'],original+4);
  assert.equal(s.cashCoins,2000-price*4);
  assert.equal(trade(s,'sell','material:plank',4,p,'sell-1').ok,false,'no duplicate resale');
  const outdated=trade(s,'buy','material:plank',1,p,'buy-stale',0);
  assert.equal(outdated.ok,false,'stale revision rejected');
  const bought=trade(s,'buy','material:plank',1,p,'buy-1',s.revision);
  assert.equal(bought.ok,true);assert.equal(p.inv['material:plank'],1);
  assert.equal(s.stock['material:plank'],original+3);
  assert.equal(trade(s,'buy','material:plank',1,p,'buy-1').ok,false,'no double charge');
});

test('insufficient merchant budget, full bag and depleted stock never confiscate inventory',()=>{
  const s=newMarketState('camp:forest','volcano-island','forest'),
    p=bag({coin:100,'wood:log':15,'material:plank':4});
  s.cashCoins=1;
  const stateBefore=structuredClone(s),bagBefore={...p.inv};
  assert.equal(trade(s,'sell','material:plank',4,p,'no-money').ok,false);
  assert.deepEqual(s,stateBefore);assert.deepEqual(p.inv,bagBefore);
  s.cashCoins=2000;s.stock['material:plank']=0;
  assert.equal(trade(s,'buy','material:plank',1,p,'no-stock').ok,false);
  assert.equal(p.inv.coin,100);
  const maxed=bag({coin:100,'material:plank':999});
  s.stock['material:plank']=4;
  assert.equal(trade(s,'buy','material:plank',1,maxed,'full-stack').ok,false);
  const rich=bag({coin:9990,'material:plank':4});
  assert.equal(trade(s,'sell','material:plank',4,rich,'full-wallet').ok,false);
  assert.equal(rich.inv['material:plank'],4);
  assert.equal(trade(s,'sell','material:plank',0,p,'bad-quantity').ok,false);
  assert.equal(trade(s,'sell','material:plank',Infinity,p,'bad-amount').ok,false);
});

test('island prices allow bounded maritime profit on manufactured goods, not same-counter flipping',()=>{
  const forest=marketUnitPrices('forest-valley','material:plank');
  const volcano=marketUnitPrices('volcano-island','material:plank');
  assert.ok(forest.buy<volcano.sell,'planks from forest can be resold at volcano for profit');
  assert.ok(forest.buy>forest.sell,'no same-island buy and resale profit');
  assert.ok(volcano.buy>volcano.sell,'no same-island buy and resale profit');
  const player=bag({coin:100});
  const src=newMarketState('forest-1','forest-valley','forest');
  const dst=newMarketState('market-1','volcano-island','market');
  assert.equal(trade(src,'buy','material:plank',3,player,'f-buy').ok,true);
  const expense=100-player.inv.coin;
  assert.equal(trade(dst,'sell','material:plank',3,player,'v-sell').ok,true);
  assert.ok(player.inv.coin>100);
  assert.equal(player.inv.coin-100,3*(volcano.sell-forest.buy));
  assert.equal(expense,3*forest.buy);
});

test('market state round-trips via V2 save and remains scoped to its island',async()=>{
  const player=bag({coin:250,'material:plank':3});
  const a=make('forest-valley',player);
  const first=a.view('forest','forest-counter-1');
  assert.equal(a.trade('forest','forest-counter-1','material:plank',2,'sell','req-a',first.revision).ok,true);
  const serialized=a.serialize(),save=blankSave();save.markets=serialized;save.inventory={...player.inv};
  const storage=memoryStorage(),slots=createGameSaveStore(storage,memoryBlobStore());
  await slots.save(save);
  const loaded=await slots.load('w','slot-1');
  assert.deepEqual(loaded.markets,JSON.parse(JSON.stringify(serialized)));
  const restored=make('forest-valley',player);
  restored.restore(loaded.markets);
  assert.deepEqual(restored.serialize(),JSON.parse(JSON.stringify(serialized)));
  assert.equal(restored.trade('forest','forest-counter-1','material:plank',2,'sell','req-a').ok,false);
  const other=make('volcano-island',player);
  assert.throws(()=>other.restore(loaded.markets),/autre île/);
  assert.deepEqual(parseGameSave({...save,markets:undefined}).markets,{},'V1/V2 slots without markets still load');
  assert.throws(()=>parseGameSave({...save,markets:{x:Object.values(serialized)[0]}}),/incohérente/);
});

test('long absence adds bounded local restocks without looping each game day',()=>{
  const s=newMarketState('forest-1','forest-valley','forest');
  s.stock['material:plank']=0;s.cashCoins=0;
  assert.equal(advanceMarket(s,1440*100),true);
  assert.equal(s.stock['material:plank'],6);
  assert.equal(s.cashCoins,14*120);
  const rev=s.revision;
  assert.equal(advanceMarket(s,1440*100),false);
  assert.equal(s.revision,rev);
  assert.throws(()=>advanceMarket(s,1440*99));
});
