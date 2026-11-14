/** Hamster player character — model and rig (doc 43). Original procedural low-poly model, built
 * from DATA: each joint lists its parts (primitive, colour, transform); the parts of one joint are
 * merged into ONE vertex-coloured mesh, cached and shared by every hamster built (no per-instance
 * geometry except the two glide membranes). Rigid articulated joints (no weighted skinning),
 * 22 bones, named sockets for tools and accessories. Model units: metres before CHARACTER_SCALE;
 * +Z forward, +Y up; the round body (head included, as on a real hamster) is ~1.25 m tall.
 * Pure geometry/scene building: animation lives in hamster-animation.ts. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EMOTIONS, type Emotion } from '../character-style.ts';

export const HAMSTER_PALETTE = {
  fur: 0xe58a3c, furDark: 0xc96f2a, cream: 0xf7e6c8, pink: 0xf2a49b, nose: 0xe9827c, eye: 0x2a1f1d, shine: 0xffffff,
  mouth: 0x7a3b33, tongue: 0xf07f78, leather: 0x7b4a2b, leatherDark: 0x5c3520, gold: 0xe0b14a,
  straw: 0xe8c879, ribbon: 0xc0563f, lens: 0x6f9fb6, scarf: 0xd6584b, canvas: 0x7f9a5a, bedroll: 0xb9573f,
} as const;
type Shape = 'ball' | 'ball0' | 'box' | 'cyl' | 'cone' | 'ring';
/** One primitive of a joint: shape, colour, position, scale (radii / sizes), rotation (Euler). */
export interface PartSpec { s: Shape; c: number; p: [number, number, number]; k: [number, number, number]; r?: [number, number, number] }
const P = HAMSTER_PALETTE;
const unit: Record<Shape, () => THREE.BufferGeometry> = {
  ball: () => new THREE.IcosahedronGeometry(1, 1), // 80 faceted triangles
  ball0: () => new THREE.IcosahedronGeometry(1, 0), // 20 triangles
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(1, 1, 1, 6, 1),
  cone: () => new THREE.ConeGeometry(1, 1, 6, 1),
  ring: () => new THREE.TorusGeometry(1, .07, 3, 18),
};
const geometryCache = new Map<string, THREE.BufferGeometry>();
/** Merged, vertex-coloured geometry of a part list (position + colour; flat-shaded material). */
export function mergeParts(key: string, parts: PartSpec[]): THREE.BufferGeometry {
  const cached = geometryCache.get(key); if (cached) return cached;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  const geos = parts.map((part) => {
    const raw = unit[part.s](), g = raw.index ? raw.toNonIndexed() : raw;
    g.applyMatrix4(m.compose(new THREE.Vector3(...part.p), q.setFromEuler(e.set(...(part.r ?? [0, 0, 0]))), new THREE.Vector3(...part.k)));
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    col.setHex(part.c); const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false)!; for (const g of geos) g.dispose();
  merged.computeVertexNormals(); merged.computeBoundingSphere();
  geometryCache.set(key, merged); return merged;
}
/** Shared flat-shaded material of every hamster part. */
export const hamsterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0, flatShading: true });

