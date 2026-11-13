/** Little World — Dock kit v1
 * Deterministic modular assembly for a 2 m × 2 m grid.
 * Requires `three@^0.180.0` and its GLTFLoader, already used by Little World.
 * Source module for use by Studio / gameplay, NOT an editor or network sync.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const DOCK_GRID_METERS = 2;
export const DOCK_DECK_Y = 1;
const SIDES = {
  north: { dx: 0, dz: -1, yaw: 0 },
  east: { dx: 1, dz: 0, yaw: -Math.PI / 2 },
  south: { dx: 0, dz: 1, yaw: Math.PI },
  west: { dx: -1, dz: 0, yaw: Math.PI / 2 }
};
const glbCache = new Map();
const loader = new GLTFLoader();
const index = (x, z) => `${x},${z}`;
const matrix = (x, y, z, angle = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
  new THREE.Vector3(1, 1, 1)
);

/** URL must be constructed from Vite's BASE_URL in the caller, not a hard-coded root. */
async function loadMesh(assetBaseUrl, name, lod) {
  const root = assetBaseUrl.replace(/\/$/, '');
  const key = `${root}/${name}/lod${lod}.glb`;
  if (!glbCache.has(key)) {
    const work = loader.loadAsync(key).then((gltf) => {
      let mesh;
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          if (mesh) throw new Error(`Multiple meshes in ${key}; expected one`);
          mesh = child;
        }
      });
      if (!mesh) throw new Error(`No mesh in ${key}`);
      mesh.updateWorldMatrix(true, false);
      if (!mesh.matrixWorld.equals(new THREE.Matrix4())) {
        // GLBs in this kit should be at the identity to support InstancedMesh.
        throw new Error(`Unexpected GLB node transform: ${key}`);
      }
      return { geometry: mesh.geometry, material: mesh.material };
    });
    glbCache.set(key, work);
    work.catch(() => glbCache.delete(key));
  }
  return glbCache.get(key);
}

function getSide(value) {
  const side = SIDES[value];
  if (!side) throw new Error(`Unknown dock side: ${value}`);
  return side;
}

function normalizeCells(cells) {
  const map = new Map();
  for (const cell of cells) {
    const gx = Array.isArray(cell) ? cell[0] : cell.gx;
    const gz = Array.isArray(cell) ? cell[1] : cell.gz;
    if (!Number.isInteger(gx) || !Number.isInteger(gz)) {
      throw new TypeError('Dock grid coordinates must be integers');
    }
    map.set(index(gx, gz), { gx, gz, rotation: Array.isArray(cell) ? 0 : cell.rotation ?? 0 });
  }
  return map;
}

function makeInstances(geometry, material, transforms, label, castShadow = true) {
  if (!transforms.length) return null;
  const instanced = new THREE.InstancedMesh(geometry, material, transforms.length);
  instanced.name = label;
  instanced.castShadow = castShadow;
  instanced.receiveShadow = true;
  for (let i = 0; i < transforms.length; i++) instanced.setMatrixAt(i, transforms[i]);
  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  return instanced;
}

/**
 * @param {Object} args
 * @param {Array<[number,number]|{gx:number,gz:number,rotation?:number}>} args.cells
 * @param {string} args.assetBaseUrl - `${import.meta.env.BASE_URL}models/structures/dock/` in a Vite app
 * @param {0|1|2} [args.lod=0]
 * @param {Array<{tile:[number,number],offset?:[number,number]}>} [args.bollards=[]]
 * @param {Array<{tile:[number,number],side:'north'|'east'|'south'|'west'}>} [args.ramps=[]]
 * @param {Array<{tile:[number,number],side:'north'|'east'|'south'|'west'}>} [args.ladders=[]]
 * @param {boolean} [args.fascia=true] - add ONLY outer-side finishing beams
 * @returns {Promise<THREE.Group>}
 */
