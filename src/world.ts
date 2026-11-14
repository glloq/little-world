import {waterRibbonData} from './water/geometry.ts';
import * as THREE from 'three';
import { createTerrainView } from './terrain-view';
import { createHorizonView, type HorizonStats } from './horizon-view';
import { configureGeography } from './geography/engine';
import { createEcology } from './ecology';
import { geoWorkerPool } from './geography/geo-workers.ts';
import { createPathView, type PathViewStats } from './paths/path-view.ts';
import { createLightView, type LightView } from './lighting/light-view.ts';
import type { RuntimeLight } from './lighting/light-data.ts';
import { worldAsset, lodDistances, exclusionRadius } from './world-production/registry.ts';
import { linearizeVertexColors } from './world-production/species-library.ts';
import { createPlacedInstances, type PlacedInstances } from './world-production/placed-instances.ts';
import { createDressingView, type DressingView, type DressingStats } from './dressing-view.ts';
import { sampleBiome, generatedCover } from './biomes';
import type {
  WorldDefinition,
  WorldConfig,
  Placement,
  AssetId,
  PathDefinition,
} from './world-data';
export type { WorldConfig, Placement, AssetId } from './world-data';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  configureTerrain,
  compiledWaterBodies,
  getTerrainConfig,
  isLegacyTerrain,
  mulberry32,
  riverLevel,
  riverX,
  terrainHeight,
  waterSurface,
  pathDistance,
} from './terrain';

/** Dynamic point lights present in shaders: normal quality / economy setting. Starting values
 * (E10), to be confirmed on integrated GPUs; the pool never grows with the number of sources. */
export const LIGHT_POOL = 4, LIGHT_POOL_ECONOMY = 2;
export interface WorldView {
  /** World Production: instanced enclosure/dock modules (game runtime). */
  placed: PlacedInstances;
  setDressingFilter(fn: ((cx: number, cz: number, kind: import('./geography/dressing.ts').DressingKind, index: number) => boolean) | null): void;
  redrawDressing(): void;
  root: THREE.Group;
  terrain: THREE.Group;
  wheel: THREE.Group;
  millPosition: THREE.Vector3;
  boat: THREE.Group;
  objects: THREE.Group;
  update: (dt: number, focus?: { x: number; z: number }, camera?: THREE.PerspectiveCamera, pixelHeight?: number) => void;
  terrainWork: import('./terrain-view').TerrainWorkStats;
  /** Natural dressing of generated worlds (null for the historical valley). */
  dressing: DressingStats | null;
  /** Path surfaces (sectors built, triangles, pending). */
  paths: PathViewStats;
  /** `economy` (lowest quality setting) shifts the natural dressing one tier down. */
  setDetail: (level: number, economy?: boolean) => void;
  refreshTerrain: (x: number, z: number, radius: number) => void;
  refreshWater:()=>string[];
  refreshPaths:(paths: PathDefinition[])=>string[];
  /** E10 — local lights: fixed pool of real point lights + halos (budgeted selection). */
  lights: LightView;
  refreshLights:(lights: RuntimeLight[])=>void;
  horizon: HorizonStats;
  stats: {
    active: number;
    resident: number;
    pending: number;
    triangles: number;
    built: number;
    disposed: number;
  };
  dispose: () => void;
}
// Prefabs reuse GPU geometry/material resources across placed instances and editor rebuilds.
const geometryCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<number, THREE.MeshLambertMaterial>();
const sharedGeometry = new WeakSet<THREE.BufferGeometry>();
const sharedMaterials = new WeakSet<THREE.Material>();
function geometry(
  key: string,
  build: () => THREE.BufferGeometry,
): THREE.BufferGeometry {
  let cached = geometryCache.get(key);
  if (!cached) {
    cached = build();
    geometryCache.set(key, cached);
    sharedGeometry.add(cached);
  }
  return cached;
}
function mat(
  color: number,
  opts?: THREE.MeshLambertMaterialParameters,
): THREE.MeshLambertMaterial {
  if (opts) return new THREE.MeshLambertMaterial({ color, ...opts });
  let cached = materialCache.get(color);
  if (!cached) {
    cached = new THREE.MeshLambertMaterial({ color });
    materialCache.set(color, cached);
    sharedMaterials.add(cached);
  }
  return cached;
}
const foliage = [0x6f9d69, 0x8bb879, 0x668e63, 0xa6bd80, 0x659a75];
const stone = mat(0x9ca69a);
const wood = mat(0x946d4e);
const paleWood = mat(0xd9bc8f);
const darkWood = mat(0x6b5644);
const cream = mat(0xf3ddb2);
const roof = mat(0xb46e57);
const roofLight = mat(0xc88866);
const windowMat = mat(0x7c9fa4);
const deepGreen = mat(0x587c5a);

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function box(
  parent: THREE.Object3D,
  color: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  return mesh(
    geometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
    color,
    parent,
    x,
    y,
    z,
  );
}
function cylinder(
  parent: THREE.Object3D,
  color: THREE.Material,
  r1: number,
  r2: number,
  h: number,
  x: number,
  y: number,
  z: number,
  edges = 7,
): THREE.Mesh {
  return mesh(
    geometry(
      `cyl:${r1}:${r2}:${h}:${edges}`,
      () => new THREE.CylinderGeometry(r1, r2, h, edges),
    ),
    color,
    parent,
    x,
    y,
    z,
  );
}
function roofHouse(
  parent: THREE.Object3D,
  w: number,
  d: number,
  h: number,
): void {
  const side = Math.hypot(w / 2 + 1, 3.0);
  const left = box(parent, roof, side, 0.38, d + 1.6, -w / 4, h + 1.55, 0);
  left.rotation.z = 0.52;
  const right = box(parent, roofLight, side, 0.38, d + 1.6, w / 4, h + 1.55, 0);
  right.rotation.z = -0.52;
}

