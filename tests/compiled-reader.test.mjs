import test from 'node:test';
import {economyItems} from '../src/gameplay/economy.ts';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileProject} from '../src/world-compiler/compile.ts';
import {parseProject,createProject} from '../src/studio-core/schema.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {gameplayDataFromProject} from '../src/gameplay/project-adapter.ts';
import {collisionDefinitionsFromProject} from '../src/studio-core/collision-adapter.ts';
import {openCompiledWorld,playableFromCompiled,defaultSpawn,runtimeConfig,publishedManifestURL} from '../src/runtime/compiled-world.ts';
import {islandPreset} from '../src/terrain-generator.ts';

const resolveAsset=async()=>({hash:'0'.repeat(64),byteLength:100});
function memoryFetcher(files){
  return async url=>{const path=new URL(url).pathname.replace(/^\/worlds\/test\//,'');return path in files?new Response(files[path]):new Response('',{status:404});};
}
test('compiled reader reproduces the Studio source projection of the reference scenario',async()=>{
  const project=parseProject(JSON.parse(await readFile(new URL('../maps/beta.project.json',import.meta.url),'utf8')));
  const compiled=await compileProject(project,{resolveAsset});
  const bundle=await openCompiledWorld('http://localhost/worlds/test/manifest.json',memoryFetcher(compiled.files));
  const playable=playableFromCompiled(bundle,{x:-24,y:0,z:-183});
  const source=toRuntimeWorld(project);
  const byId=list=>[...list].sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(byId(playable.world.placements),byId(source.placements));
  assert.deepEqual(byId(playable.world.npcs),byId(source.npcs));
  assert.deepEqual(playable.world.terrain,source.terrain);
  assert.deepEqual(byId(playable.world.water),byId(source.water));
  const expected=gameplayDataFromProject(project,bundle.manifest.buildVersion);expected.items=economyItems(expected.items); // the reader adds the core economy items
  assert.deepEqual(byId(playable.gameplay.entities),byId(expected.entities));
  for(const key of ['interactions','dialogues','items','objectives','variables'])assert.deepEqual(byId(playable.gameplay[key]),byId(expected[key]),key);
  assert.deepEqual(byId(playable.collisions),byId(collisionDefinitionsFromProject(project)));
  assert.equal(playable.world.config.terrain.kind,'legacy-valley');
});
test('an island without authored packages opens with its generated relief and a coastal spawn',async()=>{
  const project=createProject({name:'Île',width:3000,length:8000,seed:4242,terrain:islandPreset(3000,8000)});
  const compiled=await compileProject(project,{resolveAsset});
  assert.equal(compiled.manifest.chunks.length,0,'sparse: no package for untouched sectors');
  assert.equal(compiled.manifest.terrain.kind,'island');
  const bundle=await openCompiledWorld('http://localhost/worlds/test/manifest.json',memoryFetcher(compiled.files));
  const playable=playableFromCompiled(bundle);
  assert.equal(playable.world.config.width,3000);assert.equal(playable.world.config.length,8000);
  assert.deepEqual(playable.world.config.terrain,project.world.terrain);
  assert.ok(playable.spawn.z>3000,'spawn on the southern beach');
  assert.deepEqual(defaultSpawn(runtimeConfig(compiled.manifest),[]),playable.spawn);
});
test('compiled reader rejects tampered resources, oversize payloads and unsafe paths',async()=>{
  const project=parseProject(JSON.parse(await readFile(new URL('../maps/beta.project.json',import.meta.url),'utf8')));
  const compiled=await compileProject(project,{resolveAsset}),files={...compiled.files};
  const chunk=compiled.manifest.chunks[0];files[chunk.url]=files[chunk.url].replace('"','" ');
  await assert.rejects(openCompiledWorld('http://localhost/worlds/test/manifest.json',memoryFetcher(files)),/hash|size/);
  await assert.rejects(openCompiledWorld('http://localhost/worlds/test/manifest.json',memoryFetcher(compiled.files),{maxPayloadBytes:10}),/streaming/);
  assert.throws(()=>publishedManifestURL('/little-world/','../secret/manifest.json'),/invalide/);
  assert.equal(publishedManifestURL('/little-world/','maps/island/manifest.json'),'/little-world/maps/island/manifest.json');
});
