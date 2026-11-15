import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidedWorld} from '../src/studio-core/world-start.ts';
import {newRegion} from '../src/studio-core/region-recipes.ts';
import {previewRegionBatch,previewRegionBatchWithDiff,applyRegionBatch,regionBatchChunks,REGION_BATCH_LIMIT} from '../src/studio-core/region-batch.ts';
import {analyzeWatersheds} from '../src/studio-core/watershed-analysis.ts';
const world=()=>{
 const p=createGuidedWorld({name:'Composition',mode:'calm',width:1000,length:1000,seed:42,cliffs:.25,volcano:false});
 // Mirrors StudioSession.hydrate: composition needs all touched sector sources present.
 for(const [id,m] of Object.entries(p.chunkIndex))if(!p.chunks[id])
   p.chunks[id]={schemaVersion:3,chunkId:id,index:{cx:m.cx,cz:m.cz},revision:0,
    entities:{},entityIds:[],terrainEdits:[],terrainRefs:[],biomeEdits:[],biomeRefs:[],
    waterRefs:[],pathRefs:[]};
 return p;
};
const region=(p,id,x,preset)=>newRegion(p,{id,name:id,points:[{x:x-55,z:-55},{x:x+55,z:-55},{x:x+55,z:55},{x:x-55,z:55}],preset,coverage:100,transitionM:0,relief:'none'});
test('preview of overlapping regions is exact, immutable and deterministic',()=>{
 const p=world(),a=region(p,'region-a',0,'forest'),b=region(p,'region-b',30,'meadow');
 for(const id of regionBatchChunks(p,[a,b]))if(!p.chunks[id]){
   const [cx,cz]=id.split(':').map(Number);
   p.chunks[id]={schemaVersion:3,chunkId:id,index:{cx,cz},revision:0,entities:{},entityIds:[],
     terrainEdits:[],terrainRefs:[],biomeEdits:[],biomeRefs:[],waterRefs:[],pathRefs:[]};
 }
 const before=structuredClone(p);
 const first=previewRegionBatch(p,[a,b]),second=previewRegionBatch(p,[a,b]);
 assert.deepEqual(first,second);assert.deepEqual(p,before);
 const applied=applyRegionBatch(p,[a,b]);
 assert.deepEqual(first,applied);
 assert.ok(applied.totals.painted>0);assert.ok(applied.totals.protected>0);
});
test('visual region preview reports changed map cells without modifying source or ownership',()=>{
 const p=world(),a=region(p,'region-diff-a',0,'forest');
 for(const id of regionBatchChunks(p,[a]))if(!p.chunks[id]){
   const [cx,cz]=id.split(':').map(Number);
   p.chunks[id]={schemaVersion:3,chunkId:id,index:{cx,cz},revision:0,entities:{},entityIds:[],
     terrainEdits:[],terrainRefs:[],biomeEdits:[],biomeRefs:[],waterRefs:[],pathRefs:[]};
 }
 const before=structuredClone(p),view=previewRegionBatchWithDiff(p,[a]);
 assert.ok(view.diff.total>0);
 assert.equal(view.diff.total,view.diff.cells.length);
 assert.ok(view.diff.cells.every(c=>c.index>=0&&c.index<256));
 assert.deepEqual(p,before);
 assert.deepEqual(view,previewRegionBatchWithDiff(p,[a]));
});

test('batch rejects duplicate ids, unbounded work and invalid recipes without changing source preview',()=>{
 const p=world(),a=region(p,'region-a',0,'forest');
 assert.throws(()=>previewRegionBatch(p,[a,a]),/répétée/);
 assert.throws(()=>previewRegionBatch(p,[]),/1 et 16/);
 assert.equal(REGION_BATCH_LIMIT,16);
 assert.throws(()=>previewRegionBatch(p,[{...a,coverage:200}]),/paramètres/);
 assert.equal(Object.keys(p.libraries.regions??{}).length,0);
});
test('watershed grid is deterministic, capped and identifies a central pit',()=>{
 const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100};
 const height=(x,z)=>Math.hypot(x,z);
 const first=analyzeWatersheds(bounds,height,-100,{stepM:10,maxCells:1024});
 assert.deepEqual(first,analyzeWatersheds(bounds,height,-100,{stepM:10,maxCells:1024}));
 assert.ok(first.sampled<=1024);
 assert.ok(first.basins.some(b=>b.kind==='pit'&&b.areaM2>0));
 assert.throws(()=>analyzeWatersheds(bounds,()=>NaN,0),/non finie/);
});