function cottage(parent: THREE.Object3D, scale = 1): THREE.Group {
  const g = new THREE.Group();
  parent.add(g);
  box(g, cream, 9, 6.5, 8, 0, 3.25, 0);
  box(g, paleWood, 9.4, 0.4, 8.4, 0, 0.35, 0);
  roofHouse(g, 9, 8, 6.5);
  box(g, darkWood, 1.8, 3.6, 0.15, 0, 1.8, 4.1);
  box(g, windowMat, 1.7, 1.9, 0.15, -2.8, 3.7, 4.09);
  box(g, windowMat, 1.7, 1.9, 0.15, 2.8, 3.7, 4.09);
  box(g, wood, 0.6, 3.9, 0.7, 3.25, 9.3, -1.5);
  box(g, stone, 1.5, 1.3, 1.5, 3.25, 11.7, -1.5);
  g.scale.setScalar(scale);
  return g;
}
function waterwheel(parent: THREE.Object3D): THREE.Group {
  const spin = new THREE.Group();
  const side = new THREE.Group();
  spin.add(side);
  side.rotation.y = Math.PI / 2;
  const ring = mesh(
    new THREE.TorusGeometry(3.1, 0.33, 5, 14),
    wood,
    side,
    0,
    0,
    0,
  );
  ring.rotation.z = Math.PI / 14;
  for (let i = 0; i < 10; i++) {
    const spoke = box(side, darkWood, 0.24, 6.15, 0.3, 0, 0, 0);
    spoke.rotation.z = (i / 10) * Math.PI;
  }
  cylinder(side, wood, 0.5, 0.5, 1, 0, 0, 0, 9).rotation.x = Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const paddle = box(
      side,
      paleWood,
      1.05,
      0.35,
      1.15,
      Math.sin(a) * 3.1,
      Math.cos(a) * 3.1,
      0,
    );
    paddle.rotation.z = -a;
  }
  parent.add(spin);
  return spin;
}

