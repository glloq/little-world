import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const file=p=>new URL('../'+p,import.meta.url);
test('official 4 × 3 km island remains in the primary map folder',async()=>{
  assert.deepEqual(await readdir(file('maps/')),['island.project.json']);
  assert.deepEqual((await readdir(file('public/maps/'))).sort(),['island']);
  const source=JSON.parse(await readFile(file('maps/island.project.json'),'utf8'));
  assert.equal(source.world.bounds.maxX-source.world.bounds.minX,4000);
  assert.equal(source.world.bounds.maxZ-source.world.bounds.minZ,3000);
});
test('Studio advertises three published islands and keeps technical fixtures isolated',async()=>{
  const source=await readFile(file('src/studio/home-welcome.ts'),'utf8');
  const visible=source.match(/const templates=\[([\s\S]*?)\];/)?.[1]??'';
  assert.equal((visible.match(/file:/g)??[]).length,3);
  assert.match(visible,/surf-island\/project\.json/);
  assert.match(visible,/forest-valley\/project\.json/);
  assert.match(visible,/island\.project\.json/);
  assert.equal((await readdir(file('tests/fixtures/legacy-maps/authoring/'))).length,6);
});

test('every browser test opening a legacy shortcut explicitly requests fixture mode',async()=>{
  const tools=(await readdir(file('tools/'))).filter(n=>/^test-.*-browser\.mjs$/.test(n));
  for(const name of tools){
    const source=await readFile(file('tools/'+name),'utf8');
    if(/getByRole\('button',\{name:'(?:Ouvrir le scénario de référence|Scène de référence|Démonstration B1)/.test(source)){
      assert.match(source,/testFixtures=1/,'Missing isolated fixture mode: '+name);
    }
  }
});

test('compact 200 × 600 m authoring remains available as an editable blank terrain',async()=>{
  const source=await readFile(file('src/studio/home-welcome.ts'),'utf8');
  assert.match(source,/\['200','Terrain compact · 200 × 600 m'\]/);
  assert.match(source,/length:size\.value==='200'\?600:1000/);
  assert.doesNotMatch(source,/Vallée historique/);
});
