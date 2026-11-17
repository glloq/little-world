import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseAudioDefinitionV2,eventAvailability} from '../src/audio/catalog.ts';
import {mergeAudioCatalogs} from '../src/audio/migrate.ts';
test('boost mini-catalog is valid, self-contained and has 25 playable original variants',async()=>{
 const pack=parseAudioDefinitionV2(JSON.parse(await readFile(new URL('../public/audio/boost-catalog.json',import.meta.url),'utf8')));
 assert.equal(Object.keys(pack.assets).length,25);
 assert.equal(Object.keys(pack.events).length,3);
 for(const id of ['player.boost.pulse','player.boost.combo','player.boost.wind']){
  assert.ok(eventAvailability(pack,id).playable,id);
 }
 assert.ok(Object.values(pack.assets).every(a=>a.kind==='procedural'&&a.procedural&&a.status==='LISTENING_REVIEW'));
 const base=parseAudioDefinitionV2(JSON.parse(await readFile(new URL('../public/audio/catalog.json',import.meta.url),'utf8')));
 const merged=mergeAudioCatalogs(base,pack);
 assert.ok(merged.events['player.boost.pulse']);
 assert.ok(merged.events['player.glide.deploy']);
 assert.equal(Object.keys(merged.assets).length,Object.keys(base.assets).length+25);
});