function createRiver(root: THREE.Group): void {
  const pos: number[] = [],
    indices: number[] = [];
  const bounds = getTerrainConfig();
  const start = -bounds.length / 2 + 17;
  const count = Math.ceil((197 - start) / 2);
  for (let i = 0; i <= count; i++) {
    const z = start + (i / count) * (197 - start);
    const x = riverX(z),
      y = riverLevel(z) + 0.04;
    const w = 6.2 + Math.sin(z * 0.036) * 0.45;
    pos.push(x - w, y, z, x + w, y, z);
    if (i < count) {
      const p = 2 * i;
      indices.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const river = mesh(
    geo,
    new THREE.MeshLambertMaterial({
      color: 0x70b7bd,
      transparent: true,
      opacity: 0.83,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    root,
    0,
    0,
    0,
  );
  river.renderOrder = 1;
  const sea = mesh(
    new THREE.PlaneGeometry(
      bounds.width + 20,
      Math.max(1, bounds.length / 2 - 179),
    ),
    new THREE.MeshLambertMaterial({
      color: 0x70b4ba,
      transparent: true,
      opacity: 0.79,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    root,
    0,
    bounds.seaLevel + 0.075,
    (179 + bounds.length / 2) / 2,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.renderOrder = 1;
}
function createTrail(root: THREE.Group): void {
  const pos: number[] = [],
    index: number[] = [];
  const n = 165;
  for (let i = 0; i <= n; i++) {
    const z = -265 + (i / n) * 450;
    const x = riverX(z) - 22;
    const width = 1.8;
    pos.push(
      x - width,
      terrainHeight(x - width, z) + 0.18,
      z,
      x + width,
      terrainHeight(x + width, z) + 0.18,
      z,
    );
    if (i < n) {
      const a = 2 * i;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0xd3bd94, side: THREE.DoubleSide }),
    root,
    0,
    0,
    0,
  ).userData.groundRibbon = true;
}
/** Instancing per valley sector lets the GPU skip distant trees outside the frustum. */
function createForest(root: THREE.Group, seed: number, density: number): void {
  const rand = mulberry32(seed + 1743);
  type Item = { x: number; y: number; z: number; s: number; hue: number };
  const sectors = 6;
  const buckets = Array.from({ length: sectors }, () => ({
    pines: [] as Item[],
    oaks: [] as Item[],
    rocks: [] as Item[],
  }));
  const treeSector = (z: number) =>
    Math.max(0, Math.min(sectors - 1, Math.floor(((z + 278) / 465) * sectors)));
  const rockSector = (z: number) =>
    Math.max(
      0,
      Math.min(sectors - 1, Math.floor(((z + 267.5) / 535) * sectors)),
    );
  const total = Math.round(360 * density);
  let count = 0;
  for (let i = 0; i < total * 2 && count < total; i++) {
    const x = (rand() - 0.5) * 183,
      z = -278 + rand() * 465,
      y = terrainHeight(x, z);
    if (
      pathDistance(x, z) < 3 ||
      z > 170 ||
      Math.abs(x - riverX(z)) < 17 ||
      y < riverLevel(z) + 0.8
    )
      continue;
    if (Math.abs(z + 56) < 26 && Math.abs(x - (riverX(-56) - 23)) < 25)
      continue;
    if (Math.abs(z - 100) < 35 && Math.abs(x - (riverX(100) - 25)) < 29)
      continue;
    const item: Item = {
      x,
      y,
      z,
      s: 0.73 + rand() * 1,
      hue: Math.floor(rand() * foliage.length),
    };
    const bucket = buckets[treeSector(z)];
    (rand() > 0.4 ? bucket.pines : bucket.oaks).push(item);
    count++;
  }
  for (let i = 0; i < 155; i++) {
    const x = (rand() - 0.5) * 190,
      z = (rand() - 0.5) * 535,
      y = terrainHeight(x, z);
    if (waterSurface(x, z) !== null || y < -1) continue;
    buckets[rockSector(z)].rocks.push({
      x,
      y,
      z,
      s: 0.35 + rand() * 1.5,
      hue: 0,
    });
  }
  const trunkGeo = geometry(
    'forest-trunk',
    () => new THREE.CylinderGeometry(0.33, 0.45, 3, 6),
  );
  const pineGeo = geometry(
    'forest-cone',
    () => new THREE.ConeGeometry(2.55, 6.7, 7),
  );
  const oakGeo = geometry(
    'forest-oak',
    () => new THREE.IcosahedronGeometry(2.65, 0),
  );
  const rockGeo = geometry(
    'forest-rock',
    () => new THREE.IcosahedronGeometry(1.8, 0),
  );
  const trunkMat = mat(0x7b6046),
    leafMat = mat(0xffffff);
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  function instances(
    items: Item[],
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    offset: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    colors = false,
  ) {
    if (!items.length) return;
    const inst = new THREE.InstancedMesh(geo, material, items.length);
    inst.userData.groundHeights = items.map((it) => it.y);
    inst.name = 'Vegetation sector';
    inst.frustumCulled = true;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x, it.y + offset * it.s, it.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(it.s * scaleX, it.s * scaleY, it.s * scaleZ);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      if (colors) inst.setColorAt(i, color.setHex(foliage[it.hue]));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    root.add(inst);
  }
  for (const bucket of buckets) {
    instances(bucket.pines, trunkGeo, trunkMat, 1.5, 1, 1, 1);
    instances(bucket.pines, pineGeo, leafMat, 5.1, 1, 1, 1, true);
    instances(bucket.oaks, trunkGeo, trunkMat, 1.35, 1, 1, 1);
    instances(bucket.oaks, oakGeo, leafMat, 4.3, 1.08, 0.85, 1.08, true);
    if (bucket.rocks.length) {
      const rocks = new THREE.InstancedMesh(
        rockGeo,
        stone,
        bucket.rocks.length,
      );
      rocks.name = 'Rocks sector';
      rocks.userData.groundHeights = bucket.rocks.map((it) => it.y);
      for (let i = 0; i < bucket.rocks.length; i++) {
        const it = bucket.rocks[i];
        dummy.position.set(it.x, it.y + 0.2 * it.s, it.z);
        dummy.rotation.set(0, i * 2.399963229728653, 0);
        dummy.scale.set(it.s, it.s * 0.6, it.s * 0.85);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
      rocks.computeBoundingSphere();
      root.add(rocks);
    }
  }
}

const modelPaths: Partial<Record<AssetId, string>> = {
  'nature.pine': 'models/pine.glb',
  'nature.rock': 'models/rock.glb',
  'props.crate': 'models/crate.glb',
};
const legacyModelPaths = new Set(Object.values(modelPaths));
const registryMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
sharedMaterials.add(registryMaterial);
const modelLoader = new GLTFLoader();
const loadingModels = new Map<string, Promise<THREE.Group | null>>();
function loadModel(path: string): Promise<THREE.Group | null> {
  let pending = loadingModels.get(path);
  if (!pending) {
    pending = modelLoader
      .loadAsync(import.meta.env.BASE_URL + path)
      .then((gltf) => {
        if (!legacyModelPaths.has(path)) {
          // Library GLBs carry sRGB COLOR_0 bytes and no material (glTF default = metallic,
          // rendered black without an environment map): one shared flat Lambert material.
          linearizeVertexColors(gltf.scene);
          gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = registryMaterial; });
        }
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) sharedGeometry.add(m.geometry);
          if (m.material)
            for (const material of Array.isArray(m.material)
              ? m.material
              : [m.material])
              sharedMaterials.add(material);
        });
        return gltf.scene as THREE.Group;
      })
      .catch((e) => {
        console.warn('GLB indisponible, modèle procédural conservé', path, e);
        return null;
      });
    loadingModels.set(path, pending);
  }
  return pending;
}
/** World Production registry GLB (vegetation lots, enclosures, bridges, dock, buildings):
 * THREE.LOD with the real LOD files, loaded lazily and shared; a neutral placeholder box of
 * the measured size stands in while loading (clearly procedural). Collisions, interactions
 * and placement never depend on which LOD is drawn. */
function createRegistryAsset(id: string): THREE.Group | null {
  const asset = worldAsset(id);
  if (!asset || asset.group === 'legacy') return null;
  const g = new THREE.Group();
  g.userData.registryAsset = id;
  // Landmarks stay visible far away (cheap LOD2 silhouettes), buildings farther than props.
  const role = asset.usage?.role;
  if (role === 'landmark') g.userData.viewDistance = 2600;
  else if (role === 'building') g.userData.viewDistance = 900;
  const [sx, sy, sz] = asset.size;
  const placeholder = box(g, mat(asset.usage?.role === 'tree' || asset.usage?.role === 'shrub' || asset.usage?.role === 'ground' ? 0x7fa86a : 0xb9a789), Math.max(.2, sx * .8), Math.max(.2, sy), Math.max(.2, sz * .8), 0, sy / 2, 0);
  placeholder.name = 'Placeholder ' + id;
  const distances = lodDistances(asset);
  void Promise.all(asset.lods.map((l) => loadModel(l.file))).then((scenes) => {
    if (!g.parent || g.userData.disposed) return;
    if (scenes.some((scene) => !scene)) return; // Keep the placeholder; error already logged.
    removeFallback(g);
    const lod = new THREE.LOD();
    lod.name = 'LOD ' + id;
    scenes.forEach((scene, i) => lod.addLevel(scene!.clone(true), distances[i], 2));
    g.add(lod);
  });
  return g;
}
/** LOD0 of a registry asset, loaded and cloned (Studio thumbnails); null for other assets. */
export async function loadAssetPreview(id: string): Promise<THREE.Object3D | null> {
  const asset = worldAsset(id);
  if (!asset || asset.group === 'legacy') return null;
  const scene = await loadModel(asset.lods[0].file);
  return scene ? scene.clone(true) : null;
}
function removeFallback(g: THREE.Group) {
  g.traverse((node) => {
    const m = node as THREE.Mesh;
    if (m.geometry && !sharedGeometry.has(m.geometry)) m.geometry.dispose();
    if (m.material)
      for (const mat of Array.isArray(m.material) ? m.material : [m.material])
        if (!sharedMaterials.has(mat)) mat.dispose();
  });
  g.clear();
}
export function createAsset(id: AssetId): THREE.Group {
  const registry = createRegistryAsset(id);
  if (registry) return registry;
  const g = new THREE.Group();
  if (id === 'nature.pine') {
    cylinder(g, wood, 0.24, 0.34, 2.4, 0, 1.2, 0);
    cylinder(g, deepGreen, 0, 2.0, 5.8, 0, 4.3, 0, 8);
    cylinder(g, mat(0x82a874), 0, 1.45, 3.8, 0, 5.5, 0, 8);
  } else if (id === 'nature.oak') {
    cylinder(g, wood, 0.28, 0.39, 2.9, 0, 1.45, 0);
    mesh(new THREE.IcosahedronGeometry(2.5, 0), mat(0x81aa71), g, 0, 4.0, 0);
    mesh(
      new THREE.IcosahedronGeometry(1.8, 0),
      mat(0xa6c38b),
      g,
      0.9,
      5.1,
      0.2,
    );
  } else if (id === 'nature.rock') {
    const r = mesh(new THREE.IcosahedronGeometry(2, 0), stone, g, 0, 0.95, 0);
    r.scale.set(1.1, 0.55, 0.8);
    r.rotation.y = 0.45;
  } else if (id === 'architecture.cottage') {
    cottage(g, 0.75);
  } else if (id === 'props.crate') {
    box(g, wood, 2, 2, 2, 0, 1, 0);
    box(g, darkWood, 2.12, 0.18, 2.12, 0, 1.8, 0);
    box(g, darkWood, 0.19, 2.1, 2.1, -0.8, 1, 0);
    box(g, darkWood, 0.19, 2.1, 2.1, 0.8, 1, 0);
  } else if (id === 'props.lantern') {
    cylinder(g, darkWood, 0.13, 0.16, 3.7, 0, 1.85, 0);
    box(g, mat(0xffd687), 0.85, 1, 0.85, 0, 3.7, 0);
    box(g, darkWood, 1.1, 0.25, 1.1, 0, 4.4, 0);
    mesh(new THREE.ConeGeometry(0.7, 0.62, 4), roof, g, 0, 4.85, 0);
  }
  const path = modelPaths[id];
  if (path) {
    void loadModel(path).then((scene) => {
      if (!scene || !g.parent || g.userData.disposed) return; // Avoid late mutation of a removed map.
      // Release the temporary procedural fallback before installing the shared GLB.
      g.traverse((node) => {
        const m = node as THREE.Mesh;
        if (m.geometry && !sharedGeometry.has(m.geometry)) m.geometry.dispose();
        if (m.material)
          for (const mat of Array.isArray(m.material)
            ? m.material
            : [m.material]) {
            if (!sharedMaterials.has(mat)) mat.dispose();
          }
      });
      g.clear();
      g.add(scene.clone(true)); // Shared GPU resources; independent transforms.
    });
  }
  return g;
}

function createBoatMesh(root: THREE.Group): THREE.Group {
  const boat = new THREE.Group();
  root.add(boat);
  const hull = mesh(new THREE.SphereGeometry(3, 9, 5), wood, boat, 0, 0, 0);
  hull.scale.set(0.7, 0.4, 2.1);
  box(boat, paleWood, 3.9, 0.22, 10.5, 0, 0.7, 0);
  cylinder(boat, darkWood, 0.12, 0.13, 7, 0, 4.1, 0.4);
  mesh(
    new THREE.PlaneGeometry(4.1, 5.8),
    new THREE.MeshLambertMaterial({ color: 0xf3ddb2, side: THREE.DoubleSide }),
    boat,
    2.1,
    4.25,
    0.4,
  );
  return boat;
}
function createVillage(root: THREE.Group): {
  wheel: THREE.Group;
  millPosition: THREE.Vector3;
  boat: THREE.Group;
} {
  const z = -57,
    x = riverX(z) - 24;
  const millPosition = new THREE.Vector3(x, terrainHeight(x, z), z);
  const mill = new THREE.Group();
  mill.position.copy(millPosition);
  root.add(mill);
  mill.userData.grounded = true;
  box(mill, cream, 12, 8, 11, 0, 4, 0);
  box(mill, wood, 12.7, 0.65, 11.8, 0, 0.33, 0);
  roofHouse(mill, 12, 11, 8);
  box(mill, darkWood, 2.4, 4, 0.35, 0, 2, 5.65);
  box(mill, windowMat, 1.9, 2.1, 0.2, -3.3, 5.0, 5.6);
  box(mill, windowMat, 1.9, 2.1, 0.2, 3.3, 5.0, 5.6);
  const wheel = waterwheel(mill);
  wheel.position.set(8.8, 3.55, 0.3);
  cylinder(mill, stone, 0.85, 1.1, 1.2, 8.8, 0.6, 0.3);
  const cottages = [
    [riverX(70) - 31, 70, 0.93, 0.21],
    [riverX(94) - 30, 94, 0.82, -0.4],
    [riverX(118) - 29, 118, 1.05, 0.36],
  ];
  for (const [hx, hz, scale, rotation] of cottages) {
    const h = cottage(root, scale);
    h.position.set(hx, terrainHeight(hx, hz), hz);
    h.rotation.y = rotation;
    h.userData.grounded = true;
  }
  // Wooden dock and a simple moored fishing boat.
  const dock = new THREE.Group();
  dock.position.set(-25, getTerrainConfig().seaLevel, 213);
  root.add(dock);
  for (let i = 0; i < 10; i++)
    box(dock, paleWood, 9, 0.34, 1.52, 0, 1.05, i * 2.3 - 8);
  for (const x1 of [-3.75, 3.75])
    for (const z1 of [-7, 12]) cylinder(dock, wood, 0.34, 0.42, 4, x1, 0.1, z1);
  const boat = createBoatMesh(root);
  boat.position.set(-17, getTerrainConfig().seaLevel - 0.15, 220);
  const lantern = createAsset('props.lantern');
  lantern.position.set(-29, getTerrainConfig().seaLevel + 1, 205);
  root.add(lantern);
  const crate = createAsset('props.crate');
  crate.position.set(x - 5, terrainHeight(x - 5, z + 11), z + 11);
  root.add(crate);
  return { wheel, millPosition, boat };
}

export function buildWorld(
  config: WorldConfig,
  definition?: WorldDefinition,
): WorldView {
  configureTerrain(
    config,
    definition?.terrain,
    definition?.water,
    definition?.paths,
  );
  configureWorldGeography(config, definition);
  const root = new THREE.Group();
  root.name = 'LittleWorld';
  // Generation is time-sliced (ms) rather than a fixed count; the shared level adapts LOD.
  // Geography workers (null in Node or when unavailable: synchronous main-thread path).
  const workers = geoWorkerPool();
  const terrainView = createTerrainView(root, getTerrainConfig(), { buildBudgetMs: 4, maxBuildsPerUpdate: 8, workers });
  const terrain = terrainView.terrain;
  const horizon = createHorizonView(root, getTerrainConfig(), terrainView, workers);
  // The demonstration valley decor is tied to the legacy generator; generated worlds
  // receive their content from V3 sources instead of hard-coded scenery.
  const legacy = isLegacyTerrain();
  let wheel = new THREE.Group(), millPosition = new THREE.Vector3(), boat: THREE.Group;
  if (legacy) {
    createRiver(root);
    createTrail(root);
    createForest(root, config.seed, config.density);
    ({ wheel, millPosition, boat } = createVillage(root));
  } else boat = createBoatMesh(root);
  const biomeAt = (x: number, z: number) => {
    const edits = definition?.biomes ?? [];
    for (let i = edits.length - 1; i >= 0; i--)
      if (Math.hypot(x - edits[i].x, z - edits[i].z) < edits[i].radius)
        return edits[i].biome;
    return sampleBiome(x, z);
  };
  const ecology = createEcology(root, config.seed, config.density, biomeAt, legacy ? undefined : generatedCover);
  // G5: natural dressing (forests, cliff rocks, scree, pebbles, basalt) of generated worlds.
  const dressing: DressingView | null = legacy ? null : createDressingView(root, config.seed, config.density, workers);
  const placed = createPlacedInstances(root, terrainHeight);
  const waterMeshes=new Map<string,{signature:string;mesh:THREE.Mesh}>();
  function refreshWater(){
    const changed:string[]=[],ids=new Set(compiledWaterBodies().map(w=>w.id));
    for(const [id,entry]of waterMeshes)if(!ids.has(id)){removePlacement(entry.mesh);waterMeshes.delete(id);changed.push(id);}
    for(const water of compiledWaterBodies()){
      const signature=JSON.stringify([water.width,water.depth,water.points.map(v=>[v.x,v.z,v.level])]);
      if(waterMeshes.get(water.id)?.signature===signature)continue;
      const previous=waterMeshes.get(water.id);if(previous)removePlacement(previous.mesh);
      const data=waterRibbonData(water),geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geo.setIndex(data.indices);geo.computeVertexNormals();
      const ribbon=mesh(geo,new THREE.MeshLambertMaterial({color:0x6daeb5,side:THREE.DoubleSide}),root,0,0,0);
      ribbon.name='Water:'+water.id;ribbon.userData.waterId=water.id;
      waterMeshes.set(water.id,{signature,mesh:ribbon});changed.push(water.id);
    }
    return changed;
  }
  refreshWater();
  // E8: authored paths are rendered per sector (one shared material, LOD, streaming);
  // an edit rebuilds only the sectors its path crosses.
  const pathView = createPathView(root, getTerrainConfig().chunkSize);
  function refreshPaths(paths: PathDefinition[]) {
    return pathView.setPaths(paths);
  }
  refreshPaths(definition?.paths ?? []);
  // E10: at most LIGHT_POOL real point lights (budget lowered in economy / overload).
  const lightView = createLightView(root, terrainHeight, { capacity: LIGHT_POOL });
  lightView.setSources(definition?.lights ?? []);
  const lightCamera = { x: 0, y: 0, z: 0 };
  let time = 0,
    detailLevel = 0,
    lastFocusX = NaN,
    lastFocusZ = NaN,
    velocityX = 0,
    velocityZ = 0;
  const forward = new THREE.Vector3(),
    frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4();
  const objects = new THREE.Group();
  objects.name = 'PlacedAssets';
  root.add(objects);
  return {
    root,
    terrain,
    wheel,
    millPosition,
    boat,
    objects,
    stats: terrainView.stats,
    horizon: horizon.stats,
    terrainWork: terrainView.work,
    placed,
    setDressingFilter(fn: Parameters<DressingView['setHidden']>[0]) { dressing?.setHidden(fn); },
    redrawDressing() { dressing?.redraw(); },
    dressing: dressing?.stats ?? null,
    paths: pathView.stats,
    refreshWater,
    refreshPaths,
    lights: lightView,
    refreshLights(lights) {
      lightView.setSources(lights);
    },
    setDetail(level, economy = false) {
      detailLevel = level;
      const pool = economy ? LIGHT_POOL_ECONOMY : LIGHT_POOL;
      lightView.setBudget(level >= 2 ? Math.ceil(pool / 2) : pool, pool);
      ecology.setDetail(level);
      dressing?.setDetail(economy ? level + 1 : level);
    },
    refreshTerrain(x, z, radius) {
      terrainView.refresh(x, z, radius);
      horizon.refresh(x, z, radius);
      ecology.refresh(x, z, radius);
      dressing?.refresh(x, z, radius);
      pathView.refreshArea(x, z, radius + 8);
      const matrix = new THREE.Matrix4();
      root.traverse((node) => {
        if (
          node.userData.grounded &&
          Math.hypot(node.position.x - x, node.position.z - z) < radius + 12
        )
          node.position.y = terrainHeight(node.position.x, node.position.z);
        const inst = node as THREE.InstancedMesh,
          heights = node.userData.groundHeights as number[] | undefined;
        if (inst.isInstancedMesh && heights) {
          for (let i = 0; i < inst.count; i++) {
            inst.getMatrixAt(i, matrix);
            const e = matrix.elements;
            if (Math.hypot(e[12] - x, e[14] - z) > radius) continue;
            const h = terrainHeight(e[12], e[14]);
            e[13] += h - heights[i];
            heights[i] = h;
            inst.setMatrixAt(i, matrix);
          }
          inst.instanceMatrix.needsUpdate = true;
          inst.computeBoundingSphere();
        }
        if (node.userData.groundRibbon) {
          const geo = (node as THREE.Mesh).geometry,
            positions = geo.getAttribute('position');
          for (let i = 0; i < positions.count; i++) {
            const px = positions.getX(i),
              pz = positions.getZ(i);
            if (Math.hypot(px - x, pz - z) < radius + 3)
              positions.setY(i, terrainHeight(px, pz) + 0.18);
          }
          positions.needsUpdate = true;
          geo.computeVertexNormals();
          geo.computeBoundingSphere();
        }
      });
    },
    update(dt: number, focus = { x: 0, z: 0 }, camera?: THREE.PerspectiveCamera, pixelHeight = 640) {
      time += dt;
      wheel.rotation.x -= dt * 0.33;
      if (camera) {
        // Smoothed focus velocity drives look-ahead; a jump (teleport) resets it.
        const jump = Math.hypot(focus.x - lastFocusX, focus.z - lastFocusZ);
        if (dt > 0 && Number.isFinite(jump) && jump < 50) {
          const mix = Math.min(1, dt * 4);
          velocityX += ((focus.x - lastFocusX) / dt - velocityX) * mix;
          velocityZ += ((focus.z - lastFocusZ) / dt - velocityZ) * mix;
        } else velocityX = velocityZ = 0;
        lastFocusX = focus.x;
        lastFocusZ = focus.z;
        camera.updateMatrixWorld();
        camera.getWorldDirection(forward);
        const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        terrainView.update(focus.x, focus.z, {
          playerX: focus.x, playerZ: focus.z,
          cameraX: camera.position.x, cameraY: camera.position.y, cameraZ: camera.position.z,
          forwardX: forward.x, forwardZ: forward.z,
          halfFovH: Math.atan(tanHalf * camera.aspect),
          focalPx: pixelHeight / (2 * tanHalf),
          velocityX, velocityZ,
          groundY: terrainHeight(camera.position.x, camera.position.z),
          quality: detailLevel,
        }, frustum);
      } else terrainView.update(focus.x, focus.z);
      horizon.update(focus);
      ecology.update(dt, time, focus.x, focus.z);
      dressing?.update(focus.x, focus.z);
      placed.update(focus.x, focus.z);
      pathView.update(focus.x, focus.z);
      if (camera) lightCamera.x = camera.position.x;
      else lightCamera.x = focus.x;
      lightCamera.y = camera ? camera.position.y : terrainHeight(focus.x, focus.z) + 30;
      lightCamera.z = camera ? camera.position.z : focus.z;
      lightView.update(lightCamera);
      const distance = getTerrainConfig().viewDistance;
      for (const object of objects.children)
        object.visible =
          Math.hypot(object.position.x - focus.x, object.position.z - focus.z) <
          (object.userData.viewDistance ?? distance);
    },
    dispose() {
      ecology.dispose();
      dressing?.dispose();
      placed.dispose();
      pathView.dispose();
      lightView.dispose();
      horizon.dispose();
      terrainView.dispose();
      root.traverse((o) => {
        o.userData.disposed = true; // Pending GLB callbacks must not attach to retired editor worlds.
        const m = o as THREE.Mesh;
        if ((m as THREE.InstancedMesh).isInstancedMesh)
          (m as THREE.InstancedMesh).dispose();
        if (m.geometry && !sharedGeometry.has(m.geometry)) m.geometry.dispose();
        if (m.material)
          for (const material of Array.isArray(m.material)
            ? m.material
            : [m.material])
            if (!sharedMaterials.has(material)) material.dispose();
      });
      root.removeFromParent();
    },
  };
}

/** Geography Engine inputs for a runtime/Studio world: sector masks, zones, legacy biome
 * strokes and building footprints, all derived from the same sources as the terrain. */
export function configureWorldGeography(config: WorldConfig, definition?: WorldDefinition) {
  const width = config.width ?? 200, length = config.length ?? 600, sector = definition?.geography?.sectorSizeM ?? config.chunkSize ?? 64;
  configureGeography({
    seed: config.seed,
    grid: { minX: -width / 2, minZ: -length / 2, chunkSizeM: sector, columns: Math.ceil(width / sector), rows: Math.ceil(length / sector) },
    masks: definition?.geography?.masks ?? {},
    zones: definition?.geography?.zones ?? [],
    landscapes: definition?.geography?.landscapes ?? [],
    biomeStrokes: (definition?.biomes ?? []).map((b) => ({ x: b.x, z: b.z, radius: b.radius, biome: b.biome })),
    buildings: (definition?.placements ?? []).flatMap((p) => { const radius = exclusionRadius(p.assetId, p.scale ?? 1); return radius === null ? [] : [{ x: p.x, z: p.z, radius }]; }),
  });
}
export function addPlacement(
  world: WorldView,
  placement: Placement,
): THREE.Group {
  const a = createAsset(placement.assetId);
  a.position.set(
    placement.x,
    terrainHeight(placement.x, placement.z) + (placement.y ?? 0),
    placement.z,
  );
  if (placement.quaternion) a.quaternion.fromArray(placement.quaternion);
  else a.rotation.y = placement.rotation;
  if (placement.scale3) a.scale.fromArray(placement.scale3);
  else a.scale.setScalar(placement.scale ?? 1);
  a.userData.placementId = placement.id;
  world.objects.add(a);
  return a;
}

export function configureScene(scene: THREE.Scene) {
  scene.background = new THREE.Color(0xcce6e2);
  scene.fog = null;
  const ambient=new THREE.HemisphereLight(0xfaf7e9, 0x678c7c, 2.15);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffeed3, 2.35);
  sun.position.set(-130, 185, -120);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd8f0ff, 0.65);
  fill.position.set(100, 70, 190);
  scene.add(fill);
  return {sun,fill,ambient};
}

/** Dispose unique fallback geometry while retaining cache-owned GPU resources. */
export function removePlacement(object: THREE.Object3D): void {
  object.traverse((o) => {
    o.userData.disposed = true;
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !sharedGeometry.has(mesh.geometry))
      mesh.geometry.dispose();
    if (mesh.material)
      for (const m of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        if (!sharedMaterials.has(m)) m.dispose();
  });
  object.removeFromParent();
}
