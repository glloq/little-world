import test from 'node:test';
import assert from 'node:assert/strict';
import {composeWorld,projectFromComposition} from '../src/studio-core/world-composition.ts';
import {DEFAULT_MAP_REQUIREMENTS as defaults,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {RIVER_BIOME_SPAN} from '../src/studio-core/world-biome-planner.ts';
import {planWorldTerrain} from '../src/studio-core/world-terrain-planner.ts';
import {parseProject,createProject,validateLine} from '../src/studio-core/schema.ts';
import {compileWaterNetwork,validateWaterProfile,validateWaterNetworkFields,WATER_ALTITUDE} from '../src/water/profile.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {readProjectArchive,writeProjectArchive} from '../src/studio-core/archive.ts';
import {previewWorldRecomposition,applyWorldRecomposition} from '../src/studio-core/world-recomposition.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {localFileAssetResolver} from '../tools/compile-project.mjs';
import {putWater} from '../src/studio-core/source.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {maskCell} from '../src/geography/layers.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
const req=(values={})=>({...structuredClone(defaults),...values});
const geography=p=>({terrain:p.world.terrain,water:p.libraries.water,regions:p.libraries.regions,chunks:p.chunks});
test('composition is deterministic, previewed plan saved exactly, preferences do not mutate',()=>{
 const r=req(),before=structuredClone(r),a=composeWorld(r),b=composeWorld(r);
 assert.equal(a.ready,true);assert.deepEqual(r,before);assert.deepEqual(geography(a.project),geography(b.project));
 const hash=fingerprint(a.project),saved=projectFromComposition(a,'Carte créée');
 assert.deepEqual(geography(saved),geography(a.project));assert.equal(fingerprint(a.project),hash);
 assert.equal(saved.manifest.name,'Carte créée');assert.throws(()=>projectFromComposition(a,''));
 assert.deepEqual(readProjectArchive(writeProjectArchive(saved)),saved);
 const older=createProject({name:'Ancien projet'});assert.equal(parseProject(older).world.generation,undefined);
 assert.throws(()=>parseProject({...saved,world:{...saved.world,generation:{...r,seed:NaN}}}));
});
test('strict requirements and unfulfilled mandatory criteria block creation',()=>{
 for(const values of [{seed:NaN},{terraces:7},{rivers:1.2},{type:'moon'},{waterfalls:'yes'},{sequence:['forest','forest']},{landscapes:[{kind:'unknown',required:true}]},{biomeMode:'custom',sequence:['lake']}])assert.throws(()=>validateMapRequirements(req(values)));
 const unsupported=composeWorld(req({type:'continental'}));assert.equal(unsupported.ready,false);assert.throws(()=>projectFromComposition(unsupported,'Refus'));
 const impossible=composeWorld(req({rivers:6,tributaries:6}));assert.equal(impossible.ready,false);assert.ok(impossible.diagnostics.some(d=>d.code==='RIVERS_MISSING'||d.code==='TRIBUTARIES_MISSING'));
 const missing=composeWorld(req({biomeMode:'custom',sequence:['forest']}));assert.equal(missing.ready,false);assert.ok(missing.diagnostics.some(d=>d.code==='LANDSCAPE_MISSING'));
 const optional=composeWorld(req({landscapes:[{kind:'forest',required:false},{kind:'mountain',required:false}],biomeMode:'custom',sequence:['forest']}));assert.equal(optional.ready,true);assert.ok(optional.diagnostics.some(d=>d.severity==='WARNING'&&d.code==='LANDSCAPE_MISSING'));
});
test('30 seeds, three 4x3 km configurations: valid descending WATER, different macro geography and bounded sources',()=>{
 const signatures=new Set(),families=new Set();
 for(let i=0;i<30;i++){
  const r=req({seed:101+i*7919,terraces:1+i%6,cliffs:[.1,.4,.8][i%3],relief:['gentle','balanced','rugged'][i%3],type:i%3===0?'archipelago':'island'});
  const plan=composeWorld(r);assert.equal(plan.ready,true,JSON.stringify({seed:r.seed,diagnostics:plan.diagnostics}));
  const p=plan.project,water=Object.values(p.libraries.water),compiled=compileWaterNetwork(water,projectGeography(p).source,0);
  assert.ok(water.length>=r.rivers);assert.equal(water[0].to.kind,'sea');
  for(const river of compiled){assert.equal(river.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE'),false);for(let j=1;j<river.points.length;j++)assert.ok(river.points[j].level<=river.points[j-1].level+1e-6);}
  assert.ok(plan.metrics.coverage.biomeCoverage>.8);assert.ok(plan.metrics.coverage.offRiverBiomeCoverage>.8);assert.ok(plan.metrics.coverage.terracedLandShare>.55);assert.equal(plan.metrics.coverage.interiorSubseaSamples,0);
  assert.ok(plan.metrics.features<=64);assert.ok(plan.metrics.surveyCells<=1024);assert.ok(plan.metrics.sectors<=512);assert.ok(plan.metrics.sourceBytes<2*1024*1024);
  for(const region of Object.values(p.libraries.regions)){assert.ok(Object.keys(region.generated.masks).length<=256);assert.ok(region.points.length<=48);}
  signatures.add(fingerprint(p.world.terrain));families.add(plan.family);
 }
 assert.equal(signatures.size,30);assert.ok(families.size>=3);
 const base=planWorldTerrain(req()),ecology=planWorldTerrain(req({biomeMode:'custom',sequence:['forest'],landscapes:[{kind:'forest',required:true},{kind:'mountain',required:true}]}));
 assert.deepEqual(base.axis,ecology.axis);assert.deepEqual(base.terrain,ecology.terrain);
 const adjacent=planWorldTerrain(req({seed:4243}));assert.ok(base.axis.reduce((sum,p,i)=>sum+Math.hypot(p.x-adjacent.axis[i].x,p.z-adjacent.axis[i].z),0)/base.axis.length>100,'Adjacent seeds move the drainage corridor, not just noise');
});
test('ordered biome masks cover the actual river and lateral terrain; native terraces decrease',()=>{
 const plan=composeWorld(req({compositionVersion:1,biomeMode:'custom',sequence:['mountain','forest','meadow','marsh','coast']})),p=plan.project;
 const expected=['mountain','forest','meadow','marsh','coast'];
 const regions=Object.values(p.libraries.regions).filter(r=>r.id.startsWith('composition-region-'));
 assert.deepEqual(regions.map(r=>r.preset),expected);
 const axis=planWorldTerrain(p.world.generation).axis;
 const geo=projectGeography(p),codes=['n','f','m','w','c'];
 for(let i=0;i<5;i++){
  const at=axis[Math.round((i+.5)/5*axis.length*RIVER_BIOME_SPAN)],cell=maskCell(geo.sources.grid,at.x,at.z);
  assert.equal(p.chunks[cell.chunkId].layers.biome[cell.index],codes[i]);
 }
 assert.equal(Object.keys(p.entityIndex).length,0);
 assert.ok(Object.keys(p.libraries.regions).some(id=>id.includes('side-region')));
 const shelves=p.world.terrain.archipelago.features.filter(f=>f.id.startsWith('composition-terrace-'));
 assert.equal(shelves.length,3);assert.ok(shelves.every((f,i)=>i===0||f.heightM<shelves[i-1].heightM));
 const coastRegression=composeWorld(req({compositionVersion:1,biomeMode:'custom',seed:222}));assert.equal(coastRegression.ready,true,'Coastal sequence must reach the actual mouth across variations');
});
test('mountain WATER altitude envelope, manual profiles and waterfalls validate and compile',async()=>{
 assert.deepEqual(WATER_ALTITUDE,{min:-300,max:1500});
 const p=createProject({name:'Eau élevée',width:1000,length:1000});
 const w={id:'high',kind:'river',points:[{x:0,z:0},{x:0,z:30},{x:0,z:60}],width:6,depth:2,level:450,profile:{mode:'manual',levels:[450,400,300]},falls:[{at:1,top:400,bottom:350}]};
 validateLine(w,p.world,true);validateWaterProfile(w.profile,3);validateWaterNetworkFields(w);
 const c=compileWaterNetwork([w],(_,z)=>450-z*2.5)[0];assert.equal(c.diagnostics.some(d=>d.severity==='ERROR'),false);
 assert.equal(c.falls[0].top,400);assert.throws(()=>validateWaterProfile({mode:'manual',levels:[1501,1400]},2));
 putWater(p,w);const high=await compileProject(p,{resolveAsset:localFileAssetResolver()});const logic=JSON.parse(high.files[high.manifest.logic.url]);assert.equal(logic.libraries.water.high.level,450);assert.equal(logic.libraries.water.high.falls[0].top,400);
 const plan=composeWorld(req());const compiled=await compileProject(plan.project,{resolveAsset:localFileAssetResolver()});
 assert.ok(compiled.manifest.chunks.length>0);assert.ok(compiled.files);
});
test('lakes are actual validated closed WATER, unmet lake wishes are diagnosed',()=>{
 const plan=composeWorld(req({seed:10,lakes:true}));assert.equal(plan.ready,true);
 assert.ok(Object.values(plan.project.libraries.water).some(w=>w.kind==='lake'));
 const c=compileWaterNetwork(Object.values(plan.project.libraries.water),projectGeography(plan.project).source,0);
 assert.equal(c.some(w=>w.diagnostics.some(d=>d.severity==='ERROR'||d.code==='LAKE_SPILL')),false);
});
test('recomposition preview is pure, stale or manually edited sources are protected; one undo transaction',()=>{
 const p=composeWorld(req()).project,before=structuredClone(p);
 const preview=previewWorldRecomposition(p,req({seed:222}));assert.deepEqual(p,before);
 const bus=new CommandBus(p,parseProject);
 editDocument(bus,'Recomposer',preview.chunks,d=>applyWorldRecomposition(d,preview));
 assert.equal(p.world.generation.seed,222);assert.equal(bus.canUndo,true);bus.undo();assert.deepEqual(p,before);bus.redo();assert.equal(p.world.generation.seed,222);
 const savedPreview=previewWorldRecomposition(p,req({seed:444}));p.manifest.revision++;assert.doesNotThrow(()=>applyWorldRecomposition(structuredClone(p),savedPreview));
 const stale=previewWorldRecomposition(p,req({seed:333}));p.manifest.name='Retouche';assert.throws(()=>applyWorldRecomposition(p,stale),/changé/);
 p.world.terrain.archipelago.features[0].heightM+=2;assert.throws(()=>previewWorldRecomposition(p,req({seed:333})),/protégée/);
});
test('region-only regeneration preserves hand-painted masks, modified recipes and deleted regions',()=>{
 const p=composeWorld(req()).project,region=p.libraries.regions['composition-region-1'];
 const [chunk,layers]=Object.entries(region.generated.masks)[0],index=layers.biome.indexOf('f');assert.ok(index>=0);
 p.chunks[chunk].layers.biome=p.chunks[chunk].layers.biome.slice(0,index)+'w'+p.chunks[chunk].layers.biome.slice(index+1);
 region.name='Forêt personnalisée';delete p.libraries.regions['composition-region-0'];
 const original=fingerprint(p),preview=previewWorldRecomposition(p,req(),'biomes');assert.equal(fingerprint(p),original);
 assert.equal(preview.project.chunks[chunk].layers.biome[index],'w');assert.equal(preview.project.libraries.regions[region.id].name,'Forêt personnalisée');assert.equal(preview.project.libraries.regions['composition-region-0'],undefined);
 assert.deepEqual(preview.project.world.terrain,p.world.terrain);assert.deepEqual(preview.project.libraries.water,p.libraries.water);
});
