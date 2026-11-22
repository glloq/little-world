import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAPYBARA_LOADOUTS,buildCapybaraAccessories,advanceCapybaraEquipment,disposeCapybaraAccessories } from '../src/capybara/capybara-accessories.ts';

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
  assert.ok(caravan.getObjectByName('CaravanArchedRoof'));
  assert.ok(caravan.getObjectByName('CaravanDoor'));
  assert.ok(caravan.getObjectByName('WindowFrame'));
  assert.equal(caravan.getObjectByName('CaravanShell'),undefined);
  assert.ok(caravan.getObjectByName('Wheel'));
  assert.equal(caravan.getObjectByName('SaddleSeat'),undefined);
  disposeCapybaraAccessories(saddle);
  disposeCapybaraAccessories(caravan);
});

test('wheel pivots follow the animal root and rotate with distance, not with elapsed time',()=>{
  const caravan=buildCapybaraAccessories('caravan');
  const wheels=[];
  caravan.traverse(n=>{if(n.name==='CapybaraWheelPivot')wheels.push(n);});
  assert.equal(wheels.length,2);
  assert.ok(wheels.every(n=>n.parent?.name==='CapybaraTowAssembly'));
  const origin=wheels[0].getWorldPosition(new THREE.Vector3());
  advanceCapybaraEquipment(caravan,.65);
  assert.ok(wheels[0].rotation.z<0);
  assert.ok(Math.abs(wheels[0].rotation.z-wheels[1].rotation.z)<1e-8);
  assert.ok(wheels[0].getWorldPosition(new THREE.Vector3()).distanceTo(origin)<1e-8);
  // Parent transform preserves hitch/vehicle alignment after a turn.
  caravan.position.x=2;caravan.rotation.y=.6;caravan.updateMatrixWorld(true);
  assert.ok(wheels[0].getWorldPosition(new THREE.Vector3()).distanceTo(origin)>.5);
  disposeCapybaraAccessories(caravan);
});
test('saddle and panniers use curved body straps, no full-height belly slab',()=>{
  for(const kind of ['saddle','pack']){
    const loadout=buildCapybaraAccessories(kind);
    assert.ok(loadout.getObjectByName('BodyStrap'));
    assert.equal(loadout.getObjectByName('BellyStrap'),undefined);
    disposeCapybaraAccessories(loadout);
  }
});
