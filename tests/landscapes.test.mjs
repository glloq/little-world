import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {archipelagoPreset} from '../src/geography/archipelago-params.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {localFileAssetResolver} from '../tools/compile-project.mjs';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {LANDSCAPE_PRESETS,LANDSCAPE_PRESET_LIST} from '../src/world-production/landscape-presets.ts';
import {LANDSCAPE_PRESET_IDS,fingerprint} from '../src/world-production/landscape-schema.ts';
import {applyLandscape,removeLandscape,newLandscape,landscapeRegions,previewLandscape,landscapeChunkIds} from '../src/world-production/landscapes.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';

const W=2000,L=3000;
function project(){
  return createProject({name:'Paysages',width:W,length:L,seed:77,projectId:'landscape-tests',worldId:'landscape-tests',terrain:{kind:'archipelago',version:1,archipelago:archipelagoPreset(W,L)}});
}
/** A site per preset: dry inland ground, except the beach (coast) — found from the relief. */
function site(p,presetId){
  const {ctx}=projectGeography(p),sea=p.world.seaLevel;
  for(let k=0;k<4000;k++){
    const x=Math.round(((k*7919)%1000)/1000*W*.7-W*.35),z=Math.round(((k*104729)%1000)/1000*L*.7-L*.35),h=ctx.height(x,z);
    if(presetId==='sandy-beach'){if(Math.abs(h-sea)<1.2)return {x,z};continue;}
    if(!(h>sea+12&&h<sea+80))continue;
    // Water presets need gentle ground (a river must not climb): low relief over the footprint.
    if(['river-bend','forest-valley'].includes(presetId)){const [w,l]=[240,300];let lo=Infinity,hi=-Infinity;for(let i=-4;i<=4;i++)for(let j=-4;j<=4;j++){const y=ctx.height(x+i*w/9,z+j*l/9);lo=Math.min(lo,y);hi=Math.max(hi,y);}if(hi-lo>12||lo<sea+3)continue;}
    return {x,z};
  }
  throw Error('no site for '+presetId);
}
const counts=g=>Object.fromEntries(['features','water','paths','entities','zones'].map(k=>[k,Object.keys(g[k]).length]));

