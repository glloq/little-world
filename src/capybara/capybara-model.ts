/** Original Little World capybara V6.3 — articulated runtime model.
 * The approved OBJ mesh (802 vertices / 1600 triangles) is skinned procedurally
 * (`capybara-rig.ts`) and posed by `CapybaraAnimator`. One SkinnedMesh, one shared
 * geometry, two shared materials (eyes open / closed): one draw call per animal.
 * No island spawn, gameplay, RAF or physics here. +X forward, +Y up, ground Y≈0.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CAPYBARA_BONES, CAPYBARA_PARENTS, CAPYBARA_PIVOTS, capybaraRestOffset, computeCapybaraSkin, type CapybaraBone,
} from './capybara-rig.ts';
import { CapybaraAnimator, type CapybaraAnimationInput, type CapybaraBehavior, type CapybaraRigPose } from './capybara-animation.ts';
import { buildCapybaraWorn, type CapybaraLoadout } from './capybara-accessories.ts';

export type { CapybaraLoadout } from './capybara-accessories.ts';
export type { CapybaraBehavior } from './capybara-animation.ts';
export const CAPYBARA_ASSET_ID = 'animal.capybara.v6-3';
export const CAPYBARA_TRIANGLES = 1600;
export const CAPYBARA_VERTICES = 802;
export const CAPYBARA_BOUNDS = { length: 3.57, width: 1.26, height: 1.82 } as const;
/** Logical volume proposal in model units; the simulation uses `animals/species.ts`. */
export const CAPYBARA_COLLIDER = { shape: 'capsule' as const, radius: 0.51, length: 2.4, centreY: 0.98 };
export const CAPYBARA_SOCKETS = { rider: CAPYBARA_PIVOTS.SocketRider, hitch: CAPYBARA_PIVOTS.SocketHitch } as const;
/** 0 = full rig every frame, 1 = pose refreshed at a reduced rate, 2 = frozen pose. */
export type CapybaraLod = 0 | 1 | 2;

/** Welds the de-indexed OBJ back to its 802 vertices and adds the procedural skin. */
export function prepareCapybaraGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const bare = new THREE.BufferGeometry();
  bare.setAttribute('position', source.getAttribute('position').clone());
  const geometry = mergeVertices(bare, 1e-6);
  bare.dispose();
  const positions = geometry.getAttribute('position');
  const triangles = geometry.index!.count / 3;
  if (triangles !== CAPYBARA_TRIANGLES || positions.count !== CAPYBARA_VERTICES) {
    geometry.dispose();
    throw new Error(`Capybara mesh mismatch: ${positions.count} vertices / ${triangles} triangles`);
  }
  const skin = computeCapybaraSkin(positions.array);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.skinWeight, 4));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.1, 0.9, 0), 2.3);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-2.1, -0.3, -1.2), new THREE.Vector3(2.3, 2.2, 1.2));
  return geometry;
}
export function parseCapybaraObj(text: string): THREE.BufferGeometry {
  const root = new OBJLoader().parse(text);
  const parts: THREE.Mesh[] = [];
  root.traverse((child) => { if (child instanceof THREE.Mesh) parts.push(child); });
  if (parts.length !== 1) throw new Error(`Expected one capybara mesh; got ${parts.length}`);
  const geometry = prepareCapybaraGeometry(parts[0].geometry);
  parts[0].geometry.dispose();
  (Array.isArray(parts[0].material) ? parts[0].material : [parts[0].material]).forEach((m) => m.dispose());
  return geometry;
}
let cachedGeometry: Promise<THREE.BufferGeometry> | undefined;
function loadGeometry(): Promise<THREE.BufferGeometry> {
  cachedGeometry ??= fetch(`${import.meta.env.BASE_URL}models/capybara-v6.3.obj`)
    .then((response) => { if (!response.ok) throw new Error(`Capybara OBJ ${response.status}`); return response.text(); })
    .then(parseCapybaraObj)
    .catch((error: unknown) => { cachedGeometry = undefined; throw error; });
  return cachedGeometry;
}

