/** Produced audio files: presence, catalogue integration, technical QC, distinct takes and
 * bit-exact reproducibility of the offline synthesis. No test here claims a listening check. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseAudioDefinitionV2,assetPlayable} from '../src/audio/catalog.ts';
import {buildAudioCatalog} from '../src/audio/catalog-source.ts';
import {RECIPES} from '../tools/audio-synth/recipes.mjs';
import {renderBytes} from '../tools/audio-synth/render.mjs';
import {readWav} from '../tools/audio-synth/dsp.mjs';
import {measure,check,groupCheck} from '../tools/audio-synth/qc.mjs';
const json=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const catalog=parseAudioDefinitionV2(await json('../public/audio/catalog.json')),produced=(await json('../assets/audio/produced.json')).files,report=await json('../assets/audio/qc-report.json');
const samples=Object.entries(produced).filter(([,e])=>e.file.endsWith('.wav'));
const bytesOf=async e=>new Uint8Array(await readFile(new URL('../public/'+e.file,import.meta.url)));

test('every produced file exists, is registered in the catalogue with its hash, and is playable',async()=>{
 assert.ok(samples.length>=100);
 for(const [id,e]of Object.entries(produced)){const a=catalog.assets[id],bytes=await bytesOf(e);assert.ok(a,id);assert.equal(a.uri,e.file);assert.equal(a.status,e.status);assert.ok(assetPlayable(a),id);
  assert.equal(a.bytes,bytes.length);assert.equal(a.contentHash,'sha256-'+createHash('sha256').update(bytes).digest('hex'));assert.ok(e.source&&e.license&&e.generatorVersion,id);
  assert.notEqual(e.status,'VERIFIED','no human listening has been performed: nothing may be VERIFIED');}
});
test('produced WAV files pass the technical QC again (mono 16-bit, peak, clipping, DC, edges, silence, loop seams)',async()=>{
 for(const [id,e]of samples){const w=readWav(await bytesOf(e));assert.equal(w.channels,1,id);assert.ok([44100,22050].includes(w.sr),id);const r=report[id],loop=r.loop,m=measure(w.x,w.sr,{loop});
  assert.deepEqual(check(m,{loop}),[],id);assert.ok(Math.abs(m.peakDb-r.peakDb)<.2,id);if(loop)assert.ok(w.x.length/w.sr>=4&&w.x.length/w.sr<=8,id);else assert.ok(w.x.length/w.sr<=3.5,id);}
});
test('takes of a group are genuinely different and level-coherent; placeholder recipes are flagged for listening',async()=>{
 const groups=new Map();for(const [id,e]of samples){const g=report[id].group,list=groups.get(g)??[];list.push({id,x:readWav(await bytesOf(e)).x,m:report[id]});groups.set(g,list);}
 for(const [g,items]of groups){assert.deepEqual(groupCheck(items),[],g);for(const it of items)assert.equal(produced[it.id].status,RECIPES[g].confidence==='placeholder'?'LISTENING_REVIEW':'TECHNICALLY_VALID',it.id);}
 const take=(g,k)=>groups.get(g)?.find(i=>i.id.endsWith('-0'+k));
 // Physical plausibility of materials (spectral centroid ordering), measured, not listened.
 const c=g=>groups.get(g).reduce((s,i)=>s+i.m.centroidHz,0)/groups.get(g).length;
 assert.ok(c('fs-wood')<c('fs-dirt')&&c('fs-mud')<c('fs-dirt')&&c('fs-grass')<c('fs-gravel')&&c('fs-grass')<c('fs-sand'),'footstep materials ordered');
 assert.ok(c('mine-hit-softrock')<c('mine-hit-hardrock'),'soft rock duller than hard rock');assert.ok(take('fs-grass',1)&&take('fs-grass',4));
});
test('offline synthesis is bit-exact reproducible from the recipes',async()=>{
 const library=Object.fromEntries(Object.entries(catalog.assets).filter(([,a])=>a.uri?.startsWith('audio/library/')));
 const plan=buildAudioCatalog(library,{}).production.filter(p=>produced[p.assetId]&&p.kind==='sample');assert.equal(plan.length,samples.length);
 for(const item of plan){const expected=await bytesOf(produced[item.assetId]);assert.ok(Buffer.from(renderBytes(item)).equals(Buffer.from(expected)),item.assetId);}
});
test('decoded PCM of every produced file fits the eco budget; loops leave room for gameplay sounds',async()=>{
 for(const [id,e]of samples){const decoded=catalog.assets[id].duration*48000*4;assert.ok(decoded<=2_097_152*.8,`${id} ${Math.round(decoded/1024)} Kio`);}
});
