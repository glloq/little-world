import test from 'node:test';
import assert from 'node:assert/strict';
import {INSTRUMENTS,INSTRUMENT_ITEMS,instrumentForItem} from '../src/instruments/definitions.ts';
import {PATCHES} from '../src/audio/schema.ts';
import {parseGameSave} from '../src/gameplay/save.ts';
import {parseTraveler} from '../src/archipelago/transit.ts';
import {newFlightProgress} from '../src/gameplay/flight-progress.ts';
import {inventoryViewModel} from '../src/ui/inventory/inventory.ts';

test('instrument trial: three unique inventory items and executable synth patches',()=>{
 assert.deepEqual(INSTRUMENTS.map(i=>i.id),['flute','ocarina','ukulele']);
 assert.equal(new Set(INSTRUMENTS.map(i=>i.itemId)).size,3);
 assert.equal(new Set(INSTRUMENTS.map(i=>i.patchId)).size,3);
 for(const instrument of INSTRUMENTS){
  assert.equal(instrumentForItem(instrument.itemId),instrument);
  assert.ok(PATCHES[instrument.patchId]);assert.equal(instrument.minNote,48);
  assert.equal(instrument.maxNote,96);assert.equal(instrument.maxPolyphony,6);
  const item=INSTRUMENT_ITEMS.find(i=>i.id===instrument.itemId);
  assert.equal(item?.category,'instrument');assert.equal(item?.maxQuantity,1);
 }
 assert.equal(instrumentForItem('tool:pickaxe'),null);
});

test('instrument trial: inventory groups instrument equipment instead of resources',()=>{
 const bag=Object.fromEntries(INSTRUMENT_ITEMS.map(i=>[i.id,1]));
 const view=inventoryViewModel(INSTRUMENT_ITEMS,bag,{});
 assert.equal(view.kinds,3);
 assert.deepEqual(view.groups.map(g=>g.label),['Instruments']);
 assert.ok(view.groups[0].entries.every(e=>e.category==='instrument'));
});

test('optional equipped hand slot roundtrips in V2 without breaking old saves',()=>{
 const base={schemaVersion:2,worldId:'test-world',worldBuildVersion:'build-1',slotId:'slot-1',savedAt:12345,time:0,
  position:{x:0,y:0,z:0},inventory:{'instrument:flute':1},variables:{},objectives:{},entities:{},executed:{},cooldowns:{},
  dialogueFlags:{},pending:[],mines:{},farms:{}};
 assert.equal(parseGameSave({...base,equippedItemId:'instrument:flute'}).equippedItemId,'instrument:flute');
 assert.equal(parseGameSave(base).equippedItemId,undefined);
 assert.throws(()=>parseGameSave({...base,equippedItemId:3}),/Objet équipé invalide/);
});

test('equipped instrument travels with carried inventory, old traveler packets remain valid',()=>{
 const base={inventory:{'instrument:ocarina':1},gasReserve:80,flightProgress:newFlightProgress()};
 assert.equal(parseTraveler({...base,equippedItemId:'instrument:ocarina'}).equippedItemId,'instrument:ocarina');
 assert.equal(parseTraveler(base).equippedItemId,undefined);
 assert.throws(()=>parseTraveler({...base,equippedItemId:'instrument:ukulele'}),/Équipement de voyage invalide/);
});
