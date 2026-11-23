import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CAPYBARA_BONES, CAPYBARA_PARENTS, CAPYBARA_PIVOTS, computeCapybaraSkin } from '../src/capybara/capybara-rig.ts';
import { parseCapybaraObj, buildCapybaraModel, CAPYBARA_VERTICES, CAPYBARA_TRIANGLES } from '../src/capybara/capybara-model.ts';
import {
  CapybaraAnimator, CAPYBARA_BEHAVIORS, CAPYBARA_BEHAVIOR_NAMES, CAPYBARA_CHANNELS, CAPYBARA_SPEEDS,
} from '../src/capybara/capybara-animation.ts';
import { buildCapybaraVehicle, buildCapybaraWorn, CAPYBARA_VEHICLES, CAPYBARA_VEHICLE_SPECS } from '../src/capybara/capybara-accessories.ts';

const geometry = parseCapybaraObj(readFileSync(new URL('../public/models/capybara-v6.3.obj', import.meta.url), 'utf8'));
const run = (animator, input, seconds) => { let pose; for (let i = 0; i < seconds * 30; i++) pose = animator.update(input, 1 / 30); return pose; };

test('the approved V6.3 mesh is kept and welded to its original vertices', () => {
  assert.equal(geometry.getAttribute('position').count, CAPYBARA_VERTICES);
  assert.equal(geometry.index.count / 3, CAPYBARA_TRIANGLES);
});

test('skeleton is a single tree with stable names and required sockets', () => {
  assert.equal(new Set(CAPYBARA_BONES).size, CAPYBARA_BONES.length);
  for (const bone of CAPYBARA_BONES) {
    let cursor = bone, depth = 0;
    while (CAPYBARA_PARENTS[cursor]) { cursor = CAPYBARA_PARENTS[cursor]; assert.ok(++depth < 8); }
    assert.equal(cursor, 'Root');
    assert.equal(CAPYBARA_PIVOTS[bone].length, 3);
  }
  for (const socket of ['SocketRider', 'SocketSaddle', 'SocketPackLeft', 'SocketPackRight', 'SocketHarness', 'SocketHitch'])
    assert.ok(CAPYBARA_BONES.includes(socket));
  assert.equal(CAPYBARA_PARENTS.SocketHitch, 'Root', 'the hitch never follows a deforming limb');
});

test('skin weights are normalised, deterministic and anatomically placed', () => {
  const positions = geometry.getAttribute('position').array;
  const a = computeCapybaraSkin(positions), b = computeCapybaraSkin(positions);
  assert.deepEqual(a.skinWeight, b.skinWeight);
  const index = (name) => CAPYBARA_BONES.indexOf(name);
  const weightOf = (v, name) => { let w = 0; for (let i = 0; i < 4; i++) if (a.skinIndex[v * 4 + i] === index(name)) w += a.skinWeight[v * 4 + i]; return w; };
  let feet = 0, belly = 0;
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    let sum = 0; for (let i = 0; i < 4; i++) sum += a.skinWeight[v * 4 + i];
    assert.ok(Math.abs(sum - 1) < 1e-5);
    for (let i = 0; i < 4; i++) assert.ok(!CAPYBARA_BONES[a.skinIndex[v * 4 + i]].startsWith('Socket'));
    if (y < 0.05 && x < -0.8 && z > 0) { feet++; assert.ok(weightOf(v, 'RearFootLeft') > 0.9); }
    // The belly midline must not follow the legs (no stretched abdomen).
    if (Math.abs(z) < 0.08 && x > -0.8 && x < -0.2 && y < 0.6) {
      belly++;
      assert.ok(weightOf(v, 'Pelvis') + weightOf(v, 'Chest') > 0.99);
    }
    if (x > 1.2) assert.ok(weightOf(v, 'Head') > 0.99);
  }
  assert.ok(feet > 0 && belly > 0);
});

test('model builds one skinned mesh sharing its geometry, with sockets on bones', () => {
  const a = buildCapybaraModel(geometry, 'saddle'), b = buildCapybaraModel(geometry);
  assert.equal(a.mesh.geometry, b.mesh.geometry);
  assert.equal(a.mesh.skeleton.bones.length, CAPYBARA_BONES.length);
  let meshes = 0; a.group.traverse((n) => { if (n.isMesh) meshes++; });
  assert.equal(meshes, 2, 'body + one baked worn mesh');
  a.setLoadout('none'); meshes = 0; a.group.traverse((n) => { if (n.isMesh) meshes++; });
  assert.equal(meshes, 1);
  a.group.updateMatrixWorld(true);
  const rider = a.riderSocket.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(rider.x - CAPYBARA_PIVOTS.SocketRider[0]) < 1e-6 && Math.abs(rider.y - CAPYBARA_PIVOTS.SocketRider[1]) < 1e-6);
  // The rider socket follows the body when it lies down; the hitch stays put.
  a.play('lie_down'); for (let i = 0; i < 90; i++) a.update(1 / 30, 0);
  a.group.updateMatrixWorld(true);
  assert.ok(a.riderSocket.getWorldPosition(new THREE.Vector3()).y < rider.y - 0.25);
  assert.ok(Math.abs(a.hitchSocket.getWorldPosition(new THREE.Vector3()).y - CAPYBARA_PIVOTS.SocketHitch[1]) < 1e-6);
  a.dispose(); b.dispose();
});