function faceMaterial(eyesClosed: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xc58b5c, roughness: 0.98, metalness: 0, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.capEyesClosed = { value: eyesClosed };
    shader.vertexShader = `varying vec3 vCapPosition;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCapPosition=position;');
    shader.fragmentShader = `varying vec3 vCapPosition;\nuniform float capEyesClosed;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
      // The face is shaded on the rest position of the original mesh: no extra draw call.
      float muzzle=smoothstep(1.51,1.78,vCapPosition.x)*(1.0-smoothstep(1.30,1.44,vCapPosition.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.32,.18,.12),muzzle*.75);
      float sx=(vCapPosition.x-1.09)/.14;
      float sy=(vCapPosition.y-1.37)/.065;
      float arcY=sy-.65*(1.0-sx*sx);
      float eyeOpen=1.0-smoothstep(.38,.80,sx*sx+sy*sy);
      float eyeSleep=(1.0-smoothstep(.11,.33,abs(arcY)))*(1.0-smoothstep(.78,1.03,abs(sx)));
      float eye=mix(eyeOpen,eyeSleep,capEyesClosed)*smoothstep(.34,.40,abs(vCapPosition.z));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.07,.038,.026),eye*.95);`);
  };
  material.customProgramCacheKey = () => 'little-world-capybara-v6.3-rig-v1';
  return material;
}
let materials: { open: THREE.MeshStandardMaterial; closed: THREE.MeshStandardMaterial } | undefined;
const sharedMaterials = () => (materials ??= { open: faceMaterial(0), closed: faceMaterial(1) });

/** Writes a pose on the bones. Yaw channels are positive to the LEFT (+Z). */
export function applyCapybaraPose(bones: Record<CapybaraBone, THREE.Bone>, p: CapybaraRigPose): void {
  bones.Pelvis.position.y = CAPYBARA_PIVOTS.Pelvis[1] + p.bodyY;
  bones.Pelvis.rotation.set(p.bodyRoll, -p.pelvisYaw, p.bodyPitch);
  bones.Chest.rotation.set(0, -p.chestYaw, p.chestPitch);
  bones.Neck.rotation.set(0, -p.neckYaw, p.neckPitch);
  bones.Head.rotation.set(p.headRoll, -p.headYaw, p.headPitch);
  bones.EarLeft.rotation.z = p.earL; bones.EarRight.rotation.z = p.earR;
  bones.RearUpperLeft.rotation.z = p.rlUpper; bones.RearLowerLeft.rotation.z = p.rlLower; bones.RearFootLeft.rotation.z = p.rlFoot;
  bones.RearUpperRight.rotation.z = p.rrUpper; bones.RearLowerRight.rotation.z = p.rrLower; bones.RearFootRight.rotation.z = p.rrFoot;
  bones.FrontUpperLeft.rotation.z = p.flUpper; bones.FrontLowerLeft.rotation.z = p.flLower; bones.FrontFootLeft.rotation.z = p.flFoot;
  bones.FrontUpperRight.rotation.z = p.frUpper; bones.FrontLowerRight.rotation.z = p.frLower; bones.FrontFootRight.rotation.z = p.frFoot;
}

export interface CapybaraModel {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Record<CapybaraBone, THREE.Bone>;
  riderSocket: THREE.Bone;
  hitchSocket: THREE.Bone;
  animator: CapybaraAnimator;
  loadout: CapybaraLoadout;
  lod: CapybaraLod;
  /** Worn equipment only; a towed vehicle is a separate object owned by the caller. */
  setLoadout(loadout: CapybaraLoadout): void;
  /** The vector belongs to the caller; it may be updated in place each frame. */
  setLookTarget(worldPosition: THREE.Vector3 | null): void;
  play(behavior: CapybaraBehavior): boolean;
  /** Call from the existing frame loop: no RAF. `motion` comes from the simulation. */
  update(dt: number, motion: number | CapybaraAnimationInput): void;
  dispose(): void;
}
/** Synchronous build from a prepared geometry (browser, Node tests and GLB generator). */
export function buildCapybaraModel(geometry: THREE.BufferGeometry, initialLoadout: CapybaraLoadout = 'none'): CapybaraModel {
  const group = new THREE.Group(); group.name = 'CapybaraV63';
  const bones = {} as Record<CapybaraBone, THREE.Bone>;
  for (const name of CAPYBARA_BONES) { const bone = new THREE.Bone(); bone.name = name; bone.position.set(...capybaraRestOffset(name)); bones[name] = bone; }
  for (const name of CAPYBARA_BONES) { const parent = CAPYBARA_PARENTS[name]; if (parent) bones[parent].add(bones[name]); }
  const mesh = new THREE.SkinnedMesh(geometry, sharedMaterials().open); mesh.name = 'CapybaraBody';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.add(bones.Root); group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(CAPYBARA_BONES.map((name) => bones[name])), new THREE.Matrix4());
  // Fixed bounds: no per-frame skinned bounding volume computation.
  mesh.boundingSphere = geometry.boundingSphere!.clone(); mesh.boundingBox = geometry.boundingBox!.clone();
  const animator = new CapybaraAnimator();
  let worn: THREE.Mesh | null = null, lookTarget: THREE.Vector3 | null = null, disposed = false, pending = 0, tick = 0;
  const temp = new THREE.Vector3(), input: CapybaraAnimationInput = { speed: 0 };
  const wear = (kind: CapybaraLoadout): void => {
    worn?.removeFromParent();
    worn = buildCapybaraWorn(kind);
    // Worn pieces follow the pelvis bone, expressed back in model space.
    if (worn) { worn.position.set(-CAPYBARA_PIVOTS.Pelvis[0], -CAPYBARA_PIVOTS.Pelvis[1], 0); bones.Pelvis.add(worn); }
  };
  wear(initialLoadout);
  const model: CapybaraModel = {
    group, mesh, bones, riderSocket: bones.SocketRider, hitchSocket: bones.SocketHitch, animator, loadout: initialLoadout, lod: 0,
    setLoadout(value) { if (disposed || model.loadout === value) return; wear(value); model.loadout = value; },
    setLookTarget(value) { lookTarget = value; },
    play: (behavior) => !disposed && animator.play(behavior),
    update(dt, motion) {
      if (disposed || model.lod === 2) return;
      // Distant animals refresh their pose every third frame with the accumulated time.
      pending += Math.max(0, Number.isFinite(dt) ? dt : 0);
      if (model.lod === 1 && ++tick % 3) return;
      const source = typeof motion === 'number' ? { speed: motion } : motion;
      Object.assign(input, { turnRate: 0, load: 0, rider: false, groundPitch: 0, lookYaw: undefined, lookPitch: undefined }, source);
      if (lookTarget && model.lod === 0 && source.lookYaw === undefined) {
        group.updateWorldMatrix(true, false);
        temp.copy(lookTarget); group.worldToLocal(temp);
        const dx = temp.x - CAPYBARA_PIVOTS.Head[0], dy = temp.y - CAPYBARA_PIVOTS.Head[1];
        input.lookYaw = Math.atan2(temp.z, dx);
        input.lookPitch = Math.atan2(dy, Math.hypot(dx, temp.z));
      }
      const pose = animator.update(input, pending);
      pending = 0;
      applyCapybaraPose(bones, pose);
      mesh.material = pose.eyesClosed > 0.5 ? sharedMaterials().closed : sharedMaterials().open;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worn?.removeFromParent();
      mesh.skeleton.dispose();
      group.clear();
    },
  };
  return model;
}
/** Geometry and materials are shared by every instance; state and skeleton are per animal. */
export async function createCapybaraModel(initialLoadout: CapybaraLoadout = 'none'): Promise<CapybaraModel> {
  return buildCapybaraModel(await loadGeometry(), initialLoadout);
}
