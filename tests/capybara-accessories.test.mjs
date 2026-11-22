import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAPYBARA_LOADOUTS,buildCapybaraAccessories,disposeCapybaraAccessories } from '../src/capybara/capybara-accessories.ts';

test('capybara supports all six equipment presets',()=>{
  assert.deepEqual(CAPYBARA_LOADOUTS,['none','saddle','pack','cart','wagon','caravan']);
  for(const preset of CAPYBARA_LOADOUTS){
    const group=buildCapybaraAccessories(preset);
    assert.ok(group instanceof THREE.Group);
    assert.equal(group.name,`CapybaraEquipment_${preset}`);
    let count=0;
    group.traverse(n=>{if(n instanceof THREE.Mesh)count++;});
    assert.equal(count>0,preset!=='none');
    disposeCapybaraAccessories(group);
    assert.equal(group.children.length,0);
  }
});
test('mounting and caravan variants have distinct attachment meshes',()=>{
  const saddle=buildCapybaraAccessories('saddle');
  assert.ok(saddle.getObjectByName('SaddleSeat'));
  assert.equal(saddle.getObjectByName('CaravanBody'),undefined);
  const caravan=buildCapybaraAccessories('caravan');
  assert.ok(caravan.getObjectByName('CaravanBody'));
  assert.ok(caravan.getObjectByName('Wheel'));
  assert.equal(caravan.getObjectByName('SaddleSeat'),undefined);
  disposeCapybaraAccessories(saddle);
  disposeCapybaraAccessories(caravan);
});