test('lod 1 refreshes at a reduced rate and lod 2 freezes the pose', () => {
  const m = buildCapybaraModel(geometry);
  m.lod = 2; m.update(1 / 30, 2); assert.equal(m.bones.RearUpperLeft.rotation.z, 0);
  m.lod = 1; m.update(1 / 30, 2); m.update(1 / 30, 2); assert.equal(m.bones.RearUpperLeft.rotation.z, 0);
  m.update(1 / 30, 2); assert.notEqual(m.bones.RearUpperLeft.rotation.z, 0);
});

test('behaviour table is complete and well formed', () => {
  for (const name of CAPYBARA_BEHAVIOR_NAMES) {
    const def = CAPYBARA_BEHAVIORS[name];
    assert.ok(def.duration > 0);
    assert.ok(def.loop || def.next, `${name} must loop or chain`);
    for (const key of def.keys) { assert.ok(key.t >= 0 && key.t <= 1); for (const c of Object.keys(key)) assert.ok(c === 't' || CAPYBARA_CHANNELS.includes(c)); }
    for (const event of def.events) assert.ok(event.at >= 0 && event.at <= 1);
  }
});

test('gait phase follows distance and footfalls differ between walk and trot', () => {
  const a = new CapybaraAnimator(), b = new CapybaraAnimator();
  for (let i = 0; i < 60; i++) a.update({ speed: 1 }, 1 / 60);
  for (let i = 0; i < 30; i++) b.update({ speed: 1 }, 1 / 30);
  assert.ok(Math.abs(a.stridePhase - b.stridePhase) < 1e-9);
  const walk = new CapybaraAnimator(), trot = new CapybaraAnimator();
  run(walk, { speed: CAPYBARA_SPEEDS.walk }, 3); run(trot, { speed: CAPYBARA_SPEEDS.trot }, 3);
  assert.equal(walk.locomotion, 'walk'); assert.equal(trot.locomotion, 'trot');
  // Trot: diagonal pairs move together.
  let diagonal = 0, lateral = 0;
  for (let i = 0; i < 60; i++) { const p = trot.update({ speed: CAPYBARA_SPEEDS.trot }, 1 / 30); diagonal += Math.abs(p.rlUpper - p.frUpper); lateral += Math.abs(p.rlUpper - p.flUpper); }
  assert.ok(diagonal < lateral * 0.2);
});

test('locomotion labels cover backward, turning, start and stop', () => {
  const a = new CapybaraAnimator();
  run(a, { speed: -0.6 }, 1); assert.equal(a.locomotion, 'walk_backward');
  run(a, { speed: 0, turnRate: 1 }, 1); assert.equal(a.locomotion, 'turn_left');
  run(a, { speed: 0, turnRate: -1 }, 1); assert.equal(a.locomotion, 'turn_right');
  run(a, { speed: 0 }, 1); assert.equal(a.locomotion, 'idle');
  a.update({ speed: 0.3 }, 1 / 30); assert.equal(a.locomotion, 'start_walk');
  run(a, { speed: 1 }, 1); a.update({ speed: 0.5 }, 1 / 30); assert.equal(a.locomotion, 'stop_walk');
});

test('walk to stop transition has no pose jump', () => {
  const a = new CapybaraAnimator();
  let previous = { ...run(a, { speed: 1.1 }, 2) }, worst = 0;
  for (let i = 0; i < 60; i++) {
    const pose = a.update({ speed: 0 }, 1 / 30);
    for (const c of CAPYBARA_CHANNELS) worst = Math.max(worst, Math.abs(pose[c] - previous[c]));
    previous = { ...pose };
  }
  assert.ok(worst < 0.2, `largest per-frame channel change ${worst}`);
  assert.ok(Math.abs(previous.rlUpper) < 0.02 && Math.abs(previous.flLower) < 0.02);
});

test('rest, sleep and wake chain; movement always stands the animal up', () => {
  const a = new CapybaraAnimator();
  assert.ok(a.play('lie_down'));
  const lying = run(a, { speed: 0 }, 3);
  assert.equal(a.behavior, 'rest'); assert.ok(a.grounded); assert.ok(lying.bodyY < -0.3);
  a.play('sleep'); assert.ok(run(a, { speed: 0 }, 2).eyesClosed > 0.9);
  a.play('wake_up'); run(a, { speed: 0 }, 2.5); assert.equal(a.behavior, 'rest');
  a.play('stand_up'); const up = run(a, { speed: 0 }, 3);
  assert.equal(a.behavior, 'idle'); assert.ok(!a.grounded); assert.ok(Math.abs(up.bodyY) < 0.03);
  a.play('sleep'); run(a, { speed: 0 }, 2); run(a, { speed: 1 }, 2);
  assert.equal(a.behavior, 'idle'); assert.ok(!a.grounded);
});