// ---- Part lists per joint (local frame of the joint). -----------------------------------
const BODY: PartSpec[] = [
  { s: 'ball', c: P.fur, p: [0, 0, 0], k: [.6, .7, .57] },
  { s: 'ball', c: P.cream, p: [0, -.16, .22], k: [.44, .44, .36] },
];
const HEAD: PartSpec[] = [
  { s: 'ball', c: P.cream, p: [0, -.02, .32], k: [.36, .24, .22] }, // muzzle
  { s: 'ball0', c: P.cream, p: [-.27, .02, .4], k: [.2, .17, .15] }, { s: 'ball0', c: P.cream, p: [.27, .02, .4], k: [.2, .17, .15] }, // cheeks
  { s: 'ball0', c: P.pink, p: [-.32, .0, .47], k: [.06, .035, .02] }, { s: 'ball0', c: P.pink, p: [.32, .0, .47], k: [.06, .035, .02] }, // blush
  { s: 'ball0', c: P.nose, p: [0, .08, .54], k: [.05, .04, .04] }, // nose
  { s: 'box', c: P.eye, p: [-.33, .1, .5], k: [.14, .012, .012], r: [0, .3, .15] }, { s: 'box', c: P.eye, p: [-.33, .06, .51], k: [.14, .012, .012], r: [0, .3, -.08] }, // whiskers
  { s: 'box', c: P.eye, p: [.33, .1, .5], k: [.14, .012, .012], r: [0, -.3, -.15] }, { s: 'box', c: P.eye, p: [.33, .06, .51], k: [.14, .012, .012], r: [0, -.3, .08] },
];
const EAR: PartSpec[] = [{ s: 'ball0', c: P.fur, p: [0, .06, 0], k: [.14, .13, .07] }, { s: 'ball0', c: P.pink, p: [0, .06, .04], k: [.09, .08, .035] }];
const ARM: PartSpec[] = [{ s: 'ball0', c: P.fur, p: [0, -.08, 0], k: [.1, .14, .1] }, { s: 'ball0', c: P.cream, p: [0, -.2, .02], k: [.08, .07, .08] }];
const HAND: PartSpec[] = [{ s: 'ball0', c: P.pink, p: [0, -.02, .02], k: [.06, .04, .06] }];
const FOOT: PartSpec[] = [{ s: 'ball0', c: P.fur, p: [0, .06, 0], k: [.13, .1, .13] }, { s: 'ball0', c: P.pink, p: [0, .015, .07], k: [.11, .04, .14] }];
const TAIL: PartSpec[] = [{ s: 'ball0', c: P.cream, p: [0, 0, -.04], k: [.07, .07, .07] }];
const SATCHEL: PartSpec[] = [
  { s: 'box', c: P.leather, p: [0, 0, .04], k: [.3, .22, .1] }, { s: 'box', c: P.leatherDark, p: [0, .07, .095], k: [.31, .1, .02] },
  { s: 'ball0', c: P.gold, p: [0, .03, .11], k: [.03, .03, .015] },
];
/** Shoulder strap: a ring wrapped around the round body, tilted from the left shoulder to the right hip. */
const STRAP: PartSpec[] = [{ s: 'ring', c: P.leather, p: [0, -.02, .01], k: [.6, .64, .6], r: [Math.PI / 2, -.62, 0] }];
/** Face of each emotion: eyes (with highlights), mouth. Only the selected one is visible. */
function faceParts(emotion: Emotion): PartSpec[] {
  const eye = (x: number, sy = 1, y = .2): PartSpec[] => [{ s: 'ball0', c: P.eye, p: [x, y, .45], k: [.095, .115 * sy, .06] }, ...(sy > .4 ? [{ s: 'ball0' as const, c: P.shine, p: [x + .032, y + .04, .505] as [number, number, number], k: [.022, .022, .012] as [number, number, number] }] : [])];
  const closed = (x: number, tilt = 0): PartSpec => ({ s: 'box', c: P.eye, p: [x, .2, .55], k: [.11, .02, .02], r: [0, 0, tilt] });
  const mouth = (w: number, h: number, open = false): PartSpec[] => [{ s: 'ball0', c: P.mouth, p: [0, .0, .53], k: [w, h, .03] }, ...(open ? [{ s: 'ball0' as const, c: P.tongue, p: [0, -.005, .57] as [number, number, number], k: [w * .6, h * .45, .02] as [number, number, number] }] : [])];
  switch (emotion) {
    case 'happy': return [...eye(-.17), ...eye(.17), ...mouth(.06, .045, true)];
    case 'joyful': return [closed(-.17, .25), closed(.17, -.25), ...mouth(.075, .06, true)];
    case 'surprised': return [...eye(-.17, 1.25), ...eye(.17, 1.25), ...mouth(.04, .05)];
    case 'sleepy': return [closed(-.17), closed(.17), ...mouth(.03, .015)];
    case 'determined': return [...eye(-.17, .8), ...eye(.17, .8), { s: 'box', c: P.furDark, p: [-.17, .32, .52], k: [.12, .025, .02], r: [0, 0, -.35] }, { s: 'box', c: P.furDark, p: [.17, .32, .52], k: [.12, .025, .02], r: [0, 0, .35] }, ...mouth(.05, .015)];
    case 'curious': return [...eye(-.17, 1.1), ...eye(.17, .85), ...mouth(.03, .03)];
    case 'sad': return [...eye(-.17, .9, .18), ...eye(.17, .9, .18), { s: 'box', c: P.mouth, p: [0, .0, .555], k: [.08, .018, .02] }];
    case 'tired': return [...eye(-.17, .45), ...eye(.17, .45), ...mouth(.035, .02)];
    case 'confused': return [...eye(-.17, 1), ...eye(.17, .6), { s: 'box', c: P.mouth, p: [0, .01, .555], k: [.08, .018, .02], r: [0, 0, .3] }];
  }
}
// ---- Accessories (socket frames). --------------------------------------------------------
const HAT: PartSpec[] = [{ s: 'cyl', c: P.straw, p: [0, .02, 0], k: [.42, .03, .42] }, { s: 'cyl', c: P.straw, p: [0, .13, 0], k: [.22, .2, .22] }, { s: 'cyl', c: P.ribbon, p: [0, .06, 0], k: [.225, .06, .225] }];
const GOGGLES: PartSpec[] = [
  { s: 'cyl', c: P.leatherDark, p: [-.15, 0, 0], k: [.1, .06, .1], r: [Math.PI / 2, 0, 0] }, { s: 'cyl', c: P.leatherDark, p: [.15, 0, 0], k: [.1, .06, .1], r: [Math.PI / 2, 0, 0] },
  { s: 'cyl', c: P.lens, p: [-.15, 0, .035], k: [.075, .02, .075], r: [Math.PI / 2, 0, 0] }, { s: 'cyl', c: P.lens, p: [.15, 0, .035], k: [.075, .02, .075], r: [Math.PI / 2, 0, 0] },
  { s: 'box', c: P.leather, p: [0, 0, -.18], k: [.62, .05, .3] },
];
const BACKPACK: PartSpec[] = [{ s: 'box', c: P.canvas, p: [0, 0, -.1], k: [.42, .44, .2] }, { s: 'cyl', c: P.bedroll, p: [0, .3, -.12], k: [.1, .46, .1], r: [0, 0, Math.PI / 2] }, { s: 'box', c: P.leather, p: [0, -.02, .0], k: [.44, .05, .05] }];
const SCARF: PartSpec[] = [{ s: 'cyl', c: P.scarf, p: [0, 0, 0], k: [.635, .11, .6] }, { s: 'box', c: P.scarf, p: [.2, -.16, .53], k: [.12, .26, .05], r: [.25, 0, .2] }];
const PENDANT: PartSpec[] = [{ s: 'cyl', c: P.leatherDark, p: [0, 0, 0], k: [.63, .02, .59] }, { s: 'ball0', c: P.gold, p: [0, -.09, .6], k: [.06, .07, .04] }];

