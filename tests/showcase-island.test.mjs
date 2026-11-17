import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const file=p=>new URL('../'+p,import.meta.url);
test('official 4 × 3 km island is the only production example',async()=>{
  assert.deepEqual(await readdir(file('maps/')),['island.project.json']);
  assert.deepEqual((await readdir(file('public/maps/'))).sort(),['island']);
  const source=JSON.parse(await readFile(file('maps/island.project.json'),'utf8'));
  assert.equal(source.world.bounds.maxX-source.world.bounds.minX,4000);
  assert.equal(source.world.bounds.maxZ-source.world.bounds.minZ,3000);
});
test('Studio advertises only one example and isolated fixtures remain available for tests',async()=>{
  const source=await readFile(file('src/studio/home-welcome.ts'),'utf8');
  const visible=source.match(/const templates=\[([\s\S]*?)\];/)?.[1]??'';
  assert.equal((visible.match(/file:/g)??[]).length,1);
  assert.match(visible,/island\.project\.json/);
  assert.equal((await readdir(file('tests/fixtures/legacy-maps/authoring/'))).length,6);
});
