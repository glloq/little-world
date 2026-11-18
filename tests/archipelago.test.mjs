import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArchipelagoRegistry, islandById } from '../src/archipelago/registry.ts';
import { ferryStatus, ferryEventsBetween, worldGameMinute } from '../src/archipelago/ferry-schedule.ts';

const register = {schemaVersion:1,islands:[{id:'volcano-island',name:'Volcan',description:'',manifest:'maps/island/manifest.json',portLevel:0}]};
test('registry is published/static, validates IDs and paths',()=>{
 const v=parseArchipelagoRegistry(register);
 assert.equal(islandById(v,'volcano-island')?.name,'Volcan');
 assert.equal(islandById(v,'missing'),null);
 assert.throws(()=>parseArchipelagoRegistry({...register,islands:[register.islands[0],register.islands[0]]}));
 assert.throws(()=>parseArchipelagoRegistry({...register,islands:[{...register.islands[0],manifest:'https://outside.example/manifest.json'}]}));
 assert.throws(()=>parseArchipelagoRegistry({...register,islands:[{...register.islands[0],manifest:'maps/../../bad/manifest.json'}]}));
});
test('level 0 visits one full day per week',()=>{
 assert.equal(ferryStatus(0,0).present,true);
 assert.equal(ferryStatus(1439,0).present,true);
 assert.equal(ferryStatus(1440,0).present,false);
 assert.equal(ferryStatus(7*1440,0).present,true);
 assert.equal(ferryStatus(5*1440,0).nextArrivalMinute,7*1440);
});
test('level 4 is permanently available, no departure warning',()=>{
 for(const t of [0,1,1439,1440,1440*500]) {
   const s=ferryStatus(t,4);
   assert.equal(s.present,true);
   assert.equal(s.minutesUntilDeparture,null);
 }
 assert.deepEqual(ferryEventsBetween(0,10080,4),[]);
});
test('arrival and five game-minute warning happen once at boundaries',()=>{
 const events=ferryEventsBetween(0,1440,0);
 assert.deepEqual(events.map(e=>[e.kind,e.gameMinute]),[['departure-warning',1435],['departed',1440]]);
 assert.deepEqual(ferryEventsBetween(10079,10081,0).map(e=>e.kind),['arrived']);
 assert.deepEqual(ferryEventsBetween(1435,1435,0),[]);
 assert.deepEqual(ferryEventsBetween(1440,1441,0),[]);
 assert.deepEqual(ferryEventsBetween(0,10081,0),[]); // skip historic bells after a long absence
});
test('time uses game-clock seconds, not browser wall time',()=>{
 assert.equal(worldGameMinute(15,1200),18);
 assert.throws(()=>worldGameMinute(NaN,1200));
 assert.throws(()=>ferryStatus(-1,0));
});
