// Node.js 22: node --experimental-strip-types tools/generate-hamster.mjs
/** Exports the original procedural hamster (doc 43) as public/models/hamster.glb: named joint
 * hierarchy (22 bones), per-joint merged low-poly meshes, sockets, accessories and tools, and
 * animation clips SAMPLED from the game's own state machine (same code as the runtime, so the
 * GLB is a faithful reference for Blender/Studio). The game uses the procedural build directly.
 * No Blender, network or texture download required. */
import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildHamster } from '../src/hamster/hamster.ts';
import { HAMSTER_JOINTS } from '../src/hamster/hamster-model.ts';

globalThis.FileReader = class { async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); } async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); } };
const FPS = 30, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** [clip, seconds, motion mode, velocity, optional action (activity, tool), warm-up mode] */
const CLIPS = [
  ['IDLE', 2, 'ground', V()], ['WALK', 1, 'ground', V(0, 0, 3.5)], ['RUN', .8, 'ground', V(0, 0, 8)],
  ['ROLL_LOOP', 1, 'roll', V(0, 0, 9), null, 'roll'], ['GLIDE_LOOP', 1.5, 'glide', V(0, -2, 9), null, 'glide'], ['SWIM', 1.2, 'swim', V(0, 0, 2.5), null, 'swim'],
  ['FALL', .6, 'air', V(0, -5, 3), null, 'air'], ['CLIMB', 1, 'climb', V(0, 1.5, .5), null, 'climb'],
  ['TOOL_SWING_VERTICAL', .45, 'ground', V(), ['mine', 'pickaxe']], ['TOOL_SWING_HORIZONTAL', .45, 'ground', V(), ['fell', 'axe']],
  ['TOOL_DIG', .5, 'ground', V(), ['farm-clear', 'shovel']], ['PICKUP', .4, 'ground', V(), ['pick', null]], ['FISH_CAST', .6, 'ground', V(), ['fish-cast', 'fishing-rod']], ['FISH_REEL', .7, 'ground', V(), ['fish-reel', 'fishing-rod']], ['INTERACT', .45, 'ground', V(), ['talk', null]],
];
const reference = buildHamster(), clips = [];
for (const [name, seconds, mode, velocity, act, warm] of CLIPS) {
  const h = buildHamster(), player = { position: V(), velocity, mode: 'ground', oxygen: 90, glideReady: false, climbDir: { x: 0, z: 1 } };
  if (warm) { player.mode = warm; for (let i = 0; i < 20; i++) h.update(player, 1 / FPS, i / FPS); }
  player.mode = mode; if (act) h.play(act[0], act[1]);
  const times = [], tracks = new Map();
  for (let f = 0; f <= Math.round(seconds * FPS); f++) {
    h.update(player, f ? 1 / FPS : 0, f / FPS); times.push(f / FPS);
    for (const joint of HAMSTER_JOINTS) { const b = h.rig.joints[joint]; let t = tracks.get(joint); if (!t) tracks.set(joint, t = { p: [], q: [], s: [] }); t.p.push(...b.position.toArray()); t.q.push(...b.quaternion.toArray()); t.s.push(...b.scale.toArray()); }
  }
  const kt = [];
  // Keep only the channels that move during the clip (constant tracks would only weigh).
  const moves = (a, n) => a.some((v, i) => Math.abs(v - a[i % n]) > 1e-5);
  for (const [joint, t] of tracks) {
    if (moves(t.p, 3)) kt.push(new THREE.VectorKeyframeTrack(joint + '.position', times, t.p));
    if (moves(t.q, 4)) kt.push(new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, t.q));
    if (moves(t.s, 3)) kt.push(new THREE.VectorKeyframeTrack(joint + '.scale', times, t.s));
  }
  clips.push(new THREE.AnimationClip(name, seconds, kt)); h.dispose();
}
const model = reference.rig.group;
model.userData = { provenance: 'Little World original procedural hamster (doc 43)', rig: 'Rigid articulated joints (22 bones), no weighted skinning', runtime: 'Exported reference asset; the game builds the same model procedurally', tools: 'Tool_* nodes on HandRight (scale 0 = hidden)', appearance: 'Face_<emotion> and accessories: scale 1 = shown, 0 = hidden' };
// Tools are built on demand at runtime: build them all for the reference export.
for (const tool of ['pickaxe', 'pickaxe-steel', 'axe', 'fishing-rod', 'shovel', 'hammer', 'watering-can', 'seed-bag']) { reference.play('INTERACT', tool); reference.update({ position: V(), velocity: V(), mode: 'ground', oxygen: 90, glideReady: false }, 0.05, 0); }
model.traverse((node) => { if (!node.visible) { node.scale.set(0, 0, 0); node.visible = true; } });
model.updateMatrixWorld(true);
const data = await new GLTFExporter().parseAsync(model, { binary: true, animations: clips, onlyVisible: false });
const output = new URL('../public/models/hamster.glb', import.meta.url);
await mkdir(new URL('../public/models/', import.meta.url), { recursive: true });
await writeFile(output, Buffer.from(data));
console.log(`Generated ${output.pathname} (${data.byteLength} bytes; ${clips.length} clips, ${HAMSTER_JOINTS.length} joints)`);
