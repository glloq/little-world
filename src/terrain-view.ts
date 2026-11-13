import * as THREE from 'three';
import {
  planChunks,
  type ChunkConfig,
  type PlannedChunk,
  type TerrainLOD,
  type WorldChunk,
} from './chunks.ts';
import { terrainColor, terrainHeight } from './terrain.ts';

/** A surface plus downward skirts hides cracks where neighboring chunks use different LODs. */
export function createChunkGeometry(
  chunk: WorldChunk,
  lod: TerrainLOD,
): THREE.BufferGeometry {
  const spacing = [2.5, 5, 10][lod];
  // Power-of-two subdivisions align coarse and fine samples, including partial edge chunks.
  const cells = (length: number) =>
    2 ** Math.max(0, Math.ceil(Math.log2(length / spacing)));
  const cellsX = cells(chunk.maxX - chunk.minX),
    cellsZ = cells(chunk.maxZ - chunk.minZ);
  const positions: number[] = [],
    colors: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  const color = new THREE.Color();
  function vertex(x: number, z: number, skirt = false): number {
    const h = terrainHeight(x, z);
    positions.push(x, h - (skirt ? 12 : 0), z);
    const slope = Math.abs(terrainHeight(x + 2, z) - h);
    terrainColor(x, z, h, slope, color);
    color.multiplyScalar(
      0.92 +
        0.07 * Math.sin(x * 0.275 + z * 0.165) +
        0.035 * Math.sin(x + z * 0.7),
    );
    colors.push(color.r, color.g, color.b);
    // Analytic finite-difference normals are independent of local LOD and match across boundaries.
    const nx = terrainHeight(x - 0.25, z) - terrainHeight(x + 0.25, z);
    const nz = terrainHeight(x, z - 0.25) - terrainHeight(x, z + 0.25);
    const magnitude = Math.hypot(nx, 0.5, nz);
    normals.push(nx / magnitude, 0.5 / magnitude, nz / magnitude);
    return positions.length / 3 - 1;
  }
  for (let iz = 0; iz <= cellsZ; iz++)
    for (let ix = 0; ix <= cellsX; ix++) {
      vertex(
        chunk.minX + ((chunk.maxX - chunk.minX) * ix) / cellsX,
        chunk.minZ + ((chunk.maxZ - chunk.minZ) * iz) / cellsZ,
      );
    }
  for (let iz = 0; iz < cellsZ; iz++)
    for (let ix = 0; ix < cellsX; ix++) {
      const a = iz * (cellsX + 1) + ix,
        b = a + 1,
        d = a + cellsX + 1;
      indices.push(a, d, b, b, d, d + 1);
    }
  const edges: number[][] = [
    Array.from({ length: cellsX + 1 }, (_, i) => i),
    Array.from({ length: cellsZ + 1 }, (_, i) => i * (cellsX + 1) + cellsX),
    Array.from(
      { length: cellsX + 1 },
      (_, i) => cellsZ * (cellsX + 1) + cellsX - i,
    ),
    Array.from({ length: cellsZ + 1 }, (_, i) => (cellsZ - i) * (cellsX + 1)),
  ];
  for (const edge of edges) {
    const bottom = edge.map((index) =>
      vertex(positions[index * 3], positions[index * 3 + 2], true),
    );
    for (let i = 0; i < edge.length - 1; i++)
      indices.push(
        edge[i],
        bottom[i],
        edge[i + 1],
        edge[i + 1],
        bottom[i],
        bottom[i + 1],
      );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.surfaceVertices = (cellsX + 1) * (cellsZ + 1);
  return geometry;
}

interface CachedChunk {
  mesh: THREE.Mesh;
  chunk: WorldChunk;
  lod: TerrainLOD;
  used: number;
}
export interface TerrainStats {
  active: number;
  resident: number;
  pending: number;
  triangles: number;
  built: number;
  disposed: number;
}
export interface TerrainView {
  terrain: THREE.Group;
  stats: TerrainStats;
  update(x: number, z: number): void;
  refresh(x: number, z: number, radius: number): void;
  dispose(): void;
}
/** Bounded geometry cache; only requested LODs are generated, at most two new meshes per update. */
export function createTerrainView(
  root: THREE.Group,
  config: ChunkConfig,
): TerrainView {
  const terrain = new THREE.Group();
  terrain.name = 'StreamedTerrain';
  root.add(terrain);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const cache = new Map<string, CachedChunk>(),
    active = new Map<string, CachedChunk>();
  const stats: TerrainStats = {
    active: 0,
    resident: 0,
    pending: 0,
    triangles: 0,
    built: 0,
    disposed: 0,
  };
  const maxResident = Math.max(
    16,
    Math.min(
      Math.ceil(config.width / config.chunkSize) *
        Math.ceil(config.length / config.chunkSize) *
        3,
      2 * (Math.ceil((2 * config.viewDistance) / config.chunkSize) + 3) ** 2,
    ),
  );
  let desired: PlannedChunk[] = [],
    pending: PlannedChunk[] = [],
    sequence = 0;
  let lastX = Infinity,
    lastZ = Infinity,
    dead = false;
  const key = (chunk: WorldChunk, lod: TerrainLOD) => `${chunk.id}/${lod}`;
  function release(record: CachedChunk): void {
    record.mesh.removeFromParent();
    record.mesh.geometry.dispose();
    stats.disposed++;
    cache.delete(key(record.chunk, record.lod));
    if (active.get(record.chunk.id) === record) active.delete(record.chunk.id);
  }
  function show(record: CachedChunk): void {
    const previous = active.get(record.chunk.id);
    if (previous !== record) {
      previous?.mesh.removeFromParent();
      terrain.add(record.mesh);
      active.set(record.chunk.id, record);
    }
    record.used = ++sequence;
  }
  function replan(x: number, z: number): void {
    desired = planChunks(
      config,
      x,
      z,
      new Map(desired.map((chunk) => [chunk.id, chunk.lod])),
    );
    const wanted = new Set(desired.map((chunk) => chunk.id));
    for (const [id, record] of active)
      if (!wanted.has(id)) {
        record.mesh.removeFromParent();
        active.delete(id);
      }
    pending = [];
    for (const chunk of desired) {
      const cached = cache.get(key(chunk, chunk.lod));
      if (cached) show(cached);
      else pending.push(chunk);
    }
    lastX = x;
    lastZ = z;
  }
  function updateStats(): void {
    stats.active = active.size;
    stats.resident = cache.size;
    stats.pending = pending.length;
    stats.triangles = 0;
    for (const record of active.values())
      stats.triangles += (record.mesh.geometry.index?.count ?? 0) / 3;
  }
  const view: TerrainView = {
    terrain,
    stats,
    update(x, z) {
      if (dead || !Number.isFinite(x) || !Number.isFinite(z)) return;
      if (Math.hypot(x - lastX, z - lastZ) > config.chunkSize / 8) replan(x, z);
      for (let budget = 0; budget < 2 && pending.length; budget++) {
        const chunk = pending.shift()!;
        const mesh = new THREE.Mesh(
          createChunkGeometry(chunk, chunk.lod),
          material,
        );
        mesh.name = `Terrain ${chunk.id} LOD ${chunk.lod}`;
        mesh.userData.chunkId = chunk.id;
        mesh.userData.lod = chunk.lod;
        mesh.frustumCulled = true;
        const record: CachedChunk = {
          mesh,
          chunk,
          lod: chunk.lod,
          used: ++sequence,
        };
        cache.set(key(chunk, chunk.lod), record);
        stats.built++;
        show(record);
      }
      if (cache.size > maxResident) {
        const retired = [...cache.values()]
          .filter((record) => active.get(record.chunk.id) !== record)
          .sort((a, b) => a.used - b.used);
        for (const record of retired) {
          if (cache.size <= maxResident) break;
          release(record);
        }
      }
      updateStats();
    },
    refresh(x, z, radius) {
      if (dead) return;
      for (const record of [...cache.values()]) {
        const chunk = record.chunk;
        if (
          chunk.maxX >= x - radius &&
          chunk.minX <= x + radius &&
          chunk.maxZ >= z - radius &&
          chunk.minZ <= z + radius
        )
          release(record);
      }
      replan(
        Number.isFinite(lastX) ? lastX : x,
        Number.isFinite(lastZ) ? lastZ : z,
      );
      updateStats();
    },
    dispose() {
      if (dead) return;
      dead = true;
      for (const record of [...cache.values()]) release(record);
      material.dispose();
      pending = [];
      desired = [];
      terrain.removeFromParent();
      updateStats();
    },
  };
  return view;
}
