import test from 'node:test';
import assert from 'node:assert/strict';
import {composeWorld,projectFromComposition} from '../src/studio-core/world-composition.ts';
import {simpleOutline,validateCompositionDraft} from '../src/studio-core/composition-draft.ts';
import {DEFAULT_MAP_REQUIREMENTS} from '../src/studio-core/map-requirements.ts';
import {selectIslandStyle} from '../src/studio-core/island-styles.ts';
import {putTerrainEdit} from '../src/studio-core/source.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {naturalQuality} from '../src/studio-core/world-natural-quality.ts';
const r=selectIslandStyle(DEFAULT_MAP_REQUIREMENTS,'gentle'),base=composeWorld(r);
test('edited composition is the exact validated source, not a re-run of generation',()=>{
 const p=structuredClone(base.project),f=p.world.terrain.archipelago.features.find(f=>f.id==='composition-main-massif');f.heightM+=10;
 const result=validateCompositionDraft(base,p);assert.equal(result.project.world.terrain.archipelago.features.find(q=>q.id===f.id).heightM,f.heightM);
 assert.equal(fingerprint(result.project.world.terrain),fingerprint(p.world.terrain));assert.notEqual(fingerprint(result.project.world.terrain),fingerprint(base.project.world.terrain));assert.deepEqual(result.project.world.generation,r);
 if(result.ready)assert.equal(fingerprint(projectFromComposition(result,'Edited').world.terrain),fingerprint(p.world.terrain));
});
test('crossing, degenerate and touching outlines are rejected while a concave outline is valid',()=>{
 const point=(x,z)=>({x,z}),concave=[point(0,0),point(10,0),point(10,10),point(5,4),point(0,10)];assert.ok(simpleOutline(concave));
 assert.equal(simpleOutline([point(0,0),point(10,10),point(0,10),point(10,0)]),false);assert.equal(simpleOutline([point(0,0),point(10,0),point(0,0),point(0,10)]),false);
 const p=structuredClone(base.project);p.world.terrain.archipelago.landmasses[0].outline=[point(0,0),point(100,100),point(0,100),point(100,0)];
 const result=validateCompositionDraft(base,p);assert.equal(result.ready,false);assert.ok(result.diagnostics.some(d=>d.code==='DRAFT_OUTLINE'));assert.throws(()=>projectFromComposition(result,'Invalid'));
});
test('moving water against the slope is blocked without altering the editable document',()=>{
 const p=structuredClone(base.project),river=Object.values(p.libraries.water)[0];river.points.reverse();river.level=1;
 const before=fingerprint(p),result=validateCompositionDraft(base,p);assert.equal(result.ready,false);assert.ok(result.diagnostics.some(d=>d.severity==='ERROR'&&d.code.startsWith('WATER_')));assert.equal(fingerprint(p),before);
});
test('terrain brush edits are included in the measured final maximum',()=>{
 const p=structuredClone(base.project),original=naturalQuality(p).maxAltitudeM;
 putTerrainEdit(p,{id:'draft-bump',x:0,z:0,radius:40,strength:4,mode:'flatten',height:500});
 assert.ok(naturalQuality(p).maxAltitudeM>original+10);
});
test('all six generated styles can enter the editable draft without losing validity',()=>{
 for(const model of ['gentle','central-massif','side-massif','volcanic','caldera','stepped']){
  const generated=composeWorld(selectIslandStyle(DEFAULT_MAP_REQUIREMENTS,model)),checked=validateCompositionDraft(generated,generated.project);assert.equal(checked.ready,true,model+JSON.stringify(checked.diagnostics));
 }
});