// ---- Held objects (tool frame = right paw: grip at the origin, handle along +Z). ---------------
export const TOOL_IDS = ['pickaxe', 'pickaxe-steel', 'axe', 'fishing-rod', 'shovel', 'hammer', 'watering-can', 'seed-bag'] as const;
export type ToolId = typeof TOOL_IDS[number];
const W = 0x9a6b42, WD = 0x6e4a2d, IRON = 0x8d9298, STEEL = 0xc4ccd4;
const handle = (len: number, c = W, r = .035): PartSpec => ({ s: 'cyl', c, p: [0, 0, len / 2 - .12], k: [r, len, r], r: [Math.PI / 2, 0, 0] });
export const TOOL_PARTS: Record<ToolId, PartSpec[]> = {
  pickaxe: [handle(.9), { s: 'box', c: IRON, p: [0, 0, .72], k: [.06, .62, .07], r: [0, 0, 0] }, { s: 'cone', c: IRON, p: [0, .36, .72], k: [.04, .12, .04] }, { s: 'cone', c: IRON, p: [0, -.36, .72], k: [.04, .12, .04], r: [Math.PI, 0, 0] }],
  'pickaxe-steel': [handle(.9, WD), { s: 'box', c: STEEL, p: [0, 0, .72], k: [.07, .66, .08] }, { s: 'cone', c: STEEL, p: [0, .38, .72], k: [.045, .14, .045] }, { s: 'cone', c: STEEL, p: [0, -.38, .72], k: [.045, .14, .045], r: [Math.PI, 0, 0] }],
  axe: [handle(.85), { s: 'box', c: IRON, p: [0, .14, .66], k: [.04, .26, .2] }, { s: 'box', c: STEEL, p: [0, .28, .66], k: [.03, .04, .24] }],
  'fishing-rod': [handle(1.7, W, .022), { s: 'cyl', c: WD, p: [0, 0, .05], k: [.04, .2, .04], r: [Math.PI / 2, 0, 0] }, { s: 'cyl', c: IRON, p: [.05, 0, .12], k: [.04, .03, .04], r: [0, 0, Math.PI / 2] }],
  shovel: [handle(.9), { s: 'box', c: IRON, p: [0, 0, .82], k: [.2, .02, .24] }],
  hammer: [handle(.6), { s: 'box', c: IRON, p: [0, 0, .45], k: [.08, .22, .08] }],
  'watering-can': [{ s: 'cyl', c: 0x5f8fa6, p: [0, -.1, .22], k: [.13, .22, .13] }, { s: 'cyl', c: 0x5f8fa6, p: [0, -.02, .4], k: [.02, .3, .02], r: [-1.1, 0, 0] }, { s: 'box', c: 0x4b7488, p: [0, .06, .14], k: [.03, .12, .03] }],
  'seed-bag': [{ s: 'ball0', c: 0xd8c08f, p: [0, -.08, .12], k: [.13, .15, .12] }, { s: 'cyl', c: WD, p: [0, .06, .12], k: [.05, .04, .05] }],
};

