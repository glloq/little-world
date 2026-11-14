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
const membraneMaterial = new THREE.MeshStandardMaterial({ color: 0xf2b59a, emissive: 0x5a3020, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide });

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

export const HAMSTER_JOINTS = ['HamsterBody', 'Head', 'EarLeft', 'EarRight', 'ShoulderLeft', 'ArmLeft', 'HandLeft', 'ShoulderRight', 'ArmRight', 'HandRight', 'HipLeft', 'FootLeft', 'HipRight', 'FootRight', 'Tail', 'MembraneLeft', 'MembraneRight', 'Satchel', 'SocketHead', 'SocketFace', 'SocketBack', 'SocketNeck'] as const;
export type HamsterJoint = typeof HAMSTER_JOINTS[number];
export interface HamsterRig {
  group: THREE.Group;
  joints: Record<HamsterJoint, THREE.Bone>;
  /** Tool anchor (right paw) and the off-hand (left paw) for two-handed grips. */
  sockets: { tool: THREE.Bone; offHand: THREE.Bone; head: THREE.Bone; face: THREE.Bone; back: THREE.Bone; neck: THREE.Bone; satchel: THREE.Bone };
  faces: Record<Emotion, THREE.Mesh>;
  accessories: { hat: THREE.Mesh; goggles: THREE.Mesh; backpack: THREE.Mesh; scarf: THREE.Mesh; pendant: THREE.Mesh };
  /** Glide membranes (dynamic 4-vertex quads, body frame): open 0 (hidden) … 1. */
  setMembranes(open: number): void;
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
  MembraneLeft: [0, -BODY_CENTRE, 0], MembraneRight: [0, -BODY_CENTRE, 0], Satchel: [.4, -.26, .34], SocketHead: [0, .6, -.02], SocketFace: [0, .21, .46], SocketBack: [0, .04, -.5], SocketNeck: [0, .12, 0],
};
const PARENT: Record<HamsterJoint, HamsterJoint | null> = {
  HamsterBody: null, Head: 'HamsterBody', EarLeft: 'Head', EarRight: 'Head', ShoulderLeft: 'HamsterBody', ArmLeft: 'ShoulderLeft', HandLeft: 'ArmLeft', ShoulderRight: 'HamsterBody', ArmRight: 'ShoulderRight', HandRight: 'ArmRight',
  HipLeft: 'HamsterBody', FootLeft: 'HipLeft', HipRight: 'HamsterBody', FootRight: 'HipRight', Tail: 'HamsterBody', MembraneLeft: 'HamsterBody', MembraneRight: 'HamsterBody', Satchel: 'HamsterBody',
  SocketHead: 'Head', SocketFace: 'Head', SocketBack: 'HamsterBody', SocketNeck: 'HamsterBody',
};
const JOINT_PARTS: Partial<Record<HamsterJoint, PartSpec[]>> = { HamsterBody: [...BODY, ...STRAP], Head: HEAD, EarLeft: EAR, EarRight: EAR, ArmLeft: ARM, ArmRight: ARM, HandLeft: HAND, HandRight: HAND, FootLeft: FOOT, FootRight: FOOT, Tail: TAIL, Satchel: SATCHEL };

export function buildHamsterRig(): HamsterRig {
  const joints = {} as Record<HamsterJoint, THREE.Bone>;
  for (const name of HAMSTER_JOINTS) { const b = new THREE.Bone(); b.name = name; b.position.set(...REST[name]); joints[name] = b; }
  for (const name of HAMSTER_JOINTS) { const parent = PARENT[name]; if (parent) joints[parent].add(joints[name]); }
  for (const [name, parts] of Object.entries(JOINT_PARTS) as [HamsterJoint, PartSpec[]][]) {
    const mesh = new THREE.Mesh(mergeParts('hamster:' + name, parts), hamsterMaterial); mesh.name = name + 'Mesh'; joints[name].add(mesh);
  }
  joints.Satchel.rotation.set(0, .55, 0);
  const faces = {} as Record<Emotion, THREE.Mesh>;
  for (const emotion of EMOTIONS) { const m = new THREE.Mesh(mergeParts('hamster:face:' + emotion, faceParts(emotion)), hamsterMaterial); m.name = 'Face_' + emotion; m.visible = emotion === 'happy'; joints.Head.add(m); faces[emotion] = m; }
  const accessory = (name: string, parts: PartSpec[], socket: THREE.Bone) => { const m = new THREE.Mesh(mergeParts('hamster:acc:' + name, parts), hamsterMaterial); m.name = name; m.visible = false; socket.add(m); return m; };
  const accessories = {
    hat: accessory('StrawHat', HAT, joints.SocketHead), goggles: accessory('Goggles', GOGGLES, joints.SocketFace),
    backpack: accessory('Backpack', BACKPACK, joints.SocketBack), scarf: accessory('Scarf', SCARF, joints.SocketNeck), pendant: accessory('Pendant', PENDANT, joints.SocketNeck),
  };
  accessories.goggles.position.set(0, .2, -.07);accessories.goggles.rotation.x = -.5;
  // Glide membranes: quads shoulder → wrist → ankle → hip in the body frame (per-instance).
  const membranes = (['Left', 'Right'] as const).map((side) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, membraneMaterial); m.name = 'Membrane' + side; m.visible = false; m.frustumCulled = false; joints['Membrane' + side as HamsterJoint].add(m); return { m, sx: side === 'Left' ? -1 : 1 };
  });
  function setMembranes(open: number) {
    const u = Math.max(0, Math.min(1, open));
    for (const { m, sx } of membranes) {
      m.visible = u > .02; if (!m.visible) continue;
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      // shoulder, wrist (spreads with u), ankle (spreads), hip
      pos.setXYZ(0, sx * .5, .72, .2); pos.setXYZ(1, sx * (.5 + .55 * u), .7 + .06 * u, .32);
      pos.setXYZ(2, sx * (.38 + .42 * u), .2, .02); pos.setXYZ(3, sx * .5, .32, -.02);
      pos.needsUpdate = true; m.geometry.computeVertexNormals();
    }
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.62, 14), new THREE.MeshBasicMaterial({ color: 0x20453a, transparent: true, opacity: .18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .03; shadow.name = 'Shadow';
  const group = new THREE.Group(); group.name = 'Hamster'; group.add(shadow, joints.HamsterBody);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(HAMSTER_JOINTS.map((n) => joints[n]));
  return {
    group, joints, faces, accessories, setMembranes, shadow, skeleton,
    sockets: { tool: joints.HandRight, offHand: joints.HandLeft, head: joints.SocketHead, face: joints.SocketFace, back: joints.SocketBack, neck: joints.SocketNeck, satchel: joints.Satchel },
    dispose() { for (const { m } of membranes) m.geometry.dispose(); shadow.geometry.dispose(); (shadow.material as THREE.Material).dispose(); skeleton.dispose(); group.removeFromParent(); },
  };
}
/** Triangle count of the visible base model (default appearance, membranes folded). */
export function visibleTriangles(root: THREE.Object3D): number {
  let n = 0; root.traverseVisible((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const g = m.geometry; n += (g.index ? g.index.count : g.getAttribute('position').count) / 3; }); return n;
}
