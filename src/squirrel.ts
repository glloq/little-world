import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Player } from './player.ts';
import {
  DEFAULT_APPEARANCE,
  EMOTIONS,
  type Appearance,
  type Emotion,
} from './character-style.ts';
import {
  CharacterAnimator,
  type CharacterAnimation,
} from './character-animation.ts';

/**
 * Original, concept-inspired chibi flying squirrel.
 * Original rigid joint rig: meshes follow named bones without weighted skinning.
 * Local +Z is the front (the face). Glider meshes are invisible at rest.
 */
export interface SquirrelModel {
  group: THREE.Group;
  update(player: Player, dt: number, elapsed: number): void;
  setAppearance(appearance: Appearance): void;
  dispose(): void;
  readonly animationState: CharacterAnimation;
  readonly skeleton: THREE.Skeleton;
  readonly sockets: Readonly<Record<'head' | 'back' | 'neck', THREE.Bone>>;
}
const palette = {
  cocoa: 0x9d654f,
  cocoaDark: 0x77493e,
  cocoaLight: 0xb77d64,
  cream: 0xffddb8,
  muzzle: 0xffe7ca,
  ear: 0xf4ad99,
  cheeks: 0xf5a394,
  mouth: 0x6e352f,
  tongue: 0xf68b83,
  eye: 0x321e1c,
  shine: 0xffffff,
  scarf: 0xbf6f62,
  gold: 0xe2a54f,
  leaf: 0x78a66b,
};
const materials = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number): THREE.MeshStandardMaterial {
  let result = materials.get(color);
  if (!result) {
    result = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    materials.set(color, result);
  }
  return result;
}
// Low-poly budget (G4): 8×6 spheres (flat-shaded) instead of 12×8; parts are merged per joint below.
const round = new THREE.SphereGeometry(1, 8, 6);
const faceted = new THREE.IcosahedronGeometry(1, 1);
function oval(
  parent: THREE.Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  rotZ = 0,
  geometry: THREE.BufferGeometry = round,
): THREE.Mesh {
  const shape = new THREE.Mesh(geometry, material(color));
  shape.position.set(x, y, z);
  shape.scale.set(rx, ry, rz);
  shape.rotation.z = rotZ;
  parent.add(shape);
  return shape;
}
function shape(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function curve(
  parent: THREE.Object3D,
  color: number,
  points: [number, number, number][],
  radius = 0.025,
) {
  const path = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
  );
  return shape(
    parent,
    new THREE.TubeGeometry(path, 12, radius, 4, false),
    color,
  );
}
function buildWings(parent: THREE.Object3D): THREE.Mesh {
  // Two flexible-looking angular membranes between raised arms and hips.
  const points = new Float32Array([
    -0.39, 1.18, 0.12, -1.33, 1.36, 0.28, -1.18, 0.88, -0.22, -0.47, 0.46,
    -0.29, 0.39, 1.18, 0.12, 1.33, 1.36, 0.28, 1.18, 0.88, -0.22, 0.47, 0.46,
    -0.29,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  geo.computeVertexNormals();
  const wing = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0xf3c7a0,
      side: THREE.DoubleSide,
      roughness: 1,
      flatShading: true,
    }),
  );
  wing.visible = false;
  wing.name = 'DeployableGlider';
  parent.add(wing);
  return wing;
}
function createFace(head: THREE.Object3D): Record<Emotion, THREE.Group> {
  // Cream mask and rounded cheeks provide the reference's large light-colored face.
  oval(head, palette.cream, 0, 0.34, 0.57, 0.6, 0.43, 0.2);
  oval(head, palette.muzzle, -0.22, 0.13, 0.7, 0.28, 0.2, 0.18);
  oval(head, palette.muzzle, 0.22, 0.13, 0.7, 0.28, 0.2, 0.18);
  oval(head, palette.cocoaDark, 0, 0.24, 0.887, 0.082, 0.065, 0.045);
  oval(head, palette.cheeks, -0.48, 0.12, 0.8, 0.17, 0.078, 0.065);
  oval(head, palette.cheeks, 0.48, 0.12, 0.8, 0.17, 0.078, 0.065);

  const expressions = {} as Record<Emotion, THREE.Group>;
  for (const emotion of EMOTIONS) {
    const group = new THREE.Group();
    group.name = 'FaceEmotion_' + emotion;
    head.add(group);
    expressions[emotion] = group;
  }
  function openEyes(g: THREE.Group, scaleY = 1) {
    for (const side of [-1, 1]) {
      oval(
        g,
        palette.eye,
        side * 0.278,
        0.425,
        0.824,
        0.156,
        0.218 * scaleY,
        0.091,
      );
      oval(
        g,
        palette.shine,
        side * 0.278 - 0.043,
        0.508,
        0.905,
        0.051,
        0.069,
        0.025,
      );
      oval(
        g,
        palette.shine,
        side * 0.278 + 0.06,
        0.395,
        0.907,
        0.019,
        0.025,
        0.012,
      );
    }
  }
  openEyes(expressions.happy);
  openEyes(expressions.surprised, 1.13);
  openEyes(expressions.curious, 1.04);
  openEyes(expressions.sad, 0.85);
  openEyes(expressions.confused, 0.95);
  for (const side of [-1, 1]) {
    oval(
      expressions.curious,
      palette.cocoaDark,
      side * 0.28,
      0.7,
      0.81,
      0.18,
      0.033,
      0.04,
      -side * 0.12,
    );
    oval(
      expressions.sad,
      palette.cocoaDark,
      side * 0.28,
      0.67,
      0.82,
      0.18,
      0.035,
      0.04,
      side * 0.24,
    );
    oval(
      expressions.confused,
      palette.cocoaDark,
      side * 0.28,
      side < 0 ? 0.72 : 0.61,
      0.82,
      0.18,
      0.035,
      0.04,
      side * 0.25,
    );
    oval(
      expressions.tired,
      palette.eye,
      side * 0.279,
      0.39,
      0.827,
      0.16,
      0.047,
      0.085,
    );
    oval(
      expressions.tired,
      palette.cocoaDark,
      side * 0.28,
      0.62,
      0.82,
      0.18,
      0.03,
      0.04,
      -side * 0.1,
    );
  }
  curve(
    expressions.curious,
    palette.mouth,
    [
      [-0.1, -0.03, 0.87],
      [0, -0.07, 0.89],
      [0.11, -0.01, 0.87],
    ],
    0.022,
  );
  curve(
    expressions.sad,
    palette.mouth,
    [
      [-0.11, -0.1, 0.86],
      [0, -0.035, 0.89],
      [0.11, -0.1, 0.86],
    ],
    0.022,
  );
  oval(expressions.tired, palette.mouth, 0, -0.065, 0.875, 0.065, 0.08, 0.045);
  curve(
    expressions.confused,
    palette.mouth,
    [
      [-0.11, -0.075, 0.86],
      [0, -0.045, 0.89],
      [0.11, -0.09, 0.86],
    ],
    0.022,
  );
  for (const side of [-1, 1]) {
    curve(
      expressions.joyful,
      palette.eye,
      [
        [side * 0.14, 0.42, 0.843],
        [side * 0.28, 0.51, 0.857],
        [side * 0.41, 0.42, 0.829],
      ],
      0.03,
    );
    oval(
      expressions.sleepy,
      palette.eye,
      side * 0.279,
      0.39,
      0.827,
      0.16,
      0.055,
      0.085,
    );
    oval(
      expressions.determined,
      palette.eye,
      side * 0.279,
      0.4,
      0.827,
      0.147,
      0.13,
      0.088,
    );
    oval(
      expressions.determined,
      palette.cocoaDark,
      side * 0.28,
      0.59,
      0.833,
      0.185,
      0.043,
      0.057,
      side * 0.24,
    );
  }
  // Emotion-dependent mouths, designed as small groups for cheap switches.
  const mouthHappy = expressions.happy;
  oval(mouthHappy, palette.mouth, 0, -0.026, 0.858, 0.161, 0.171, 0.066);
  oval(mouthHappy, palette.tongue, 0, -0.104, 0.923, 0.103, 0.067, 0.018);

  oval(expressions.joyful, palette.mouth, 0, -0.031, 0.852, 0.2, 0.194, 0.075);
  oval(
    expressions.joyful,
    palette.tongue,
    0,
    -0.137,
    0.916,
    0.122,
    0.073,
    0.027,
  );

  oval(
    expressions.surprised,
    palette.mouth,
    0,
    -0.052,
    0.884,
    0.091,
    0.132,
    0.067,
  );
  curve(
    expressions.sleepy,
    palette.mouth,
    [
      [-0.105, -0.045, 0.848],
      [0, -0.095, 0.881],
      [0.105, -0.045, 0.848],
    ],
    0.025,
  );
  curve(
    expressions.determined,
    palette.mouth,
    [
      [-0.103, -0.055, 0.857],
      [0, -0.092, 0.889],
      [0.125, -0.024, 0.844],
    ],
    0.027,
  );
  return expressions;
}
function createAccessories(body: THREE.Object3D, head: THREE.Object3D) {
  const sockets = {
    head: new THREE.Bone(),
    back: new THREE.Bone(),
    neck: new THREE.Bone(),
  };
  sockets.head.name = 'SocketHead';
  sockets.back.name = 'SocketBack';
  sockets.neck.name = 'SocketNeck';
  head.add(sockets.head);
  body.add(sockets.back, sockets.neck);
  const hat = new THREE.Group();
  hat.name = 'ExplorerHat';
  sockets.head.add(hat);
  const brim = shape(
    hat,
    new THREE.CylinderGeometry(0.57, 0.57, 0.085, 12),
    palette.gold,
    0,
    1.065,
    0.03,
  );
  brim.scale.z = 0.9;
  shape(
    hat,
    new THREE.CylinderGeometry(0.37, 0.46, 0.31, 12),
    palette.gold,
    0,
    1.25,
    0.02,
  );
  shape(
    hat,
    new THREE.CylinderGeometry(0.405, 0.405, 0.075, 12),
    palette.cocoaDark,
    0,
    1.11,
    0.02,
  );
  oval(hat, palette.leaf, 0.31, 1.46, 0.13, 0.15, 0.073, 0.038, -0.4);
  oval(hat, palette.cream, 0.18, 1.53, 0.1, 0.055, 0.09, 0.03, -0.4);

  const backpack = new THREE.Group();
  backpack.name = 'ExplorerBackpack';
  sockets.back.add(backpack);
  oval(backpack, palette.cocoaDark, 0, 0.94, -0.5, 0.5, 0.55, 0.24);
  oval(backpack, palette.cocoaLight, 0, 1.0, -0.734, 0.45, 0.44, 0.2);
  oval(backpack, palette.gold, 0, 1.01, -0.931, 0.095, 0.13, 0.04);
  for (const s of [-1, 1]) {
    const strap = oval(
      backpack,
      palette.cocoaDark,
      s * 0.49,
      1.17,
      -0.21,
      0.105,
      0.48,
      0.12,
      s * 0.18,
    );
    strap.rotation.y = s * 0.19;
  }

  const pendant = new THREE.Group();
  pendant.name = 'AcornPendant';
  sockets.neck.add(pendant);
  curve(
    pendant,
    palette.cocoaDark,
    [
      [-0.3, 1.52, 0.4],
      [0, 1.11, 0.56],
      [0.3, 1.52, 0.4],
    ],
    0.027,
  );
  oval(pendant, palette.gold, 0, 1.14, 0.614, 0.155, 0.19, 0.068);
  oval(pendant, palette.cocoaDark, 0, 1.27, 0.654, 0.17, 0.082, 0.074);

  const scarf = new THREE.Group();
  scarf.name = 'CozyScarf';
  sockets.neck.add(scarf);
  const collar = shape(
    scarf,
    new THREE.TorusGeometry(0.385, 0.115, 6, 14),
    palette.scarf,
    0,
    1.46,
    0.12,
  );
  collar.rotation.x = Math.PI / 2;
  const tail1 = shape(
    scarf,
    new THREE.BoxGeometry(0.17, 0.53, 0.15),
    palette.scarf,
    0.13,
    1.17,
    0.51,
  );
  tail1.rotation.z = -0.14;
  return { hat, backpack, pendant, scarf, sockets };
}

