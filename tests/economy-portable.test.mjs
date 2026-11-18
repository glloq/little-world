import test from 'node:test';
import assert from 'node:assert/strict';
import {newFlightProgress} from '../src/gameplay/flight-progress.ts';
import {beginTransit,pendingTransit} from '../src/archipelago/transit.ts';
import {loadPortableCheckpoint,parsePortableCheckpoint,savePortableCheckpoint,withPortableItems,PORTABLE_TRAVELER_KEY} from '../src/archipelago/portable-inventory.ts';
import {COIN,SHOPS,ECONOMY_ITEMS,buy,sell} from '../src/gameplay/economy.ts';

const store=()=>{const values=new Map();return {
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key),
}};
const item={id:'island:rare-fibre',name:'Fibres du val',category:'artisanat',maxQuantity:999,description:'Fibres locales.'};
const traveler=(inventory={coin:45,[item.id]:7})=>({
  inventory,items:[item],gasReserve:150,flightProgress:newFlightProgress(),
});
const source={id:'volcano-island',name:'Volcan',manifest:'maps/island/manifest.json',description:'',portLevel:0};
const destination={id:'forest-valley',name:'Forêt',manifest:'archipelago/worlds/forest-valley/manifest.json',description:'',portLevel:0};

test('portable item definitions survive a ferry ticket and a persisted checkpoint',()=>{
  const session=store(),local=store(),now=1000000;
  beginTransit(session,source,destination,100,traveler(),now);
  const arriving=pendingTransit(session,destination,now)?.traveler;
  assert.ok(arriving);
  const target=[{id:'coin',name:'Pièces',category:'argent',maxQuantity:9999}];
  const merged=withPortableItems(target,arriving);
  assert.equal(merged.find(x=>x.id===item.id)?.name,'Fibres du val');
  assert.equal(merged.find(x=>x.id===item.id)?.maxQuantity,999);
  assert.equal(target.length,1,'world catalogue stays unchanged');
  savePortableCheckpoint(local,destination.id,'world:forest',arriving);
  const refreshed=loadPortableCheckpoint(local,destination.id,'world:forest');
  assert.deepEqual(refreshed?.traveler.inventory,arriving.inventory);
  assert.equal(withPortableItems(target,refreshed.traveler).find(x=>x.id===item.id)?.name,item.name);
  assert.equal(loadPortableCheckpoint(local,source.id,'world:forest'),null,'checkpoint cannot leak into other island');
  assert.ok(local.getItem(PORTABLE_TRAVELER_KEY));
});

test('legacy ferry tickets retain unknown items with a placeholder without dropping quantities',()=>{
  const legacy={inventory:{coin:4,'unknown:ore':17},gasReserve:50,flightProgress:newFlightProgress()};
  const merged=withPortableItems([{id:'coin',name:'Pièces',category:'argent',maxQuantity:9999}],legacy);
  assert.equal(merged.find(x=>x.id==='unknown:ore')?.maxQuantity,17);
  assert.equal(merged.find(x=>x.id==='unknown:ore')?.name,'unknown:ore');
  const withSmaller=withPortableItems([{id:'unknown:ore',name:'Minerai',category:'mine',maxQuantity:5}],legacy);
  assert.equal(withSmaller[0].maxQuantity,17,'never silently truncate a carried stack');
});

test('portable checkpoints validate their content and reject duplicate item metadata',()=>{
  const s=store();
  assert.throws(()=>parsePortableCheckpoint({schemaVersion:1,islandId:'x',worldId:'w',traveler:{inventory:{x:-1},gasReserve:0,flightProgress:newFlightProgress()}}));
  assert.throws(()=>savePortableCheckpoint(s,destination.id,'world:forest',{...traveler(),items:[item,item]}));
  assert.equal(s.getItem(PORTABLE_TRAVELER_KEY),null);
});

function purse(initial){
  const inventory={...initial},max=id=>ECONOMY_ITEMS.find(x=>x.id===id)?.maxQuantity??999;
  return {inventory,count:id=>inventory[id]??0,max,apply(changes){
    const next={...inventory};
    for(const {itemId,quantity} of changes){next[itemId]=(next[itemId]??0)+quantity;if(next[itemId]<0||next[itemId]>max(itemId))return false;}
    Object.assign(inventory,next);return true;
  }};
}
test('sell refuses partial payment without confiscating goods, and exact payment works',()=>{
  const p=purse({[COIN]:9998,'wood:log':3});
  const before={...p.inventory};
  const refused=sell(SHOPS.market,'wood:log',2,p);
  assert.equal(refused.ok,false);
  assert.deepEqual(p.inventory,before);
  p.inventory[COIN]=9993;
  const accepted=sell(SHOPS.market,'wood:log',2,p);
  assert.equal(accepted.ok,true);
  assert.equal(p.inventory[COIN],9999);
  assert.equal(p.inventory['wood:log'],1);
  assert.equal(sell(SHOPS.market,'wood:log',1,p).ok,false,'wallet at cap');
});
test('shop transaction checks integer quantities and full destination stack',()=>{
  const p=purse({[COIN]:100,'wood:log':999});
  assert.equal(buy(SHOPS.market,'wood:log',1,p).ok,false);
  assert.equal(sell(SHOPS.market,'wood:log',0,p).ok,false);
  assert.equal(sell(SHOPS.market,'wood:log',NaN,p).ok,false);
  assert.equal(p.inventory[COIN],100);
});