export async function assembleDock({ cells, assetBaseUrl, lod = 0, bollards = [], ramps = [], ladders = [], fascia = true }) {
  if (!assetBaseUrl) throw new Error('assetBaseUrl must be set, e.g. `${import.meta.env.BASE_URL}models/structures/dock/`');
  if (![0, 1, 2].includes(lod)) throw new RangeError('lod must be 0, 1 or 2');
  const cellMap = normalizeCells(cells);
  const needs = ['tile', 'post'];
  if (bollards.length) needs.push('bollard');
  if (ramps.length) needs.push('ramp');
  if (ladders.length) needs.push('ladder');
  const loaded = Object.fromEntries(await Promise.all(needs.map(async name => [name, await loadMesh(assetBaseUrl, name, lod)])));
  const root = new THREE.Group();
  root.name = 'LittleWorld_ModularDock';
  const tiles = [], posts = new Map(), edgeMatrices = [];
  const rampMatrices = [], ladderMatrices = [], bollardMatrices = [];
  const exemptEdges = new Set();

  for (const part of ramps) {
    const [x, z] = part.tile;
    if (!cellMap.has(index(x, z))) throw new Error(`Ramp tile not found: ${x},${z}`);
    const side = getSide(part.side);
    exemptEdges.add(`${index(x, z)}:${part.side}`);
    rampMatrices.push(matrix(2 * (x + side.dx), 0, 2 * (z + side.dz), side.yaw));
  }
  for (const part of ladders) {
    const [x, z] = part.tile;
    if (!cellMap.has(index(x, z))) throw new Error(`Ladder tile not found: ${x},${z}`);
    const side = getSide(part.side);
    // Ladder half-embedded in outer edge; center is beyond the tile perimeter.
    ladderMatrices.push(matrix(2 * x + side.dx * 1.10, 0, 2 * z + side.dz * 1.10, side.yaw));
  }
  for (const part of bollards) {
    const [x, z] = part.tile;
    if (!cellMap.has(index(x, z))) throw new Error(`Bollard tile not found: ${x},${z}`);
    const [ox, oz] = part.offset ?? [0.42, 0.42];
    if (Math.abs(ox) > .72 || Math.abs(oz) > .72) throw new Error('Bollard offset too close to a support post');
    bollardMatrices.push(matrix(2 * x + ox, DOCK_DECK_Y, 2 * z + oz));
  }

  for (const { gx, gz, rotation } of cellMap.values()) {
    tiles.push(matrix(gx * 2, 0, gz * 2, rotation));
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      const px = gx * 2 + dx, pz = gz * 2 + dz;
      posts.set(index(px, pz), matrix(px, 0, pz)); // one support at each shared corner
    }
    for (const [sideName, side] of Object.entries(SIDES)) {
      if (cellMap.has(index(gx + side.dx, gz + side.dz))) continue;
      if (exemptEdges.has(`${index(gx, gz)}:${sideName}`)) continue;
      // model fascia as one cheap, flat cuboid along the exposed edge only
      const x = 2 * gx + .968 * side.dx, z = 2 * gz + .968 * side.dz;
      const angle = sideName === 'east' || sideName === 'west' ? Math.PI / 2 : 0;
      edgeMatrices.push(matrix(x, .865, z, angle));
    }
  }
  const parts = [
    ['tile', tiles], ['post', [...posts.values()]], ['bollard', bollardMatrices],
    ['ramp', rampMatrices], ['ladder', ladderMatrices]
  ];
  for (const [name, transforms] of parts) {
    if (!transforms.length) continue;
    const { geometry, material } = loaded[name];
    root.add(makeInstances(geometry, material, transforms, `dock_${name}`, name !== 'bollard'));
  }
  if (fascia && edgeMatrices.length) {
    // BoxGeometry can be shared across all boundary segments; not a sixth GLB asset.
    const edgeGeometry = new THREE.BoxGeometry(1.915, .15, .095);
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#755039', roughness: 1 });
    const edge = makeInstances(edgeGeometry, edgeMaterial, edgeMatrices, 'dock_exposed_fascia');
    edge.userData.ownedGeometry = true;
    edge.userData.ownedMaterial = true;
    root.add(edge);
  }
  root.userData.dockMetrics = {
    tileCount: tiles.length,
    uniquePostCount: posts.size,
    outerEdgeCount: edgeMatrices.length,
    bollardCount: bollardMatrices.length,
    rampCount: rampMatrices.length,
    ladderCount: ladderMatrices.length,
    lod,
    drawCallsEstimate: root.children.length
  };
  // Do not dispose the globally cached GLB assets here; only local fascia resources.
  return root;
}

/** Dispose only the resources made for this instance, not shared GLB geometry/material. */
export function disposeDock(dock) {
  dock.traverse((object) => {
    if (object.isInstancedMesh) {
      if (object.userData.ownedGeometry) object.geometry.dispose();
      if (object.userData.ownedMaterial) object.material.dispose();
      object.dispose();
    }
  });
}
