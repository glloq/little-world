import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRegistry} from '../tools/build-world-assets.mjs';
import {WORLD_ASSETS,worldAsset,placeableWorldAssets,registryDiagnostics,exclusionRadius,assetDefinitionFor,generatorAssets,groundOffset} from '../src/world-production/registry.ts';
import {ASSET_USAGE} from '../src/world-production/asset-usage.ts';

test('committed registry matches the real GLB files and manifests (no drift)',async()=>{
  const fresh=await buildRegistry(),committed=JSON.parse(await readFile(new URL('../assets/world-assets.json',import.meta.url),'utf8'));
  assert.deepEqual(committed,JSON.parse(JSON.stringify(fresh)),'npm run generate:world-assets');
  assert.equal(fresh.diagnostics.filter(d=>d.severity==='ERROR').length,0,JSON.stringify(fresh.diagnostics));
});
test('inventory covers the merged asset branch: 26 vegetation lot models, enclosures, bridges, dock, buildings',()=>{
  const groups={};for(const a of WORLD_ASSETS.assets)groups[a.group]=(groups[a.group]??0)+1;
  assert.equal((groups.trees??0)+(groups.shrubs??0)+(groups.ground??0)+(groups.deadwood??0),26);
  assert.equal(groups.hedges,5);assert.equal(groups.fences,6);assert.equal(groups.walls,5);assert.equal(groups.bridges,3);assert.equal(groups.dock,5);assert.equal(groups.buildings,5);
  for(const id of ['nature.broadleaf_round','nature.hazel_thin','nature.palm_curved','nature.log_fallen','nature.reeds_patch','structure.bridge_stone','architecture.windmill_stone'])assert.ok(worldAsset(id),id);
  // Rejected groves of the asset lots must never come back under their old models.
  assert.ok(!WORLD_ASSETS.assets.some(a=>/grove/.test(a.id+a.sourceId)));
});
test('every usage rule targets a real asset; generator assets are light, untextured, Y-up and ground-anchored',()=>{
  for(const id of Object.keys(ASSET_USAGE))assert.ok(worldAsset(id),'usage without asset '+id);
  for(const a of generatorAssets()){
    assert.ok(a.license,'licence '+a.id);
    for(const l of a.lods){assert.equal(l.textures,0,a.id);assert.ok(l.triangles>0);}
    for(let i=1;i<a.lods.length;i++)assert.ok(a.lods[i].triangles<=a.lods[i-1].triangles,'LOD order '+a.id);
    if(a.usage.instancing&&a.group!=='legacy'){assert.ok(a.lods[0].triangles<=400,'instanced asset too heavy '+a.id);assert.ok(a.lods[0].bounds.min[1]+groundOffset(a)<=.01,'grounded instance '+a.id);}
  }
  assert.equal(registryDiagnostics().filter(d=>d.severity==='ERROR').length,0);
});
test('placeable catalogue entries are compiler-safe local GLB paths and resolve to V3 asset definitions',()=>{
  const list=placeableWorldAssets();assert.ok(list.length>=50);
  for(const e of list){assert.match(e.file,/^models\/[a-zA-Z0-9_./-]+\.glb$/);assert.deepEqual(assetDefinitionFor(e.id).file,e.file);}
  assert.equal(assetDefinitionFor('nature.pine'),undefined,'legacy entries stay in the historical catalogue');
});
test('exclusion footprints: buildings and structures, never small plants',()=>{
  assert.equal(exclusionRadius('architecture.cottage'),6);
  assert.ok(exclusionRadius('architecture.stone_house')>5);
  assert.ok(exclusionRadius('structure.bridge_stone')>4);
  assert.equal(exclusionRadius('nature.fern_small'),null);
  assert.equal(exclusionRadius('props.crate'),null);
});
