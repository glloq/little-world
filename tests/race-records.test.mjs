import test from 'node:test';
import assert from 'node:assert/strict';
import {readRaceBest,writeRaceBest} from '../src/gameplay/race-records.ts';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const def={id:'race',name:'test',version:1,worldId:'w',layoutKey:'v1',kind:'roll',classification:'practice',gates:[],maxTicks:300};
test('record changes only on improvements for identical geometry',()=>{
 const store=storage();
 assert.equal(readRaceBest(store,def),null);
 assert.equal(writeRaceBest(store,def,4.5),true);
 assert.equal(writeRaceBest(store,def,5),false);
 assert.equal(writeRaceBest(store,def,3.2),true);
 assert.equal(readRaceBest(store,def),3.2);
 assert.equal(readRaceBest(store,{...def,layoutKey:'v2'}),null);
 assert.equal(writeRaceBest(store,def,30),false);
});
test('practice record persistence remains optional',()=>{
 const broken={getItem:()=>{throw Error('disabled')},setItem:()=>{throw Error('disabled')}};
 assert.equal(readRaceBest(broken,def),null);
 assert.equal(writeRaceBest(broken,def,2),false);
});

test('terrain/build changes isolate personal bests for identical geometry',()=>{
 const store=storage();
 assert.equal(writeRaceBest(store,def,3,'world-build-1'),true);
 assert.equal(readRaceBest(store,def,'world-build-1'),3);
 assert.equal(readRaceBest(store,def,'world-build-2'),null);
});
