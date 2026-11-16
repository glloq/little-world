import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {representationFor,projectedPixels,REPRESENTATION_BUDGETS} from '../src/render/representation-policy.ts';
import {parseImpostorManifest,IMPOSTOR_LIMITS} from '../src/render/impostor-manifest.ts';
import {SharedResourceCache} from '../src/render/resource-cache.ts';
const view={fov:66,height:720,quality:0};
test('shared representation policy depends on angular size and retains hysteresis',()=>{
 assert.ok(projectedPixels(10,100,66,720)>projectedPixels(10,200,66,720));
 assert.equal(representationFor('tree',10,200,view,'lod1',true),'lod1');
 assert.equal(representationFor('tree',10,215,view,'lod1',true),'impostor');
 assert.equal(representationFor('tree',10,205,view,'impostor',true),'impostor');
 assert.equal(representationFor('tree',10,215,view,'impostor',false),'lod2');
 assert.equal(representationFor('character',1.7,3000,view),'hidden');
 assert.ok(REPRESENTATION_BUDGETS[2].fullCharacters<REPRESENTATION_BUDGETS[0].fullCharacters);
});
test('shared atlas cache pins live resources, reuses loads and evicts unused LRU',async()=>{
 let disposed=0;const cache=new SharedResourceCache(100),load=async()=>({bytes:80,dispose(){disposed++;}});
 const a=cache.acquire('a',load),a2=cache.acquire('a',load);await a.promise;await a2.promise;assert.equal(cache.stats.loads,1);
 const b=cache.acquire('b',load);await b.promise;a.release();assert.equal(disposed,0);a2.release();assert.equal(disposed,1);assert.equal(cache.stats.bytes,80);
 b.release();cache.trim(0);assert.equal(disposed,2);assert.equal(cache.stats.entries,0);
 const failed=cache.acquire('bad',async()=>{throw Error('offline');});await assert.rejects(failed.promise);failed.release();assert.equal(cache.stats.entries,0);
});
const manifest=parseImpostorManifest(JSON.parse(await readFile(new URL('../public/impostors/manifest.json',import.meta.url),'utf8')));
test('derived atlases are bounded, source-current, multi-angle and include flying top/bottom views',async()=>{
 let bytes=0;
 for(const p of Object.values(manifest.pages)){
  assert.ok((await readFile(new URL('../public/'+p.image,import.meta.url))).length>0);bytes+=p.width*p.height*4;
  for(const e of p.entries){assert.equal(e.views,4);if(e.id.startsWith('hamster.'))assert.equal(e.frames,3);}
 }
 assert.ok(bytes<IMPOSTOR_LIMITS.maxAtlasBytes);
 assert.ok(manifest.pages.characters.entries.find(e=>e.id==='hamster.glide').elevations[0]<0);
 const registry=JSON.parse(await readFile(new URL('../assets/world-assets.json',import.meta.url),'utf8'));
 for(const e of manifest.pages.trees.entries){const asset=registry.assets.find(a=>a.id===e.id),file=await readFile(new URL('../public/'+asset.lods[0].file,import.meta.url));assert.equal(e.sourceHash,createHash('sha256').update(file).digest('hex'));}
});
test('corrupt or oversized atlases are rejected before WebGL allocation',()=>{
 const bad=structuredClone(manifest);bad.pages.trees.width=999999;assert.throws(()=>parseImpostorManifest(bad));
 const path=structuredClone(manifest);path.pages.trees.image='https://example.test/atlas.png';assert.throws(()=>parseImpostorManifest(path));
 const index=structuredClone(manifest);index.pages.trees.entries[0].first=99999;assert.throws(()=>parseImpostorManifest(index));
});

test('snapshot interpolation has bounded history and extrapolation, preserves discrete events until their timestamp',async()=>{
 const {PresentationBuffer}=await import('../src/render/presentation-buffer.ts');
 const base={v:1,t:0,x:0,y:0,z:0,yaw:Math.PI-.1,mode:'ground',speed:2,verticalSpeed:0,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null};
 const h=new PresentationBuffer(),out={...base};h.push(base);h.push({...base,t:1,x:10,yaw:-Math.PI+.1,action:'INTERACT',actionSeq:1});
 h.sample(.5,out);assert.equal(out.x,5);assert.ok(Math.abs(out.yaw-Math.PI)<.001);assert.equal(out.actionSeq,0);
 h.sample(100,out);assert.equal(out.x,12.5);assert.equal(out.actionSeq,1);
 assert.equal(h.push({...base,t:1}),false);for(let i=2;i<50;i++)h.push({...base,t:i});assert.equal(h.samples.length,12);assert.equal(h.push(base),false);
});

test('CPU sampler retains a bounded window and separates simulation, update and submission',async()=>{
 const {PerfSampler}=await import('../src/render/perf-sampler.ts');const p=new PerfSampler(4);for(let i=0;i<10;i++)p.record(i*10,1,2,3);const s=p.snapshot();assert.equal(s.samples,4);assert.equal(s.frameMs.p50,80);assert.equal(s.simulationMs.p99,1);assert.equal(s.updateMs.p99,2);assert.equal(s.submitMs.p99,3);assert.equal(s.longFrames,4);
});

test('a resource released while loading is disposed when its late result arrives',async()=>{
 let resolve,disposed=0;const cache=new SharedResourceCache(1024);const ticket=cache.acquire('late',()=>new Promise(r=>resolve=r));ticket.release();cache.trim(0);resolve({bytes:80,dispose(){disposed++;}});await ticket.promise;assert.equal(disposed,1);assert.equal(cache.stats.bytes,0);assert.equal(cache.stats.entries,0);
});

test('offline alpha crops retain transparent filtering margin and WebGL bottom-up coordinates',async()=>{
 const {atlasCrops}=await import('../src/render/atlas-crop.ts');const pixels=new Uint8ClampedArray(16*16*4);pixels[(2*16+6)*4+3]=255;
 // Image row 2 belongs to the upper atlas tile (tile index 2), not index 0.
 const crops=atlasCrops(pixels,16,16,8,2,4);assert.deepEqual(crops[0],[0,0,1,1]);assert.deepEqual(crops[2],[5/8,4/8,1,7/8]);
 const p=manifest.pages.trees;assert.ok(p.crops.length===p.anchors.length);assert.ok(p.crops.some(c=>(c[2]-c[0])*(c[3]-c[1])<.5));
 const bad=structuredClone(manifest);bad.pages.trees.crops[0]=[0,0,2,1];assert.throws(()=>parseImpostorManifest(bad));
 const legacy=structuredClone(manifest);for(const p of Object.values(legacy.pages))delete p.crops;assert.doesNotThrow(()=>parseImpostorManifest(legacy));
});

test('gradual camera zoom invalidates representations from the last rebuilt view, including framebuffer resize',async()=>{
 const {representationViewChanged}=await import('../src/render/representation-policy.ts');const origin={x:0,y:30,z:0,fov:66,height:720};let planned={...origin},rebuilds=0;
 for(let i=1;i<=40;i++){const current={...origin,fov:66+i*.25};if(representationViewChanged(current,planned)){rebuilds++;planned=current;}}
 assert.ok(rebuilds>=2,'small per-frame changes must accumulate instead of leaving stale LODs');assert.equal(representationViewChanged(planned,planned),false);assert.equal(representationViewChanged({...planned,height:1080},planned),true);
});