/** One flat-shaded vertex-coloured material shared by every merged squirrel part. */
const bakedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
/** Merges, under each joint or toggle group, the unnamed leaf meshes using the palette
 * materials into ONE mesh: geometry baked in the joint's frame, the palette colour baked as a
 * vertex colour. The rig, the named parts (glider) and the visibility groups (emotions,
 * accessories) are untouched, so animation and appearance behave as before with one draw call
 * per joint. Flat shading derives normals per face in the shader. */
/** Merged geometries are identical for every squirrel built: shared by path (never disposed per rig). */
const mergedCache = new Map<string, THREE.BufferGeometry>();
const pathOf = (node: THREE.Object3D, root: THREE.Object3D) => { const parts: string[] = []; for (let n: THREE.Object3D | null = node; n && n !== root.parent; n = n.parent) parts.push(n.name || String(n.parent?.children.indexOf(n) ?? 0)); return parts.reverse().join('/'); };
export function mergeRigidParts(root: THREE.Object3D): void {
  const palette = new Set<THREE.Material>(materials.values());
  const nodes: THREE.Object3D[] = [];
  root.traverse((node) => { if (!(node instanceof THREE.Mesh)) nodes.push(node); });
  for (const node of nodes) {
    const parts = node.children.filter((child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && !child.name && !child.children.length && child.visible && palette.has(child.material as THREE.Material));
    if (!parts.length) continue;
    const key = pathOf(node, root) + '#' + parts.length, cached = mergedCache.get(key);
    if (cached) { for (const part of parts) node.remove(part); node.add(new THREE.Mesh(cached, bakedMaterial)); continue; }
    const geos = parts.map((part) => {
      part.updateMatrix();
      const g = (part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()).applyMatrix4(part.matrix);
      for (const key of Object.keys(g.attributes)) if (key !== 'position') g.deleteAttribute(key);
      const c = (part.material as THREE.MeshStandardMaterial).color, n = g.attributes.position.count, colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeVertexNormals();
    mergedCache.set(key, merged);
    for (const part of parts) node.remove(part);
    const mesh = new THREE.Mesh(merged, bakedMaterial);
    mesh.name = '';
    node.add(mesh);
  }
}
export function buildSquirrel(): SquirrelModel {
  const body = new THREE.Bone();
  body.name = 'SquirrelBody';
  oval(body, palette.cocoa, 0, 0.91, 0, 0.64, 0.79, 0.52, 0, faceted);
  oval(body, palette.cream, 0, 0.84, 0.405, 0.46, 0.64, 0.22, 0, faceted);

  // Rounded paws and short legs keep the stance recognizable at game distance.
  const feet: THREE.Bone[] = [];
  for (const side of [-1, 1]) {
    const foot = new THREE.Bone();
    foot.name = side < 0 ? 'LegLeft' : 'LegRight';
    foot.position.set(side * 0.34, 0.25, 0.15);
    body.add(foot);
    oval(foot, palette.cocoa, 0, -0.05, 0.04, 0.23, 0.29, 0.24, 0, faceted);
    oval(foot, palette.cocoaLight, 0, -0.2, 0.17, 0.21, 0.085, 0.25);
    feet.push(foot);
  }
  // Arm pivots allow a deployable membrane without a cloth simulation.
  const arms: THREE.Bone[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Bone();
    pivot.name = side < 0 ? 'ArmLeft' : 'ArmRight';
    pivot.position.set(side * 0.55, 1.33, 0.16);
    body.add(pivot);
    oval(
      pivot,
      palette.cocoa,
      side * 0.09,
      -0.24,
      0.08,
      0.19,
      0.35,
      0.19,
      side * 0.18,
      faceted,
    );
    oval(pivot, palette.cocoaLight, side * 0.11, -0.49, 0.16, 0.16, 0.16, 0.15);
    arms.push(pivot);
  }

  const tail = new THREE.Bone();
  tail.name = 'TailJoint';
  tail.position.set(0.33, 1.13, -0.4);
  body.add(tail);
  oval(
    tail,
    palette.cocoaDark,
    0.04,
    0.11,
    -0.28,
    0.33,
    0.3,
    0.45,
    -0.18,
    faceted,
  );
  oval(tail, palette.cocoa, 0.29, 0.5, -0.59, 0.47, 0.54, 0.45, -0.17, faceted);
  const tailTip = new THREE.Bone();
  tailTip.name = 'TailTipJoint';
  tailTip.position.set(0.29, 0.5, -0.59);
  tail.add(tailTip);
  oval(
    tailTip,
    palette.cocoa,
    0.16,
    0.57,
    -0.08,
    0.59,
    0.62,
    0.52,
    0.09,
    faceted,
  );
  oval(
    tailTip,
    palette.cocoaLight,
    0.2,
    1.03,
    0.08,
    0.56,
    0.48,
    0.43,
    0.2,
    faceted,
  );
  oval(
    tailTip,
    palette.cream,
    0.18,
    0.5,
    -0.515,
    0.27,
    0.63,
    0.09,
    -0.14,
    faceted,
  );

  const head = new THREE.Bone();
  head.name = 'HeadJoint';
  head.position.set(0, 1.5, 0.22);
  body.add(head);
  oval(head, palette.cocoa, 0, 0.36, 0.1, 0.71, 0.65, 0.59, 0, faceted);
  // Both ear layers share a joint so they cannot drift apart.
  const ears: THREE.Bone[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Bone();
    ear.name = side < 0 ? 'EarLeft' : 'EarRight';
    ear.position.set(side * 0.55, 0.92, 0.03);
    head.add(ear);
    ears.push(ear);
    const outer = oval(
      ear,
      palette.cocoa,
      0,
      0,
      0,
      0.3,
      0.39,
      0.19,
      -side * 0.2,
      faceted,
    );
    outer.rotation.y = -side * 0.1;
    oval(
      ear,
      palette.ear,
      side * 0.01,
      -0.01,
      0.165,
      0.19,
      0.28,
      0.071,
      -side * 0.18,
      faceted,
    );
  }
  const expressions = createFace(head);
  const accessories = createAccessories(body, head);
  const membrane = new THREE.Bone();
  membrane.name = 'MembraneJoint';
  body.add(membrane);
  const wings = buildWings(membrane);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.76, 16),
    new THREE.MeshBasicMaterial({
      color: 0x20453a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.027;

  const container = new THREE.Group();
  container.name = 'FlyingSquirrel';
  container.add(shadow, body);
  mergeRigidParts(body);
  // Character height ≈2 m, with model geometry left low-poly and independent of physics.
  body.scale.setScalar(0.78);
  container.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  body.traverse((node) => {
    if (node instanceof THREE.Bone) bones.push(node);
  });
  const skeleton = new THREE.Skeleton(bones);
  const animator = new CharacterAnimator();
  const animationInput = {
    mode: 'ground' as Player['mode'],
    speed: 0,
    verticalSpeed: 0,
  };
  let disposed = false;
  let facing = 0;
  let current = { ...DEFAULT_APPEARANCE };
  function setAppearance(value: Appearance): void {
    current = { ...value };
    accessories.hat.visible = value.hat;
    accessories.backpack.visible = value.backpack;
    accessories.pendant.visible = value.neckwear === 'pendant';
    accessories.scarf.visible = value.neckwear === 'scarf';
    for (const [kind, group] of Object.entries(expressions)) {
      group.visible = kind === value.emotion;
    }
  }
  setAppearance(current);
  return {
    group: container,
    setAppearance,
    skeleton,
    sockets: accessories.sockets,
    get animationState() {
      return animator.state;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>(),
        ownedMaterials = new Set<THREE.Material>();
      const sharedMaterials = new Set<THREE.Material>([...materials.values(), bakedMaterial]);
      const sharedMerged = new Set(mergedCache.values());
      container.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (node.geometry !== round && node.geometry !== faceted && !sharedMerged.has(node.geometry))
          geometries.add(node.geometry);
        for (const mat of Array.isArray(node.material)
          ? node.material
          : [node.material]) {
          if (!sharedMaterials.has(mat as THREE.MeshStandardMaterial))
            ownedMaterials.add(mat);
        }
      });
      for (const geo of geometries) geo.dispose();
      for (const mat of ownedMaterials) mat.dispose();
      skeleton.dispose();
      container.removeFromParent();
    },
    update(player, dt, _time) {
      if (disposed) return;
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const climbing = player.mode === 'climb' && player.climbDir;
      if (speed > 0.4 || climbing) {
        // Climbing: always face the wall (uphill), whatever the lateral motion.
        const desired = climbing ? Math.atan2(player.climbDir!.x, player.climbDir!.z) : Math.atan2(player.velocity.x, player.velocity.z);
        const delta = Math.atan2(
          Math.sin(desired - facing),
          Math.cos(desired - facing),
        );
        facing += delta * Math.min(1, dt * 8);
      }
      body.rotation.y = facing;
      animationInput.mode = player.mode;
      animationInput.speed = speed;
      animationInput.verticalSpeed = player.velocity.y;
      const pose = animator.update(animationInput, dt);
      body.position.y = pose.bodyY;
      body.rotation.z = pose.bodyZ;
      body.rotation.x = pose.bodyX;
      head.rotation.set(
        pose.headX + (current.emotion === 'sleepy' ? -0.04 : 0),
        pose.headY,
        pose.headZ,
      );
      tail.rotation.x = pose.tailX;
      tail.rotation.z = pose.tailZ;
      tailTip.rotation.x = pose.tailTipX;
      ears[0].rotation.z = pose.earL;
      ears[1].rotation.z = -pose.earR;
      arms[0].rotation.set(pose.armLX, 0, pose.armLZ);
      arms[1].rotation.set(pose.armRX, 0, pose.armRZ);
      feet[0].rotation.x = pose.legLX;
      feet[1].rotation.x = pose.legRX;
      wings.visible = player.mode === 'glide';
      membrane.scale.x = Math.max(0.02, pose.membrane);
      shadow.visible = player.mode === 'ground';
    },
  };
}
