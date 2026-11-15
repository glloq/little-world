import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidedWorld} from '../src/studio-core/world-start.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {newRegion,applyRegion} from '../src/studio-core/region-recipes.ts';
import {REGION_TREE_SPECIES} from '../src/studio-core/region-schema.ts';
import {regionDressingRegions} from '../src/studio-core/region-dressing.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {BIOTOPES,treeMix,createLandscapeSampler,landscapeInfluenceAt} from '../src/world-production/biotopes.ts';
import {generateDressingCell} from '../src/geography/dressing.ts';
const make=()=>createGuidedWorld({name:'B2 vegetation region',mode:'calm',width:1000,length:1000,seed:79,cliffs:0,volcano:false});
const points=[{x:-120,z:-120},{x:120,z:-120},{x:120,z:120},{x:-120,z:120}];
const tune={trees:0,shrubs:0,ground:0,deadwood:0,treeMix:{'nature.pine':15,'nature.conifer_tall':5}};
test('B2 schema allows old regions without a vegetation block but rejects rogue species, density and unknown fields',()=>{
 const p=make(),r=newRegion(p,{points});
 delete r.vegetation;applyRegion(p,r);parseProject(structuredClone(p));
 const old=structuredClone(p.libraries.regions[r.id]);
 old.vegetation={...tune,trees:2.5};
 assert.throws(()=>applyRegion(p,old),/densités/);
 old.vegetation={...tune,treeMix:{'nature.fake_tree':2}};
 assert.throws(()=>applyRegion(p,old),/essence/);
 old.vegetation={...tune};applyRegion(p,old);parseProject(structuredClone(p));
 assert.ok(REGION_TREE_SPECIES.includes('nature.pine'));
});
test('B2 polygon influence appears in Studio and playable world but never serializes individual trees',()=>{
 const p=make(),region=newRegion(p,{points,preset:'forest',coverage:100,transitionM:20,vegetation:tune});
 applyRegion(p,region);
 assert.equal(Object.keys(p.entityIndex).length,0);
 const regional=regionDressingRegions(p.libraries.regions);
 assert.equal(regional.length,1);assert.deepEqual(regional[0].polygon,points);
 const geo=projectGeography(p).ctx;assert.deepEqual(geo.landscape?.(0,0)?.vegetation,tune);
 assert.equal(geo.landscape?.(150,150),null);
 const preview=toRuntimeWorld(p);assert.ok(preview.geography?.landscapes?.some(x=>x.polygon&&x.vegetation));
 parseProject(structuredClone(p));
});
test('B2 polygon has genuinely geometric boundary, precompiles lookup and fades smoothly',()=>{
 const shape=[{x:-35,z:-20},{x:35,z:-20},{x:0,z:45}];
 const scene=[{id:'b2',x:0,z:12,width:70,length:65,rotation:0,edgeM:15,polygon:shape,vegetation:tune}];
 const sample=createLandscapeSampler(scene);
 assert.equal(sample(0,0)?.vegetation?.trees,0);
 assert.equal(sample(0,40)?.weight>0,true);
 assert.equal(sample(32,40),null); // in AABB but outside triangular polygon
 assert.equal(landscapeInfluenceAt(scene,0,0)?.weight,sample(0,0)?.weight);
});
test('B2 weighted conifer preference is deterministic, with natural biotope fallback beyond region',()=>{
 const landscape={weight:1,vegetation:tune};
 const mix=treeMix(BIOTOPES['temperate-forest'],landscape);
 assert.deepEqual(Object.keys(mix).sort(),['nature.conifer_tall','nature.pine'].sort());
 assert.equal(Math.round(mix['nature.pine']/mix['nature.conifer_tall']),3);
 const near=treeMix(BIOTOPES['temperate-forest'],{...landscape,weight:0});
 assert.ok(Object.keys(near).length>2,'native species returned at boundary');
});
test('B2 density zero removes native vegetation without GLB entity spawning, while leaving geology renderer',()=>{
 const p=make(),r=newRegion(p,{points,preset:'forest',coverage:100,transitionM:0,vegetation:{trees:0,shrubs:0,ground:0,deadwood:0}});
 applyRegion(p,r);
 const ctx=projectGeography(p).ctx;
 const c=generateDressingCell(ctx,p.world.seed,0,0,()=>true);
 for(const key of ['pine','oak','shrub','plant','deadwood'])assert.equal(c.items[key].length,0,key+' should be excluded');
 assert.equal(Object.keys(p.entityIndex).length,0);
});
