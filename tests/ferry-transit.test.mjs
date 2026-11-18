import test from 'node:test';
import assert from 'node:assert/strict';
import {beginTransit,pendingTransit,clearTransit,partitionTravelerInventory,FERRY_TRANSIT_KEY} from '../src/archipelago/transit.ts';
import {newFlightProgress} from '../src/gameplay/flight-progress.ts';
const a={id:'volcano-island',name:'A',manifest:'maps/island/manifest.json',description:'',portLevel:0};
const b={id:'forest-valley',name:'B',manifest:'archipelago/worlds/forest-valley/manifest.json',description:'',portLevel:0};
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('travel intent is versioned, destination-bound and expires',()=>{
 const s=store(),now=1000000;
 const t=beginTransit(s,a,b,321,{inventory:{coin:72,'food:apple':4},gasReserve:120,flightProgress:newFlightProgress()},now);
 assert.equal(pendingTransit(s,b,now)?.worldSeconds,321);
 assert.equal(pendingTransit(s,b,now)?.traveler.inventory.coin,72);
 assert.equal(pendingTransit(s,a,now),null);
 assert.equal(s.getItem(FERRY_TRANSIT_KEY),null);
 beginTransit(s,a,b,321,t.traveler,now);
 assert.equal(pendingTransit(s,b,now+11*60000),null);
 clearTransit(s);assert.equal(s.getItem(FERRY_TRANSIT_KEY),null);
});
test('unknown island resources stay in traveler escrow instead of vanishing',()=>{
 const data=partitionTravelerInventory({'coin':40,'local:fruit':6,'food:apple':5},[
  {id:'coin',maxQuantity:9999},{id:'food:apple',maxQuantity:2}
 ]);
 assert.deepEqual(data.equipped,{'coin':40,'food:apple':2});
 assert.deepEqual(data.stashed,{'local:fruit':6,'food:apple':3});
});
test('malformed inventory and forged manifest are rejected',()=>{
 const s=store();
 assert.throws(()=>beginTransit(s,a,{...b,manifest:'https://evil.example/'},3,{inventory:{coin:1},gasReserve:12,flightProgress:newFlightProgress()},1000));
 assert.throws(()=>beginTransit(s,a,b,3,{inventory:{coin:-1},gasReserve:12,flightProgress:newFlightProgress()},1000));
 assert.equal(s.getItem(FERRY_TRANSIT_KEY),null);
});