test('ten presets with complete contracts (id, version, size, parameters, produced data)',()=>{
  assert.deepEqual(LANDSCAPE_PRESET_LIST.map(p=>p.id).sort(),[...LANDSCAPE_PRESET_IDS].sort());
  for(const p of LANDSCAPE_PRESET_LIST){assert.ok(p.version>=1&&p.label&&p.description&&p.produces.length&&p.defaultSize[0]>0&&p.params.length>0,p.id);for(const d of p.params)assert.ok(d.default!==undefined,p.id+'.'+d.key);}
});
test('every preset applies to a real project, produces re-editable data and keeps the source valid',()=>{
  for(const id of LANDSCAPE_PRESET_IDS){
    const p=project(),small=['river-bend','forest-valley'].includes(id)?{width:240,length:300}:{},inst=newLandscape(p,id,site(p,id),small),report=applyLandscape(p,inst);
    const g=p.libraries.landscapes[inst.id].generated,c=counts(g),masks=Object.keys(g.masks).length;
    assert.ok(report.added>0||masks>0,id+' produced nothing '+JSON.stringify(report));
    parseProject(p); // strict validation of the whole source, including libraries.landscapes
    if(['forest-valley','river-bend','marsh-basin','mountain-pass','waterfall-gorge','ancient-ruins','village-clearing'].includes(id))assert.ok(c.features>0,id+' relief');
    if(['river-bend','waterfall-gorge'].includes(id))assert.ok(c.water>0,id+' water '+JSON.stringify(report.diagnostics));
    if(['ancient-ruins','village-clearing','river-bend'].includes(id))assert.ok(c.entities>0,id+' entities');
    if(id==='village-clearing'){assert.ok(c.entities>=6&&c.paths>=2,'village content '+JSON.stringify(c));for(const e of Object.keys(g.entities)){const a=p.chunks[p.entityIndex[e].ownerChunkId].entities[e].components.Visual.assetId;assert.ok(p.assets[a],'asset definition added '+a);}}
    assert.ok(masks>0||id==='mountain-pass','masks '+id);
  }
});
test('application is deterministic and a regeneration with the same inputs changes nothing',()=>{
  const a=project(),b=project(),centre=site(a,'village-clearing');
  applyLandscape(a,newLandscape(a,'village-clearing',centre));applyLandscape(b,newLandscape(b,'village-clearing',centre));
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  const bus=new CommandBus(a),inst=a.libraries.landscapes['ls-village-clearing-1'];
  const tx=editDocument(bus,'Régénérer',landscapeChunkIds(a,inst),draft=>applyLandscape(draft,inst));
  const meaningful=(tx?.patches??[]).filter(patch=>!patch.path.includes('revision'));
  assert.equal(meaningful.length,0,'no-op regeneration: '+JSON.stringify(meaningful.slice(0,3).map(x=>x.path)));
});
test('manual corrections win: modified content is kept and detached, deleted content is not recreated, protected mask cells',()=>{
  const p=project(),inst=newLandscape(p,'village-clearing',site(p,'village-clearing'));applyLandscape(p,inst);
  const g=p.libraries.landscapes[inst.id].generated,houseId=Object.keys(g.entities).find(id=>id.includes('house')),pathId=Object.keys(g.paths)[0];
  // Author moves a house, deletes a lane and corrects a biome cell painted by the preset.
  const owner=p.entityIndex[houseId].ownerChunkId,house=structuredClone(p.chunks[owner].entities[houseId]);house.components.Transform.position.x+=3;
  putEntity(p,house);
  delete p.libraries.paths[pathId];for(const c of Object.values(p.chunks))c.pathRefs=c.pathRefs.filter(id=>id!==pathId);
  const [chunk,layers]=Object.entries(g.masks).find(([,l])=>l.biome);const cell=layers.biome.search(/[^.]/);
  const mask=p.chunks[chunk].layers.biome;p.chunks[chunk].layers={...p.chunks[chunk].layers,biome:mask.slice(0,cell)+'f'+mask.slice(cell+1)};
  const report=applyLandscape(p,{...p.libraries.landscapes[inst.id],seed:inst.seed+1});
  assert.ok(report.conflicts.some(c=>c.id===houseId),'moved house reported');
  assert.equal(p.chunks[p.entityIndex[houseId].ownerChunkId].entities[houseId].components.Transform.position.x,house.components.Transform.position.x,'moved house kept');
  assert.ok(!p.libraries.landscapes[inst.id].generated.entities[houseId],'moved house detached from the preset');
  assert.ok(report.respectedDeletions.some(c=>c.id===pathId)&&!p.libraries.paths[pathId],'deleted lane not recreated');
  assert.equal(p.chunks[chunk].layers.biome[cell],'f','author mask cell protected');assert.ok(report.maskCells.protected>=1);
  parseProject(p);
  // Explicit overwrite (confirmed in the Studio) restores generated content.
  const forced=applyLandscape(p,p.libraries.landscapes[inst.id],{overwrite:true});assert.ok(p.libraries.paths[pathId],'overwrite recreates the lane '+JSON.stringify(forced.diagnostics));
});
test('undo/redo through the shared command bus restores the exact source; removal keeps modified content',()=>{
  const p=project(),inst=newLandscape(p,'forest-valley',site(p,'forest-valley'),{width:240,length:300}),before=JSON.stringify(p),bus=new CommandBus(p);
  editDocument(bus,'Appliquer le paysage',landscapeChunkIds(p,inst),draft=>applyLandscape(draft,inst));
  const applied=JSON.stringify(bus.document);assert.notEqual(applied,before);
  bus.undo();assert.equal(JSON.stringify(bus.document),before);bus.redo();assert.equal(JSON.stringify(bus.document),applied);
  const q=structuredClone(bus.document),stream=Object.keys(q.libraries.landscapes[inst.id].generated.water)[0];
  q.libraries.water[stream]={...q.libraries.water[stream],width:5};
  const removal=removeLandscape(q,inst.id);assert.ok(removal.removed>0);assert.ok(removal.conflicts.some(c=>c.id===stream)&&q.libraries.water[stream],'edited stream kept');
  assert.ok(!q.libraries.landscapes[inst.id]);assert.equal(q.world.terrain.archipelago.features.filter(f=>f.id.startsWith(inst.id)).length,0);parseProject(q);
});
test('preview is a dry run; fingerprints ignore key order',()=>{
  const p=project(),inst=newLandscape(p,'marsh-basin',site(p,'marsh-basin')),before=JSON.stringify(p),r=previewLandscape(p,inst);
  assert.equal(JSON.stringify(p),before);assert.ok(r.added+r.maskCells.painted>0);
  assert.equal(fingerprint({a:1,b:{c:2,d:[1,2]}}),fingerprint({b:{d:[1,2],c:2},a:1}));
});
test('landscapes travel source → runtime geography and compiled world (dressing regions)',async()=>{
  const p=project(),inst=newLandscape(p,'sandy-beach',site(p,'sandy-beach'),{params:{palms:true}});applyLandscape(p,inst);
  const regions=landscapeRegions(p.libraries.landscapes);assert.equal(regions.length,1);assert.ok(regions[0].palms);
  assert.deepEqual(toRuntimeWorld(parseProject(p)).geography.landscapes,regions);
  const result=await compileProject(p,{resolveAsset:localFileAssetResolver()}).catch(e=>{throw Error(JSON.stringify(e.diagnostics?.filter(d=>d.severity==='ERROR').slice(0,3)));});
  const files=result.files,fetcher=async url=>{const key=String(url).replace('mem://w/','');return files[key]!==undefined?new Response(files[key]):new Response('',{status:404});};
  const playable=playableFromCompiled(await openCompiledWorld('mem://w/manifest.json',fetcher));
  assert.deepEqual(playable.world.geography.landscapes,regions);
});
