// Generates public/models/capybara.glb: the V6.3 mesh with its skeleton, sockets and clips
// sampled from the runtime animator. Blender exchange only — the game skins the OBJ itself.
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CAPYBARA_BONES } from '../src/capybara/capybara-rig.ts';
import { buildCapybaraModel, parseCapybaraObj } from '../src/capybara/capybara-model.ts';
import { CAPYBARA_SPEEDS } from '../src/capybara/capybara-animation.ts';

globalThis.FileReader = class { async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); } async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); } };
const FPS = 30;
/** name, seconds, motion, [behaviours played in order before sampling], warm-up seconds */
export const CAPYBARA_CLIPS = [
  ['idle', 2, { speed: 0 }], ['walk', 1.35 / CAPYBARA_SPEEDS.walk, { speed: CAPYBARA_SPEEDS.walk }, [], 2],
  ['fast_walk', 1.35 / CAPYBARA_SPEEDS.fastWalk, { speed: CAPYBARA_SPEEDS.fastWalk }, [], 2],
  ['trot', 1.9 / CAPYBARA_SPEEDS.trot, { speed: CAPYBARA_SPEEDS.trot }, [], 2],
  ['walk_backward', 1.35 / 0.6, { speed: -0.6 }, [], 2],
  ['turn_left', 1.2, { speed: 0, turnRate: 1 }, [], 1], ['turn_right', 1.2, { speed: 0, turnRate: -1 }, [], 1],
  ['start_walk', 1, { speed: CAPYBARA_SPEEDS.walk }], ['stop_walk', 1, { speed: 0 }, [], 0, { speed: CAPYBARA_SPEEDS.walk }],
  ['look_around', 4.2, { speed: 0 }, ['look_around']], ['eat', 2.4, { speed: 0 }, ['eat'], 1], ['drink', 3, { speed: 0 }, ['drink'], 1],
  ['graze', 3.2, { speed: 0 }, ['graze'], 1], ['sniff', 1.8, { speed: 0 }, ['sniff']], ['sit', 5, { speed: 0 }, ['sit'], 2],
  ['lie_down', 2.4, { speed: 0 }, ['lie_down']], ['rest', 6, { speed: 0 }, ['rest'], 3], ['sleep', 5, { speed: 0 }, ['sleep'], 3],
  ['wake_up', 1.6, { speed: 0 }, ['sleep', 'wake_up'], 3], ['stand_up', 2, { speed: 0 }, ['rest', 'stand_up'], 3],
  ['shake', 1.1, { speed: 0 }, ['shake']], ['react', 0.9, { speed: 0 }, ['react']], ['happy', 1.6, { speed: 0 }, ['happy']],
  ['afraid', 1.2, { speed: 0 }, ['afraid'], 1], ['wait_loading', 5, { speed: 0, load: 0.4 }, ['wait_loading']],
  ['walk_rider', 1.35 / CAPYBARA_SPEEDS.walk, { speed: CAPYBARA_SPEEDS.walk, rider: true }, [], 2],
  ['walk_loaded', 1.2 / 0.9, { speed: 0.9, load: 0.35 }, [], 2],
  ['draft_light', 1.15 / 0.9, { speed: 0.9, load: 0.5 }, [], 2], ['draft_heavy', 1.05 / 0.7, { speed: 0.7, load: 1 }, [], 2],
];
const geometry = parseCapybaraObj(await readFile(new URL('../public/models/capybara-v6.3.obj', import.meta.url), 'utf8'));
const animated = CAPYBARA_BONES.filter((name) => !name.startsWith('Socket') && name !== 'Root');
const round = (v) => Math.round(v * 1e5) / 1e5;
function sample([name, seconds, motion, behaviours = [], warm = 0, warmMotion = motion]) {
  const model = buildCapybaraModel(geometry);
  // The last behaviour is the one recorded; earlier ones only set the starting posture.
  behaviours.slice(0, -1).forEach((b) => { model.animator.play(b); for (let i = 0; i < 3 * FPS; i++) model.update(1 / FPS, warmMotion); });
  if (behaviours.length) model.animator.play(behaviours.at(-1));
  for (let i = 0; i < warm * FPS; i++) model.update(1 / FPS, warmMotion);
  const frames = Math.max(2, Math.round(seconds * FPS) + 1), times = Array.from({ length: frames }, (_, f) => round(f / FPS));
  const tracks = new Map(animated.map((bone) => [bone, { q: [], y: [] }]));
  for (let f = 0; f < frames; f++) {
    if (f) model.update(1 / FPS, motion);
    for (const bone of animated) { const b = model.bones[bone]; tracks.get(bone).q.push(...b.quaternion.toArray().map(round)); tracks.get(bone).y.push(...b.position.toArray().map(round)); }
  }
  const moves = (values, size) => values.some((v, i) => Math.abs(v - values[i % size]) > 1e-5);
  const kt = [];
  for (const [bone, t] of tracks) {
    if (moves(t.q, 4)) kt.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, t.q));
    if (moves(t.y, 3)) kt.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, t.y));
  }
  model.dispose();
  return new THREE.AnimationClip(name, round((frames - 1) / FPS), kt);
}
const model = buildCapybaraModel(geometry);
const clips = CAPYBARA_CLIPS.map(sample);
// glTF needs a plain material; the face shading stays a runtime shader.
model.mesh.material = new THREE.MeshStandardMaterial({ color: 0xc58b5c, roughness: 0.98, metalness: 0, name: 'CapybaraCoat' });
model.group.userData = { generator: 'tools/generate-capybara.mjs', asset: 'animal.capybara.v6-3', forward: '+X', up: '+Y', units: 'metres', license: 'project-original' };
model.group.updateMatrixWorld(true);
const data = await new GLTFExporter().parseAsync(model.group, { binary: true, animations: clips, onlyVisible: false });
await writeFile(new URL('../public/models/capybara.glb', import.meta.url), Buffer.from(data));
console.log(`capybara.glb: ${data.byteLength} bytes, ${CAPYBARA_BONES.length} bones, ${clips.length} clips`);