export const HAMSTER_JOINTS = ['HamsterBody', 'Head', 'EarLeft', 'EarRight', 'ShoulderLeft', 'ArmLeft', 'HandLeft', 'ShoulderRight', 'ArmRight', 'HandRight', 'HipLeft', 'FootLeft', 'HipRight', 'FootRight', 'Tail', 'MembraneLeft', 'MembraneRight', 'Satchel', 'SocketHead', 'SocketFace', 'SocketBack', 'SocketNeck'] as const;
export type HamsterJoint = typeof HAMSTER_JOINTS[number];
/** An optional piece of the single mesh: shown/hidden through the scale of its own bone. */
export interface PartToggle { visible: boolean }
export const ACCESSORY_IDS = ['hat', 'goggles', 'backpack', 'scarf', 'pendant'] as const;
export type AccessoryId = typeof ACCESSORY_IDS[number];
export interface HamsterRig {
  group: THREE.Group;
  /** The whole hamster — body, faces, accessories, tools, membranes — in ONE skinned mesh (1 draw call). */
  mesh: THREE.SkinnedMesh;
  /** The 22 animated joints. */
  joints: Record<HamsterJoint, THREE.Bone>;
  /** Tool anchor (right paw) and the off-hand (left paw) for two-handed grips. */
  sockets: { tool: THREE.Bone; offHand: THREE.Bone; head: THREE.Bone; face: THREE.Bone; back: THREE.Bone; neck: THREE.Bone; satchel: THREE.Bone };
  faces: Record<Emotion, PartToggle>;
  accessories: Record<AccessoryId, PartToggle>;
  /** Held objects (one bone each under the right paw). */
  tools: Record<ToolId, PartToggle>;
  toolBones: Record<ToolId, THREE.Bone>;
  /** Glide membranes: open 0 (hidden) … 1 (spread). */
  setMembranes(open: number): void;
  /** Ground blob shadow (separate: transparent decal, not part of the character mesh). */
  shadow: THREE.Mesh;
  skeleton: THREE.Skeleton;
  dispose(): void;
}
/** Height of the body centre: HamsterBody pivots there so that the ball rolls about its centre. */
export const BODY_CENTRE = .66;
/** Rest positions of the joints (parent frame). */
export const REST: Record<HamsterJoint, [number, number, number]> = {
  HamsterBody: [0, BODY_CENTRE, 0], Head: [0, .1, .02], EarLeft: [-.3, .52, -.04], EarRight: [.3, .52, -.04],
  ShoulderLeft: [-.4, -.06, .36], ArmLeft: [0, 0, 0], HandLeft: [0, -.25, .03], ShoulderRight: [.4, -.06, .36], ArmRight: [0, 0, 0], HandRight: [0, -.25, .03],
  HipLeft: [-.28, -.58, .28], FootLeft: [0, 0, 0], HipRight: [.28, -.58, .28], FootRight: [0, 0, 0], Tail: [0, -.34, -.56],
  MembraneLeft: [-.5, -BODY_CENTRE, 0], MembraneRight: [.5, -BODY_CENTRE, 0], Satchel: [.4, -.26, .34], SocketHead: [0, .6, -.02], SocketFace: [0, .21, .46], SocketBack: [0, .04, -.5], SocketNeck: [0, .12, 0],
};
const PARENT: Record<HamsterJoint, HamsterJoint | null> = {
  HamsterBody: null, Head: 'HamsterBody', EarLeft: 'Head', EarRight: 'Head', ShoulderLeft: 'HamsterBody', ArmLeft: 'ShoulderLeft', HandLeft: 'ArmLeft', ShoulderRight: 'HamsterBody', ArmRight: 'ShoulderRight', HandRight: 'ArmRight',
  HipLeft: 'HamsterBody', FootLeft: 'HipLeft', HipRight: 'HamsterBody', FootRight: 'HipRight', Tail: 'HamsterBody', MembraneLeft: 'HamsterBody', MembraneRight: 'HamsterBody', Satchel: 'HamsterBody',
  SocketHead: 'Head', SocketFace: 'Head', SocketBack: 'HamsterBody', SocketNeck: 'HamsterBody',
};
const JOINT_PARTS: Partial<Record<HamsterJoint, PartSpec[]>> = { HamsterBody: [...BODY, ...STRAP], Head: HEAD, EarLeft: EAR, EarRight: EAR, ArmLeft: ARM, ArmRight: ARM, HandLeft: HAND, HandRight: HAND, FootLeft: FOOT, FootRight: FOOT, Tail: TAIL, Satchel: SATCHEL };
/** Technical bones of the optional pieces (never animated: scale 1 = shown, 0 = hidden). */
interface Piece { bone: string; parent: string; parts?: PartSpec[]; membrane?: -1 | 1; at?: [number, number, number]; rx?: number; shown: boolean }
const ACCESSORY_PIECES: Record<AccessoryId, { bone: string; socket: HamsterJoint; parts: PartSpec[]; at?: [number, number, number]; rx?: number }> = {
  hat: { bone: 'Acc_StrawHat', socket: 'SocketHead', parts: HAT }, goggles: { bone: 'Acc_Goggles', socket: 'SocketFace', parts: GOGGLES, at: [0, .2, -.07], rx: -.5 },
  backpack: { bone: 'Acc_Backpack', socket: 'SocketBack', parts: BACKPACK }, scarf: { bone: 'Acc_Scarf', socket: 'SocketNeck', parts: SCARF }, pendant: { bone: 'Acc_Pendant', socket: 'SocketNeck', parts: PENDANT },
};
function pieces(): Piece[] {
  const list: Piece[] = [];
  for (const name of HAMSTER_JOINTS) { const parts = JOINT_PARTS[name]; if (parts) list.push({ bone: name, parent: '', parts, shown: true }); }
  for (const emotion of EMOTIONS) list.push({ bone: 'Face_' + emotion, parent: 'Head', parts: faceParts(emotion), shown: emotion === 'happy' });
  for (const id of ACCESSORY_IDS) { const a = ACCESSORY_PIECES[id]; list.push({ bone: a.bone, parent: a.socket, parts: a.parts, at: a.at, rx: a.rx, shown: false }); }
  for (const id of TOOL_IDS) list.push({ bone: 'Tool_' + id, parent: 'HandRight', parts: TOOL_PARTS[id], shown: false });
  list.push({ bone: 'MembraneLeft', parent: '', membrane: -1, shown: false }, { bone: 'MembraneRight', parent: '', membrane: 1, shown: false });
  return list;
}
/** Glide membrane, fully spread, in its bone frame (pivot on the body side): shoulder, wrist, ankle,
 * hip; both windings so that one front-side material serves the whole mesh. Scale x = opening. */
