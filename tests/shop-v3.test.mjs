import test from 'node:test';
import assert from 'node:assert/strict';
import {shopViewModel} from '../src/ui/shop/shop.ts';
import {itemIcon} from '../src/ui/shared/item-icons.ts';
import {tradeLimit,ownedBuybackLines,selectedSaleTotal} from '../src/ui/shop/shop-logic.ts';
import {COIN} from '../src/gameplay/economy.ts';
import {marketView,newMarketState,executeMarketSellBatch,marketUnitPrices} from '../src/economy/island-markets.ts';

const itemName=id=>({'food:apple':'Pomme','food:pear':'Poire','tool:axe':'Hache'}[id]??id);
const cap=id=>id===COIN?9999:id==='tool:axe'?1:999;

test('inventory V3 icon catalog is shared with the shop without text-name guessing',()=>{
  assert.equal(itemIcon({id:'food:apple',category:'cueillette'}),'🍎');
  assert.equal(itemIcon({id:'tool:axe',category:'outil'}),'🪓');
  assert.equal(itemIcon({id:'unknown',category:'mine'}),'◆');
});
test('shop buy rows expose stock price and bag limits, resale lists only owned offers',()=>{
  const s=newMarketState('market-1','volcano-island','market');
  const inventory={coin:50,'food:apple':4,'farm:wheat':2};
  const vm=shopViewModel('market',inventory,itemName,cap,marketView(s));
  assert.ok(vm.buy.length>0);
  assert.ok(vm.buy.every(l=>l.available!==undefined&&l.price>0));
  const sell=ownedBuybackLines(vm.sell);
  assert.equal(sell.some(l=>l.itemId==='food:apple'),true);
  assert.equal(sell.some(l=>l.itemId==='food:pear'),false);
  assert.ok(sell.every(l=>l.owned>0));
  const apple=sell.find(l=>l.itemId==='food:apple');
  assert.equal(tradeLimit(apple,'sell',50,9999,999),Math.min(99,apple.owned,apple.available));
  assert.equal(selectedSaleTotal(sell,new Map([['food:apple',2]])),apple.price*2);
});
test('quantity selector caps purchase by budget, stock, wallet and item capacity',()=>{
  const l={itemId:'tool:axe',name:'Hache',price:25,owned:0,available:2};
  assert.equal(tradeLimit(l,'buy',70,9999,1),1);
  assert.equal(tradeLimit(l,'buy',24,9999,1),0);
  assert.equal(tradeLimit({...l,itemId:'food:apple',owned:4,available:8,price:4},'buy',16,9999,6),2);
  assert.equal(tradeLimit({...l,owned:5},'sell',9998,9999,999),0);
});
test('multi-sale removes all chosen items exactly once and rejects partially affordable deals',()=>{
  const s=newMarketState('market-batch','volcano-island','market');
  const p={counts:{coin:25,'food:apple':4,'food:pear':3},
    count(id){return this.counts[id]??0;},max:cap,
    apply(changes){
      const next={...this.counts};
      for(const c of changes){next[c.itemId]=(next[c.itemId]??0)+c.quantity;
        if(next[c.itemId]<0||next[c.itemId]>cap(c.itemId))return false;}
      this.counts=next;return true;
    }};
  const lines=[{itemId:'food:apple',quantity:2},{itemId:'food:pear',quantity:3}];
  const price=lines.reduce((n,l)=>n+l.quantity*marketUnitPrices(s.islandId,l.itemId).sell,0);
  const request={shopId:s.shopId,shopKind:s.shopKind,islandId:s.islandId,requestId:'shop-v3-batch',lines,expectedRevision:s.revision};
  const ok=executeMarketSellBatch(s,request,p);
  assert.equal(ok.ok,true);assert.equal(p.count('coin'),25+price);assert.equal(p.count('food:apple'),2);assert.equal(p.count('food:pear'),0);
  const snapshot={...p.counts},revision=s.revision;
  assert.equal(executeMarketSellBatch(s,request,p).ok,false);
  assert.deepEqual(p.counts,snapshot);assert.equal(s.revision,revision);
  const broke=newMarketState('market-batch-2','volcano-island','market');broke.cashCoins=1;
  const p2={...p,counts:{coin:25,'food:apple':4,'food:pear':3}};
  const before=JSON.stringify(p2.counts);
  assert.equal(executeMarketSellBatch(broke,{...request,shopId:broke.shopId,requestId:'insufficient'},p2).ok,false);
  assert.equal(JSON.stringify(p2.counts),before);
});
