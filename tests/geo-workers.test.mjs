import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GeoWorkerPool} from '../src/geography/geo-workers.ts';
import {handleGeoMessage} from '../src/geography/geo-worker.ts';
import {configureTerrain,insideWorld} from '../src/terrain.ts';
import {configureGeography,geoContext} from '../src/geography/engine.ts';
import {createChunkData} from '../src/terrain-data.ts';
import {packedHorizonBlock,horizonGrid} from '../src/horizon-data.ts';
import {generateDressingCell} from '../src/geography/dressing.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {projectGeography,projectGeographyInput} from '../src/studio-core/geo-context.ts';
import {sampleTile} from '../src/studio/geo-map/raster.ts';

/** In-process stand-in for a Worker: same protocol and message handler, asynchronous replies
 * (the replica shares this process's modules, so it must see the same configuration). */
class FakeWorker {
  onmessage=null;onerror=null;posted=[];broken=false;
  postMessage(m){this.posted.push(m.type==='job'?m.job.kind:m.type);const msg=structuredClone(m);setTimeout(()=>{if(this.broken){this.onerror?.({message:'boom'});return;}const out=handleGeoMessage(msg);if(out)this.onmessage?.({data:out.reply});},1);}
  terminate(){}
}
const p=parseProject(JSON.parse(await readFile(new URL('../maps/reference.project.json',import.meta.url),'utf8')));
const def=toRuntimeWorld(p),c=def.config,W=c.width,L=c.length;
function configure(edits=def.terrain){configureTerrain(c,edits,def.water,def.paths);configureGeography({seed:c.seed,grid:{minX:-W/2,minZ:-L/2,chunkSizeM:64,columns:Math.ceil(W/64),rows:Math.ceil(L/64)},masks:def.geography.masks,zones:def.geography.zones,biomeStrokes:[],buildings:[]});}

test('worker results are identical to the main-thread computation (tiles, horizon, dressing, map)',async()=>{
  configure();const workers=[];const pool=new GeoWorkerPool(2,()=>{const w=new FakeWorker();workers.push(w);return w;});
  const chunk={minX:0,maxX:64,minZ:128,maxZ:192},grid=horizonGrid(W,L),bounds={width:W,length:L,seaLevel:c.seaLevel};
  const [tile,horizon,dressing]=await Promise.all([pool.run({kind:'tile',chunk,lod:0},0).promise,pool.run({kind:'horizon',bounds,grid,column:1,row:1},1).promise,pool.run({kind:'dressing',seed:c.seed,cx:-3,cz:2},2).promise]);
  assert.deepEqual(tile.result,createChunkData(chunk,0));assert.equal(tile.stale,false);
  assert.deepEqual(horizon.result,packedHorizonBlock(bounds,grid,1,1));
  const {ms:_,...cell}=dressing.result,{ms:__,...expected}=generateDressingCell(geoContext(),c.seed,-3,2,insideWorld);assert.deepEqual(cell,expected);
  assert.ok(workers.every(w=>w.posted[0]==='terrain'&&w.posted[1]==='geography'||w.posted.length===0),'configuration replayed before the first job');
  pool.setProject(projectGeographyInput(p));
  const map=await pool.run({kind:'map',bounds:{minX:-W/2,minZ:-L/2},level:3,tx:1,tz:2},3).promise;
  assert.deepEqual(map.result,sampleTile(projectGeography(p).ctx,{minX:-W/2,minZ:-L/2},3,1,2));
  pool.dispose();
});
test('results computed on an older configuration are flagged stale; priorities and failures',async()=>{
  configure();const pool=new GeoWorkerPool(1,()=>new FakeWorker());
  const task=pool.run({kind:'tile',chunk:{minX:0,maxX:64,minZ:0,maxZ:64},lod:2},0);
  configure([...def.terrain,{id:'new-hill',x:30,z:30,radius:20,strength:5,mode:'raise',height:5}]);
  assert.equal((await task.promise).stale,true,'terrain changed after posting');
  const fresh=await pool.run({kind:'tile',chunk:{minX:0,maxX:64,minZ:0,maxZ:64},lod:2},0).promise;assert.equal(fresh.stale,false);
  assert.deepEqual(fresh.result,createChunkData({minX:0,maxX:64,minZ:0,maxZ:64},2),'replayed configuration used');
  // Unchanged configuration does not invalidate anything.
  configure([...def.terrain,{id:'new-hill',x:30,z:30,radius:20,strength:5,mode:'raise',height:5}]);
  assert.equal((await pool.run({kind:'tile',chunk:{minX:0,maxX:64,minZ:0,maxZ:64},lod:2},0).promise).stale,false);
  // Priority: with the worker busy, the lowest priority value runs first.
  const order=[];const busy=[pool.run({kind:'tile',chunk:{minX:64,maxX:128,minZ:0,maxZ:64},lod:2},5),pool.run({kind:'tile',chunk:{minX:128,maxX:192,minZ:0,maxZ:64},lod:2},5)];
  const late=pool.run({kind:'dressing',seed:c.seed,cx:0,cz:0},3000),early=pool.run({kind:'tile',chunk:{minX:0,maxX:64,minZ:64,maxZ:128},lod:2},1);
  late.promise.then(()=>order.push('late'));early.promise.then(()=>order.push('early'));await Promise.all([...busy.map(t=>t.promise),late.promise,early.promise]);
  assert.deepEqual(order,['early','late']);
  const cancelled=pool.run({kind:'tile',chunk:{minX:0,maxX:64,minZ:0,maxZ:64},lod:1},0);cancelled.cancel();
  pool.dispose();
  const broken=new GeoWorkerPool(1,()=>{const w=new FakeWorker();w.broken=true;return w;});
  await assert.rejects(broken.run({kind:'tile',chunk:{minX:0,maxX:64,minZ:0,maxZ:64},lod:2},0).promise,/indisponible/);
  assert.equal(broken.available,false,'a failed pool hands work back to the main thread');
});
