import test from 'node:test';
import assert from 'node:assert/strict';
import {newCargoState,parseCargoState,advanceCargo,importStandView,importUnitPrice,buyCargoLot,
  createCargoService,CARGO_STORAGE_KEY,CARGO_ROUTES,CARGO_INITIAL_RESERVES} from '../src/archipelago/cargo-logistics.ts';
import {ECONOMY_ITEMS,COIN} from '../src/gameplay/economy.ts';
import {PRODUCTION_ITEMS} from '../src/economy/starter-catalog.ts';
import {ferryStatus} from '../src/archipelago/ferry-schedule.ts';

function storage(fails=false){
  const raw=new Map();
  return {getItem:key=>raw.get(key)??null,setItem:(key,value)=>{
    if(fails)throw Error('QuotaExceeded');
    raw.set(key,value);
  },raw,fail(value){fails=value;}};
}
function purse(initial={}){
  const values={...initial};
  const max=id=>[...ECONOMY_ITEMS,...PRODUCTION_ITEMS].find(x=>x.id===id)?.maxQuantity??0;
  return {values,count:id=>values[id]??0,max,apply(changes){
    const next={...values};
    for(const c of changes){
      next[c.itemId]=(next[c.itemId]??0)+c.quantity;
      if(!Number.isSafeInteger(next[c.itemId])||next[c.itemId]<0||next[c.itemId]>max(c.itemId))
        return false;
    }
    Object.assign(values,next);return true;
  }};
}
test('cargo debits origin warehouses at departure and credits only foreign arrival lots',()=>{
  const state=newCargoState();
  assert.equal(state.exportReserves['forest-valley']['material:plank'],24);
  assert.equal(state.exportReserves['volcano-island']['material:iron-ingot'],12);
  assert.equal(advanceCargo(state,9).events,0);
  assert.equal(importStandView(state,'volcano-island').offers.length,0);
  const departure=advanceCargo(state,10);
  assert.equal(departure.events,2);
  assert.equal(state.exportReserves['forest-valley']['material:plank'],20);
  assert.equal(state.exportReserves['forest-valley']['wood:log'],25);
  assert.equal(state.exportReserves['volcano-island']['material:iron-ingot'],10);
  assert.equal(state.shipments.length,2);
  assert.ok(state.shipments.every(x=>x.status==='in_transit'));
  assert.equal(importStandView(state,'forest-valley').offers.length,0);
  advanceCargo(state,55);
  const arrivals=importStandView(state,'volcano-island');
  assert.equal(arrivals.offers.length,2);
  assert.equal(arrivals.offers.find(x=>x.itemId==='material:plank')?.quantity,4);
  assert.ok(arrivals.offers.every(x=>x.originIslandId==='forest-valley'));
  const inbound=importStandView(state,'forest-valley');
  assert.equal(inbound.offers.length,2);
  assert.ok(inbound.offers.every(x=>x.originIslandId==='volcano-island'));
  const snapshot=JSON.stringify(state);
  advanceCargo(state,55);advanceCargo(state,60);
  assert.equal(state.shipments.length,2,'no duplicate departures or arrivals');
  assert.deepEqual(importStandView(state,'volcano-island').offers,arrivals.offers);
  const reloaded=parseCargoState(JSON.parse(snapshot));
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded)),JSON.parse(snapshot));
});
test('cargo calendar is independent of passenger ferry schedule',()=>{
  const s=newCargoState();advanceCargo(s,10);
  assert.equal(CARGO_ROUTES[0].firstDepartureMinute,10);
  assert.equal(ferryStatus(10,1).present,false,'passenger ferry is not at the harbour');
  assert.equal(s.shipments.length,2,'freight departs even if passenger ferry is away');
});
test('an import-only stand sells delivered lots without exceeding supply or duplicating items',()=>{
  const s=newCargoState();advanceCargo(s,55);
  const lot=importStandView(s,'volcano-island').offers.find(x=>x.itemId==='material:plank');
  const bag=purse({[COIN]:200});
  const unit=importUnitPrice('volcano-island','material:plank');
  const initial=s.exportReserves['forest-valley']['material:plank'];
  const bought=buyCargoLot(s,{islandId:'volcano-island',lotId:lot.lotId,
    requestId:'purchase-a',quantity:3,expectedRevision:s.revision},bag);
  assert.equal(bought.ok,true);
  assert.equal(bag.values['material:plank'],3);
  assert.equal(bag.values.coin,200-unit*3);
  assert.equal(importStandView(s,'volcano-island').offers.find(x=>x.lotId===lot.lotId)?.quantity,1);
  assert.equal(s.exportReserves['forest-valley']['material:plank'],initial,
    'player purchase cannot resupply origin production reserves');
  assert.equal(buyCargoLot(s,{islandId:'volcano-island',lotId:lot.lotId,
    requestId:'purchase-a',quantity:3},bag).ok,false,'replay rejected');
  assert.equal(buyCargoLot(s,{islandId:'volcano-island',lotId:lot.lotId,
    requestId:'purchase-b',quantity:3},bag).ok,false,'cannot exceed received stock');
  assert.equal(buyCargoLot(s,{islandId:'forest-valley',lotId:lot.lotId,
    requestId:'purchase-foreign',quantity:1},bag).ok,false,'cannot buy an export on the source island');
  assert.equal(s.purchases.length,1);
});
test('no buyer coins, saturated bag, obsolete quote and malformed receipts are rejected',()=>{
  const s=newCargoState();advanceCargo(s,55);
  const lot=importStandView(s,'forest-valley').offers[0];
  const empty=purse({coin:0}),full=purse({coin:9999,[lot.itemId]:999});
  const before=JSON.stringify(s);
  assert.equal(buyCargoLot(s,{islandId:'forest-valley',lotId:lot.lotId,
    requestId:'poor',quantity:1},empty).ok,false);
  assert.equal(buyCargoLot(s,{islandId:'forest-valley',lotId:lot.lotId,
    requestId:'old',quantity:1,expectedRevision:0},full).ok,false);
  assert.equal(buyCargoLot(s,{islandId:'forest-valley',lotId:lot.lotId,
    requestId:'full',quantity:1},full).ok,false);
  assert.equal(JSON.stringify(s),before,'refused checkout is side-effect-free');
  assert.throws(()=>parseCargoState({...s,importLots:{
    ...s.importLots,'volcano-island':[{
      ...s.importLots['volcano-island'][0],sourceIslandId:'volcano-island',
    }],
  }}),/Provenance|sans cargaison/);
});
test('cargo is bounded during long absences, exhausted export reserves never generate free goods',()=>{
  const s=newCargoState();
  const late=advanceCargo(s,1440*80,CARGO_ROUTES,8);
  assert.equal(late.events,8);
  assert.equal(late.pending,true);
  let calls=0;
  do{const result=advanceCargo(s,1440*80,CARGO_ROUTES,8);calls++;
    if(!result.pending)break;
  }while(calls<100);
  assert.ok(calls<100);
  assert.equal(s.exportReserves['forest-valley']['material:plank'],0);
  assert.equal(s.exportReserves['volcano-island']['material:iron-ingot'],0);
  assert.ok(s.shipments.length<=256);
  assert.ok((s.importLots['volcano-island']??[]).every(x=>x.sourceIslandId!=='volcano-island'));
  assert.ok((s.importLots['forest-valley']??[]).every(x=>x.sourceIslandId!=='forest-valley'));
  assert.equal(CARGO_INITIAL_RESERVES['forest-valley']['material:plank'],24,'static author data stays unchanged');
});
test('one persistent ledger survives changing islands and refuses buying when storage fails',()=>{
  const disk=storage(),wallet=purse({coin:300}),time={value:0};
  const service=(islandId)=>createCargoService(disk,{
    islandId,purse:wallet,itemName:id=>id,gameMinute:()=>time.value,
  });
  const forest=service('forest-valley');
  time.value=55;
  forest.advance();
  assert.ok(disk.getItem(CARGO_STORAGE_KEY));
  const volcano=service('volcano-island');
  const listed=volcano.view();
  const lot=listed.offers.find(x=>x.itemId==='material:plank');
  assert.ok(lot);
  const currentCoins=wallet.values.coin;
  disk.fail(true);
  const rejected=volcano.buy(lot.lotId,1,listed.revision,'purchase-fail');
  assert.equal(rejected.ok,false);
  assert.equal(wallet.values.coin,currentCoins);
  assert.equal(wallet.values['material:plank']??0,0);
  disk.fail(false);
  const committed=volcano.buy(lot.lotId,1,listed.revision,'purchase-commit');
  assert.equal(committed.ok,true);
  assert.equal(wallet.values['material:plank'],1);
  const fresh=service('volcano-island');
  assert.equal(fresh.view().offers.find(x=>x.lotId===lot.lotId).quantity,lot.quantity-1);
  assert.equal(fresh.buy(lot.lotId,1,undefined,'purchase-commit').ok,false);
  assert.equal(fresh.serialize().purchases.length,1);
});
