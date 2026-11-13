import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

test('modular dock GLB files match their SHA-256 manifest', () => {
  const manifest = JSON.parse(readFileSync(resolve('assets/structures/dock/manifest.json'), 'utf8'));
  assert.equal(manifest.tileSizeMeters, 2);
  assert.equal(manifest.deckTopY, 1);
  const names = ['tile', 'post', 'bollard', 'ramp', 'ladder'];
  assert.deepEqual(Object.keys(manifest.assets).sort(), names.slice().sort());
  let count = 0;
  for (const name of names) {
    const meta = manifest.assets[name];
    assert.equal(meta.textures, 0);
    for (let lod=0; lod<3; lod++) {
      const entry = meta.lods['lod'+lod];
      const buffer = readFileSync(resolve('public', entry.file));
      assert.equal(buffer.toString('ascii',0,4), 'glTF', entry.file);
      assert.equal(buffer.length, entry.sizeBytes, entry.file);
      assert.equal(createHash('sha256').update(buffer).digest('hex'), entry.sha256, entry.file);
      assert.ok(entry.triangles>0);
      count++;
    }
  }
  assert.equal(count, 15);
});

test('shared support-post grid produces no duplicate coordinates', () => {
  function corners(cells) {
    const set = new Set();
    for (const [gx,gz] of cells) {
      for (const dx of [-1,1]) for (const dz of [-1,1]) {
        set.add((2*gx+dx)+','+(2*gz+dz));
      }
    }
    return set.size;
  }
  assert.equal(corners([[0,0]]),4);
  assert.equal(corners([[0,0],[1,0]]),6);
  assert.equal(corners([[0,0],[1,0],[0,1],[1,1]]),9);
});
