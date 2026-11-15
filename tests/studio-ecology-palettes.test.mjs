import test from 'node:test';
import assert from 'node:assert/strict';
import {ECOLOGY_PALETTES,ecologyPalette} from '../src/studio/ecology-palettes.ts';
test('ecosystem profiles use already supported V3 biome brush modes',()=>{
  const valid=new Set(['forest','meadow','mountain','coast','village']);
  assert.ok(ECOLOGY_PALETTES.length>=5);
  for(const profile of ECOLOGY_PALETTES){
    assert.ok(valid.has(profile.mode),profile.id);
    assert.ok(profile.radius>=1&&profile.radius<=80);
    assert.ok(profile.strength>=.1&&profile.strength<=10);
    assert.equal(ecologyPalette(profile.id),profile);
  }
  assert.throws(()=>ecologyPalette('inconnu'));
});