test('priorities: a reaction interrupts grazing, grazing cannot interrupt a reaction', () => {
  const a = new CapybaraAnimator();
  a.play('graze'); run(a, { speed: 0 }, 1);
  assert.ok(a.play('react')); a.update({ speed: 0 }, 1 / 30);
  assert.equal(a.play('graze'), false);
  run(a, { speed: 0 }, 1.5); assert.equal(a.behavior, 'idle');
});

test('head look is independent, clamped and ignored while asleep', () => {
  const a = new CapybaraAnimator();
  const left = run(a, { speed: 1, lookYaw: 5, lookPitch: 5 }, 2);
  assert.ok(left.headYaw + left.neckYaw > 0.8 && left.headYaw + left.neckYaw <= 0.95);
  a.play('sleep'); const asleep = run(a, { speed: 0, lookYaw: 5 }, 3);
  assert.ok(Math.abs(asleep.headYaw) < 0.02);
});

test('load lowers the head and events are emitted for steps and bites', () => {
  const free = new CapybaraAnimator(), heavy = new CapybaraAnimator();
  let neckFree = 0, neckHeavy = 0, steps = 0;
  for (let i = 0; i < 90; i++) {
    neckFree += free.update({ speed: 1 }, 1 / 30).neckPitch; neckHeavy += heavy.update({ speed: 1, load: 1 }, 1 / 30).neckPitch;
    steps += free.events.filter((e) => e === 'step').length;
  }
  assert.ok(neckHeavy < neckFree - 3); assert.ok(steps >= 6);
  const eater = new CapybaraAnimator(); eater.play('eat'); let bites = 0;
  for (let i = 0; i < 80; i++) { eater.update({ speed: 0 }, 1 / 30); bites += eater.events.filter((e) => e === 'bite').length; }
  assert.ok(bites >= 2);
  assert.doesNotThrow(() => free.update({ speed: NaN, turnRate: Infinity }, Infinity));
});

test('vehicles are independent baked objects with rolling wheels', () => {
  for (const kind of CAPYBARA_VEHICLES) {
    const v = buildCapybaraVehicle(kind), again = buildCapybaraVehicle(kind);
    let meshes = 0; v.group.traverse((n) => { if (n.isMesh) meshes++; });
    assert.equal(meshes, 3, 'one body + two wheels');
    assert.equal(v.wheels.length, 2);
    assert.equal(v.wheels[0].geometry, again.wheels[1].geometry);
    const spec = CAPYBARA_VEHICLE_SPECS[kind];
    assert.ok(Math.abs(-v.wheels[0].position.x - spec.axle) < 0.01);
    assert.ok(Math.abs(v.wheels[0].position.y - spec.wheelRadius) < 1e-6);
    v.roll(spec.wheelRadius); assert.ok(Math.abs(v.wheels[0].rotation.z + 1) < 1e-9);
  }
  assert.equal(buildCapybaraWorn('none'), null);
  assert.equal(buildCapybaraWorn('cart').geometry, buildCapybaraWorn('caravan').geometry, 'harness shared by every vehicle');
});

test('generated capybara.glb carries the skeleton, sockets, skin and advertised clips', async () => {
  const catalog = JSON.parse(readFileSync(new URL('../assets/animal-catalog.json', import.meta.url), 'utf8')).animals[0];
  const bytes = readFileSync(new URL('../public/' + catalog.exchangeFile, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const names = gltf.nodes.map((n) => n.name);
  for (const bone of CAPYBARA_BONES) assert.ok(names.includes(bone), 'missing ' + bone);
  for (const socket of catalog.sockets) assert.ok(names.includes(socket));
  assert.equal(gltf.skins.length, 1); assert.equal(gltf.skins[0].joints.length, CAPYBARA_BONES.length);
  assert.deepEqual(gltf.animations.map((c) => c.name), catalog.animations);
  for (const clip of gltf.animations) assert.ok(clip.channels.length > 0, clip.name + ' animates something');
  const position = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  assert.equal(position.count, CAPYBARA_VERTICES);
  // Axes and scale: +X forward (muzzle), +Y up, metres, feet on the ground.
  assert.ok(position.max[0] > 1.9 && position.min[0] < -1.6 && Math.abs(position.min[1]) < 0.01 && position.max[1] > 1.8);
  for (const buffer of gltf.buffers) assert.equal(buffer.uri, undefined);
  assert.equal(gltf.textures, undefined);
});