function membraneGeometry(sx: number) {
  const v = [[0, .72, .2], [sx * .55, .76, .32], [sx * .3, .2, .02], [0, .32, -.02]], tri = [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2];
  const pos = new Float32Array(tri.length * 3), col = new Float32Array(tri.length * 3), c = new THREE.Color(0xf2b59a);
  tri.forEach((k, i) => { pos.set(v[k], i * 3); col.set([c.r, c.g, c.b], i * 3); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
/** Shared skinned geometry: every vertex bound with weight 1 to the bone of its piece (rigid). */
let shared: { geometry: THREE.BufferGeometry; boneNames: string[]; triangles: number[] } | null = null;
function skinnedGeometry(boneNames: string[], restWorld: Map<string, THREE.Matrix4>) {
  if (shared) return shared;
  const list = pieces(), geos: THREE.BufferGeometry[] = [], triangles: number[] = [];
  for (const piece of list) {
    const source = piece.membrane ? membraneGeometry(piece.membrane) : mergeParts('hamster:' + piece.bone, piece.parts!);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', source.getAttribute('position').clone()); g.setAttribute('color', source.getAttribute('color').clone());
    g.applyMatrix4(restWorld.get(piece.bone)!);
    const n = g.getAttribute('position').count, bone = boneNames.indexOf(piece.bone), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geos.push(g); triangles.push(n / 3); if (piece.membrane) source.dispose();
  }
  const geometry = mergeGeometries(geos, false)!; for (const g of geos) g.dispose();
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return shared = { geometry, boneNames, triangles };
}
const toggle = (bone: THREE.Bone): PartToggle => ({ get visible() { return bone.scale.x > 0; }, set visible(v: boolean) { bone.scale.setScalar(v ? 1 : 0); } });

export function buildHamsterRig(): HamsterRig {
  const bones = new Map<string, THREE.Bone>();
  const bone = (name: string) => { const b = new THREE.Bone(); b.name = name; bones.set(name, b); return b; };
  for (const name of HAMSTER_JOINTS) bone(name).position.set(...REST[name]);
  for (const name of HAMSTER_JOINTS) { const parent = PARENT[name]; if (parent) bones.get(parent)!.add(bones.get(name)!); }
  const list = pieces();
  for (const piece of list) if (piece.parent) { const b = bone(piece.bone); if (piece.at) b.position.set(...piece.at); if (piece.rx) b.rotation.x = piece.rx; bones.get(piece.parent)!.add(b); }
  const joints = Object.fromEntries(HAMSTER_JOINTS.map((n) => [n, bones.get(n)!])) as Record<HamsterJoint, THREE.Bone>;
  joints.Satchel.rotation.set(0, .55, 0);
  // Rest pose (every piece shown) → bind matrices, then hide the optional pieces.
  const root = joints.HamsterBody; root.updateMatrixWorld(true);
  const boneNames = [...bones.keys()], restWorld = new Map(boneNames.map((n) => [n, bones.get(n)!.matrixWorld.clone()]));
  const { geometry, triangles } = skinnedGeometry(boneNames, restWorld);
  const mesh = new THREE.SkinnedMesh(geometry, hamsterMaterial); mesh.name = 'HamsterMesh'; mesh.add(root);
  const skeleton = new THREE.Skeleton(boneNames.map((n) => bones.get(n)!));
  mesh.bind(skeleton, new THREE.Matrix4());
  // Generous fixed bounds (posed limbs, held rod): no per-frame recomputation.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .8, 0), 2.4);
  for (const piece of list) if (!piece.shown) bones.get(piece.bone)!.scale.setScalar(0);
  const faces = Object.fromEntries(EMOTIONS.map((e) => [e, toggle(bones.get('Face_' + e)!)])) as Record<Emotion, PartToggle>;
  const accessories = Object.fromEntries(ACCESSORY_IDS.map((id) => [id, toggle(bones.get(ACCESSORY_PIECES[id].bone)!)])) as Record<AccessoryId, PartToggle>;
  const toolBones = Object.fromEntries(TOOL_IDS.map((id) => [id, bones.get('Tool_' + id)!])) as Record<ToolId, THREE.Bone>;
  const tools = Object.fromEntries(TOOL_IDS.map((id) => [id, toggle(toolBones[id])])) as Record<ToolId, PartToggle>;
  function setMembranes(open: number) {
    const u = Math.max(0, Math.min(1, open));
    for (const b of [joints.MembraneLeft, joints.MembraneRight]) if (u > .02) b.scale.set(u, 1, 1); else b.scale.setScalar(0);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.62, 14), new THREE.MeshBasicMaterial({ color: 0x20453a, transparent: true, opacity: .18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .03; shadow.name = 'Shadow';
  const group = new THREE.Group(); group.name = 'Hamster'; group.add(shadow, mesh);
  group.userData.pieceTriangles = list.map((piece, i) => ({ bone: piece.bone, triangles: triangles[i] }));
  group.updateMatrixWorld(true);
  return {
    group, mesh, joints, faces, accessories, tools, toolBones, setMembranes, shadow, skeleton,
    sockets: { tool: joints.HandRight, offHand: joints.HandLeft, head: joints.SocketHead, face: joints.SocketFace, back: joints.SocketBack, neck: joints.SocketNeck, satchel: joints.Satchel },
    // The skinned geometry and the material are shared by every hamster: never disposed here.
    dispose() { shadow.geometry.dispose(); (shadow.material as THREE.Material).dispose(); skeleton.dispose(); group.removeFromParent(); },
  };
}
/** Triangles of the pieces currently shown (a piece is hidden when its bone or an ancestor has scale 0). */
export function visibleTriangles(rig: HamsterRig): number {
  const shown = (b: THREE.Object3D | null): boolean => { for (let o = b; o && o !== rig.mesh; o = o.parent) if (o.scale.x * o.scale.y * o.scale.z === 0) return false; return true; };
  let n = 0; for (const { bone, triangles } of rig.group.userData.pieceTriangles as { bone: string; triangles: number }[]) if (shown(rig.mesh.getObjectByName(bone) ?? null)) n += triangles; return n;
}
