import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPlayerLoadout,parsePlayerLoadout,EQUIPMENT_FAVOURITE_COUNT} from '../src/gameplay/player-loadout.ts';
import {parseGameSave} from '../src/gameplay/save.ts';
import {beginTransit,pendingTransit,parseTraveler} from '../src/archipelago/transit.ts';
import {newFlightProgress} from '../src/gameplay/flight-progress.ts';
import {savePortableCheckpoint,loadPortableCheckpoint} from '../src/archipelago/portable-inventory.ts';

const favorites=()=>['tool:pickaxe','instrument:flute','tool:miners-helmet',...Array.from({length:7},()=>null)];
const loadout=()=>({head:'tool:miners-helmet',back:null,feet:null,favorites:favorites()});
const gameSave=()=>({schemaVersion:2,worldId:'world-test',worldBuildVersion:'version-1',slotId:'slot-1',
 savedAt:1700000000000,time:22,position:{x:0,y:1,z:2},inventory:{'tool:miners-helmet':1,'tool:pickaxe':1,'instrument:flute':1},
 variables:{},objectives:{},entities:{},executed:{},cooldowns:{},dialogueFlags:{},pending:[],mines:{},farms:{}});
const store=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);},removeItem:key=>{data.delete(key);}}};

test('V2 legacy saves without a loadout still parse',()=>{
  const parsed=parseGameSave(gameSave());
  assert.equal(parsed.loadout,undefined);
  assert.equal(emptyPlayerLoadout().favorites,null,'uninitialised is distinct from deliberately empty');
  assert.equal(EQUIPMENT_FAVOURITE_COUNT,10);
});
test('head equipment and ten favourite slots survive V2 parsing and copies',()=>{
  const src=loadout(),parsed=parseGameSave({...gameSave(),equippedItemId:'tool:pickaxe',loadout:src});
  assert.deepEqual(parsed.loadout,src);
  assert.equal(parsed.equippedItemId,'tool:pickaxe');
  src.favorites[0]=null;
  assert.equal(parsed.loadout.favorites[0],'tool:pickaxe','save does not retain mutable caller arrays');
});
test('invalid favourite arrays, duplicate IDs and invalid slots are rejected',()=>{
  const base=gameSave(),bad=change=>parseGameSave({...base,loadout:change});
  assert.throws(()=>bad({...loadout(),favorites:['tool:axe']}),/Favoris/);
  assert.throws(()=>bad({...loadout(),favorites:['tool:pickaxe','tool:pickaxe',...Array(8).fill(null)]}),/dupliqués/);
  assert.throws(()=>bad({...loadout(),head:'bad item'}),/Emplacement/);
  assert.throws(()=>bad({...loadout(),favorites:[...favorites().slice(0,9),32]}),/favori/);
});
test('ferry ticket + portable checkpoint preserve the complete loadout',()=>{
  const source={id:'island-a',name:'A',manifest:'maps/island/manifest.json',description:'',portLevel:0};
  const destination={id:'island-b',name:'B',manifest:'archipelago/worlds/forest-valley/manifest.json',description:'',portLevel:0};
  const traveler={inventory:gameSave().inventory,gasReserve:120,flightProgress:newFlightProgress(),
    equippedItemId:'tool:pickaxe',loadout:loadout()};
  const session=store(),local=store(),now=2_000_000;
  beginTransit(session,source,destination,30,traveler,now);
  const arrival=pendingTransit(session,destination,now);
  assert.deepEqual(arrival?.traveler.loadout,loadout());
  savePortableCheckpoint(local,destination.id,'world-island-b',arrival.traveler);
  assert.deepEqual(loadPortableCheckpoint(local,destination.id,'world-island-b')?.traveler.loadout,loadout());
  assert.throws(()=>parseTraveler({...traveler,inventory:{'tool:pickaxe':1}}),/Casque/);
  assert.equal(parseTraveler({...traveler,loadout:undefined}).loadout,undefined);
});
