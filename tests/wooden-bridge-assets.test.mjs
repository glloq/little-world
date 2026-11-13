import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const expected = new Map([
  ['structure.bridge.wooden_arch_v1', [
    [652, '5e9398c559de96d80b01bed1f9ce76c8e81fdb27ef38f2447e00b6457a58a950'],
    [412, '7a24e5ca4b704e490164ccd0a46f82313f3dfc9a0c334c1f87698b4435b4968a'],
    [208, '1a5d88df339eaa5d72b7ffb9eb8479313362e611a8fd344e768eb7999449fac6'],
  ]],
  ['structure.bridge.log_v1', [
    [296, 'f76a8aeb48d44d1cfe72dc701be2fb9df98cedd92f9c32d59dd7f595947c9d84'],
    [240, 'acb237a4ed1af9bcdd9ce479ccb0f48356c375e0db0cffa5fa3244afbd552694'],
    [132, '73a9f08023b61383f568ec74540a11e7f88631ae1a12f63c33af1469a2580f5a'],
  ]],
]);

test('approved low-poly wooden bridges preserve all six GLBs, LODs and geometry hashes', () => {
  const manifest = JSON.parse(readFileSync(resolve('assets/structures/bridges/manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'ART_APPROVED_RUNTIME_NOT_QUALIFIED');
  assert.equal(manifest.license, 'project-original');
  assert.equal(manifest.units, 'm');
  assert.equal(manifest.up, 'Y');
  assert.equal(manifest.textures, 0);
  assert.equal(manifest.models.length, 2);
  const ids = manifest.models.map(model => model.id).sort();
  assert.deepEqual(ids, [...expected.keys()].sort());
  for (const model of manifest.models) {
    assert.equal(model.lods.length, 3);
    for (let i = 0; i < 3; i++) {
      const lod = model.lods[i];
      assert.ok(/^models\/structures\/bridges\/(wooden_arch_bridge|log_bridge)\/lod[012]\.glb$/.test(lod.file), lod.file);
      const data = readFileSync(resolve('public', lod.file));
      assert.equal(data.toString('ascii', 0, 4), 'glTF', lod.file);
      assert.equal(data.readUInt32LE(4), 2, lod.file);
      assert.equal(data.readUInt32LE(8), data.length, lod.file);
      assert.equal(data.length, lod.bytes, lod.file);
      const digest = createHash('sha256').update(data).digest('hex');
      assert.equal(digest, lod.sha256, lod.file);
      assert.deepEqual([lod.triangles, digest], expected.get(model.id)[i], lod.file);
    }
  }
});
