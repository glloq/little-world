import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_MAP_REQUIREMENTS as defaults,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {planWorldTerrain} from '../src/studio-core/world-terrain-planner.ts';
import {provinceEnvironment} from '../src/studio-core/world-biome-planner.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {compositionCoverage} from '../src/studio-core/world-composition-quality.ts';
import {polygonArea} from '../src/studio-core/world-provinces.ts';
import {compilePolygon} from '../src/geography/archipelago.ts';
import {generatorField} from '../src/terrain-generator.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {previewWorldRecomposition,applyWorldRecomposition} from '../src/studio-core/world-recomposition.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
const req=(values={})=>({...structuredClone(defaults),...values});
test('V1 saved requirements reproduce published geography; the new version is explicit and validated',async()=>{
 const report=JSON.parse(await readFile(new URL('../docs/captures/composition/report.json',import.meta.url),'utf8'));
 for(const row of report.rows.slice(0,3)){
  assert.equal(row.requirements.compositionVersion,undefined);
  const p=composeWorld(row.requirements);
  assert.equal(fingerprint(p.project.world.terrain),row.signature,'An older world must not silently get new plateaus');
  const explicit=composeWorld({...row.requirements,compositionVersion:1});
  assert.deepEqual(p.project.world.terrain,explicit.project.world.terrain);
  assert.deepEqual(p.project.libraries,explicit.project.libraries);
 }
 assert.equal(defaults.compositionVersion,2);
 assert.throws(()=>validateMapRequirements(req({compositionVersion:3})));
});
test('provinces partition the full island in two dimensions; broad terraces replace the water ribbon',()=>{
 const r=req(),plan=planWorldTerrain(r),sum=plan.provinces.reduce((a,c)=>a+polygonArea(c.polygon),0);
 assert.ok(plan.provinces.length>=10&&plan.provinces.length<=16);
 assert.ok(Math.abs(sum-plan.landAreaM2)/plan.landAreaM2<1e-8,'No gaps or overlapping province areas');
 for(const p of plan.provinces){
  assert.ok(p.polygon.length<=48);assert.ok(compilePolygon(p.polygon)(p.center.x,p.center.z)>0);
  for(const q of plan.provinces)if(q!==p)assert.ok(compilePolygon(q.polygon)(p.center.x,p.center.z)<=1e-6);
 }
 const floor=plan.terrain.features.find(f=>f.id==='composition-terrace-0');
 assert.ok(polygonArea(floor.polygon)>plan.landAreaM2*.45);
 assert.equal(plan.terrain.features.filter(f=>f.kind==='valley').length,2);
 const current=composeWorld(r),legacy=composeWorld(req({compositionVersion:1}));
 const before=compositionCoverage(legacy.project,planWorldTerrain(req({compositionVersion:1})).axis),after=current.metrics.coverage;
 assert.ok(after.offRiverBiomeCoverage>.85);assert.ok(after.offRiverBiomeCoverage>before.offRiverBiomeCoverage+.5);
 assert.ok(after.terracedLandShare>.65);assert.equal(after.interiorSubseaSamples,0);
});
test('river follows successive ecological provinces, lateral biomes use local terrain and moisture',()=>{
 const r=req({biomeMode:'custom'}),plan=planWorldTerrain(r),composed=composeWorld(r),p=composed.project;
 assert.equal(composed.ready,true);assert.equal(composeWorld(req({biomeMode:'custom',seed:222})).ready,true,'A coast requested last follows the actual shoreline across seeds');
 const stations=plan.provinces.filter(q=>q.station!==undefined).sort((a,b)=>a.station-b.station),first=[];
 for(const province of stations){
  const inside=compilePolygon(province.polygon),at=plan.axis.findIndex(q=>inside(q.x,q.z)>1);
  assert.ok(at>=0,'Every requested sequence province is reached by the river');first.push(at);
 }
 assert.ok(first.every((at,i)=>!i||at>first[i-1]),'Requested upstream/downstream ordering');
 const wet=provinceEnvironment(p,stations[3],plan.axis);assert.ok(wet.altitudeM<=35);assert.equal(wet.waterDistanceM,0);
 const forest=p.libraries.regions['composition-region-1'],meadow=p.libraries.regions['composition-region-2'];
 assert.ok(forest.vegetation.trees>meadow.vegetation.trees*2);
 assert.ok(Object.values(p.libraries.regions).some(q=>q.id.startsWith('composition-side-region-')&&q.preset==='forest'));
 const river=p.libraries.water['composition-river-0'],field=generatorField(p.world.terrain,{...r,seaLevel:0},()=>0),end=river.points.at(-1);
 assert.ok(field.coast(end.x,end.z)<0,'The outlet reaches the actual ocean, not a flooded interior cut');
 assert.ok(field.coast(end.x,end.z)>-80,'Stop at the shore instead of drawing far into the ocean');
});
test('moving from V1 to provinces requires an explicit preview and one reversible transaction',()=>{
 const legacy=req({compositionVersion:1}),p=composeWorld(legacy).project,before=structuredClone(p),plan=previewWorldRecomposition(p,req());
 assert.deepEqual(p,before);assert.equal(plan.project.world.generation.compositionVersion,2);
 assert.notDeepEqual(plan.project.world.terrain,p.world.terrain);
 const bus=new CommandBus(p);editDocument(bus,'Composer les provinces',plan.chunks,d=>applyWorldRecomposition(d,plan));
 assert.equal(p.world.generation.compositionVersion,2);bus.undo();assert.deepEqual(p,before);bus.redo();assert.equal(p.world.generation.compositionVersion,2);
});
test('small and large maps keep native region/shape limits',()=>{
 for(const size of [500,8000]){
  const p=composeWorld(req({width:size,length:size,seed:33}));assert.equal(p.ready,true);
  assert.ok(p.metrics.features<=64);
  for(const region of Object.values(p.project.libraries.regions))assert.ok(Object.keys(region.generated.masks).length<=256);
  assert.ok(p.metrics.coverage.offRiverBiomeCoverage>.8);
 }
});
