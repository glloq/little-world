import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameSave,createGameSaveStore,GAME_SAVE_PREFIX,INLINE_ACTIVITY_LIMIT} from '../src/gameplay/save.ts';
import {memoryBlobStore} from '../src/gameplay/save-blobs.ts';
import {defaultMineSettings} from '../src/mine/mine-data.ts';
import {MineGrid,MineState} from '../src/mine/mine-state.ts';
import {newPlotState} from '../src/farm/farm-sim.ts';
import {defaultFarmSettings} from '../src/farm/farm-data.ts';

function storage(){const m=new Map();return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));},removeItem:k=>{m.delete(k);},raw:m};}
const v1=()=>({schemaVersion:1,worldId:'w',worldBuildVersion:'b1',slotId:'slot-1',savedAt:1000,time:50,position:{x:1,y:2,z:3},inventory:{wood:2},variables:{},objectives:{},entities:{},executed:{},cooldowns:{},dialogueFlags:{},pending:[]});
function mineState(cells){
  const polygon=[{x:0,z:0},{x:60,z:0},{x:60,z:60},{x:0,z:60}],zone={id:'mine-a',name:'m',polygon,mine:{...defaultMineSettings(polygon,1,30),galleries:[{levelId:'level-1',minX:1,maxX:59,minZ:1,maxZ:2}]}},s=new MineState(new MineGrid(zone));
  let n=0;for(let z=2;z<59&&n<cells;z++)for(let x=1;x<59&&n<cells;x++){if(s.isOpen(0,x,z))continue;if(s.dig({requestId:'r'+n,levelId:'level-1',ix:x,iz:z,from:{x:x+.5,y:s.grid.levels[0].floorY,z:z-.5}},()=>true).ok)n++;}
  return s.serialize();
}
test('V1 slots are read and migrated to V2 without loss',()=>{
  const s=parseGameSave(v1());assert.equal(s.schemaVersion,2);assert.deepEqual(s.mines,{});assert.deepEqual(s.farms,{});assert.equal(s.space,null);assert.deepEqual(s.inventory,{wood:2});
});
test('mines, farms and the active space round-trip; corrupted activity states are refused',async()=>{
  const store=createGameSaveStore(storage(),memoryBlobStore()),farm=newPlotState('plot-1',defaultFarmSettings([{x:0,z:0},{x:5,z:0},{x:5,z:5}]));
  const save={...v1(),schemaVersion:2,space:{zoneId:'mine-a',levelId:'level-1'},mines:{'mine-a':mineState(20)},farms:{'plot-1':farm}};
  assert.deepEqual(await store.save(save),{external:false});const back=await store.load('w','slot-1');
  assert.deepEqual(back.mines,save.mines);assert.deepEqual(back.farms,save.farms);assert.deepEqual(back.space,save.space);
  assert.throws(()=>parseGameSave({...save,mines:{'mine-b':save.mines['mine-a']}}),/incohérente/);
  assert.throws(()=>parseGameSave({...save,farms:{'plot-1':{...farm,moisture:4}}}),/parcelle invalide/);
});
/** ~1 Mo of farm states: 500 plots with a full history of request ids (bounded fields). */
function bigFarms(){const farms={};for(let i=0;i<500;i++){const f=newPlotState('plot-'+i,defaultFarmSettings([{x:0,z:0},{x:5,z:0},{x:5,z:5}]));f.requests=Array.from({length:32},(_,j)=>`request-${i}-${j}-`.padEnd(60,'x'));farms[f.plotId]=f;}return farms;}
test('large activity payloads go to IndexedDB; the manifest stays compact at the same key; old payloads are cleaned',async()=>{
  const local=storage(),blobs=memoryBlobStore(),store=createGameSaveStore(local,blobs),payload={...v1(),schemaVersion:2,mines:{'mine-a':mineState(40)},farms:bigFarms()};
  assert.ok(JSON.stringify(payload.farms).length>INLINE_ACTIVITY_LIMIT);
  const result=await store.save(payload);assert.equal(result.external,true);assert.equal(blobs.size,1);
  const manifest=JSON.parse(local.getItem(GAME_SAVE_PREFIX+'w:slot-1'));assert.ok(manifest.external&&JSON.stringify(manifest).length<10000,'compact manifest');assert.deepEqual(manifest.inventory,{wood:2},'core fields readable at the same key');
  const loaded=await store.load('w','slot-1');assert.deepEqual(loaded.farms,payload.farms);assert.deepEqual(loaded.mines,payload.mines);assert.equal(loaded.external,undefined);
  await store.save({...payload,savedAt:2000});assert.equal(blobs.size,1,'previous payload removed after the new manifest is committed');
  await store.save({...v1(),savedAt:3000});assert.equal(blobs.size,0,'back to an inline save: detached payload removed');
  await store.save({...payload,savedAt:4000});await store.delete('w','slot-1');assert.equal(blobs.size,0);
});
test('clear messages when detailed data is gone or local storage cannot hold the game',async()=>{
  const local=storage(),blobs=memoryBlobStore(),store=createGameSaveStore(local,blobs),payload={...v1(),schemaVersion:2,mines:{},farms:bigFarms()};
  await store.save(payload);const m=JSON.parse(local.getItem(GAME_SAVE_PREFIX+'w:slot-1'));await blobs.delete(m.external.key);
  await assert.rejects(()=>store.load('w','slot-1'),/introuvables/);
  await assert.rejects(()=>createGameSaveStore(storage(),null).save(payload),/Exporter la partie en cours/);
  const full=storage();full.setItem=()=>{throw Error('QuotaExceededError');};await assert.rejects(()=>createGameSaveStore(full,memoryBlobStore()).save(v1()),/Exporter la partie en cours/);
});
