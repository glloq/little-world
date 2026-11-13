import * as THREE from 'three';
import {
  planChunks,
  planView,
  viewChanged,
  type ViewFocus,
  type ChunkConfig,
  type PlannedChunk,
  type TerrainLOD,
  type WorldChunk,
} from './chunks.ts';
import { packedColors, packedNormals } from './render/packing.ts';
import { createChunkData, type ChunkData } from './terrain-data.ts';
import type { GeoWorkerPool, GeoTask } from './geography/geo-workers.ts';
export { createChunkData, type ChunkData } from './terrain-data.ts';

/** Three.js geometry of a tile from its pure data (see terrain-data.ts). */
export function geometryFromChunkData(data: ChunkData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', packedColors(data.colors));
  geometry.setAttribute('normal', packedNormals(data.normals));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.surfaceVertices = data.surfaceVertices;
  geometry.userData.minSurfaceY = data.minSurfaceY;
  return geometry;
}
export function createChunkGeometry(chunk: WorldChunk, lod: TerrainLOD): THREE.BufferGeometry {
  return geometryFromChunkData(createChunkData(chunk, lod));
}

interface CachedChunk {
  /** Displayed but outdated after an edit: kept until its replacement arrives (no hole). */
  stale?: boolean;
  mesh: THREE.Mesh;
  chunk: WorldChunk;
  lod: TerrainLOD;
  used: number;
  bytes: number;
}
export interface TerrainStats {
  active: number;
  resident: number;
  pending: number;
  triangles: number;
  built: number;
  disposed: number;
  /** Displayed tiles intersecting the camera frustum (when a frustum is supplied). */
  visible: number;
  /** Estimated GPU bytes of resident tile geometry (attributes + index). */
  bytes: number;
  /** Tiles in the plan by reason (camera-aware planning only). */
  safety: number;
  inView: number;
  ahead: number;
  turn: number;
  replans: number;
}
export interface TerrainWorkStats {lastMs:number;maxTileMs:number;totalMs:number;lastBuilt:number}
export interface TerrainView {
  terrain: THREE.Group;
  stats: TerrainStats;
  work: TerrainWorkStats;
  /** Incremented whenever the displayed tile set changes (horizon coverage mask). */
  readonly version: number;
  readonly tileSize: number;
  forEachActive(visit: (column: number, row: number, minY?: number) => void): void;
  update(x: number, z: number, focus?: ViewFocus, frustum?: THREE.Frustum): void;
  refresh(x: number, z: number, radius: number): void;
  dispose(): void;
}
export interface TerrainViewOptions {
  /** Time slice for tile generation per update (ms); at least one tile is built when work is pending. */
  buildBudgetMs?: number;
  maxBuildsPerUpdate?: number;
  /** Byte bound of resident tile geometry (displayed tiles are never evicted). */
  maxBytes?: number;
  /** Geography workers: tile data is computed off the main thread (same results). */
  workers?: GeoWorkerPool | null;
}
export function geometryBytes(geometry: THREE.BufferGeometry): number {
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes))
    bytes += (attribute as THREE.BufferAttribute).array.byteLength;
  return bytes;
}
/** Bounded geometry cache: only requested LODs are generated, within a time slice and a byte budget.
 * A tile keeps its previous LOD until the replacement exists; tiles without any mesh are drawn by
 * the horizon layer, so a late build never leaves a hole. */
export function createTerrainView(
  root: THREE.Group,
  config: ChunkConfig,
  options: TerrainViewOptions = {},
): TerrainView {
  const terrain = new THREE.Group();
  terrain.name = 'StreamedTerrain';
  root.add(terrain);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const budgetMs = options.buildBudgetMs ?? Infinity,
    maxBuilds = options.maxBuildsPerUpdate ?? 2,
    maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const cache = new Map<string, CachedChunk>(),
    active = new Map<string, CachedChunk>();
  const stats: TerrainStats = {
    active: 0,
    resident: 0,
    pending: 0,
    triangles: 0,
    built: 0,
    disposed: 0,
    visible: 0,
    bytes: 0,
    safety: 0,
    inView: 0,
    ahead: 0,
    turn: 0,
    replans: 0,
  };
  const work: TerrainWorkStats = { lastMs: 0, maxTileMs: 0, totalMs: 0, lastBuilt: 0 };
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
    sequence = 0,
    version = 0,
    bytes = 0;
  let lastX = Infinity,
    lastZ = Infinity,
    lastFocus: ViewFocus | null = null,
    dead = false;
  const key = (chunk: WorldChunk, lod: TerrainLOD) => `${chunk.id}/${lod}`;
  const pool = options.workers ?? null;
  /** Tiles requested from the workers (key → job), at most MAX_IN_FLIGHT at once so a
   * replanned camera keeps priority over older requests. */
  const inFlight = new Map<string, { chunk: PlannedChunk; task: GeoTask<ChunkData> }>();
  const MAX_IN_FLIGHT = 6;
  function dispatch(): void {
    for (const [k, job] of inFlight)
      if (!desired.some((d) => key(d, d.lod) === k)) { job.task.cancel(); inFlight.delete(k); }
    for (let i = 0; i < pending.length && inFlight.size < MAX_IN_FLIGHT; i++) {
      const chunk = pending[i], k = key(chunk, chunk.lod);
      // Already built (e.g. by a request issued before a replan): show it, never wait for it.
      const ready = cache.get(k);
      if (ready) { pending.splice(i--, 1); show(ready); continue; }
      if (inFlight.has(k)) continue;
      const task = pool!.run<ChunkData>({ kind: 'tile', chunk: { minX: chunk.minX, maxX: chunk.maxX, minZ: chunk.minZ, maxZ: chunk.maxZ }, lod: chunk.lod }, i);
      inFlight.set(k, { chunk, task });
      task.promise.then(({ result, stale }) => {
        if (inFlight.get(k)?.task !== task) return;
        inFlight.delete(k);
        if (dead || stale || cache.has(k)) return;
        // A replan may have queued a new object for the same tile: match by key, not identity.
        const index = pending.findIndex((c) => key(c, c.lod) === k);
        if (index >= 0) pending.splice(index, 1);
        build(chunk, result);
        work.lastBuilt++;
      }, () => {
        // Worker failure: the tile is built on the main thread by the synchronous path.
        if (inFlight.get(k)?.task === task) inFlight.delete(k);
      });
    }
  }
  function release(record: CachedChunk): void {
    record.mesh.removeFromParent();
    record.mesh.geometry.dispose();
    stats.disposed++;
    bytes -= record.bytes;
    cache.delete(key(record.chunk, record.lod));
    if (active.get(record.chunk.id) === record) {
      active.delete(record.chunk.id);
      version++;
    }
  }
  function retireStale(record: CachedChunk): void {
    record.mesh.removeFromParent();
    record.mesh.geometry.dispose();
    stats.disposed++;
    bytes -= record.bytes;
  }
  function show(record: CachedChunk): void {
    const previous = active.get(record.chunk.id);
    if (previous !== record) {
      if (previous?.stale) retireStale(previous);
      else previous?.mesh.removeFromParent();
      terrain.add(record.mesh);
      active.set(record.chunk.id, record);
      version++;
    }
    record.used = ++sequence;
  }
  function apply(plan: PlannedChunk[]): void {
    desired = plan;
    stats.replans++;
    const wanted = new Set(desired.map((chunk) => chunk.id));
    for (const [id, record] of active)
      if (!wanted.has(id)) {
        if (record.stale) retireStale(record);
        else record.mesh.removeFromParent();
        active.delete(id);
        version++;
      }
    // Re-prioritised queue: stale requests are dropped (cancellation by replanning).
    pending = [];
    for (const chunk of desired) {
      const cached = cache.get(key(chunk, chunk.lod));
      if (cached) show(cached);
      else pending.push(chunk);
    }
  }
  function previousLods() {
    return new Map(desired.map((chunk) => [chunk.id, chunk.lod]));
  }
  function replan(x: number, z: number): void {
    apply(planChunks(config, x, z, previousLods()));
    lastX = x;
    lastZ = z;
  }
  function replanView(focus: ViewFocus): void {
    const plan = planView(config, focus, previousLods());
    stats.safety = stats.inView = stats.ahead = stats.turn = 0;
    for (const chunk of plan)
      if (chunk.reason === 'safety') stats.safety++;
      else if (chunk.reason === 'view') stats.inView++;
      else if (chunk.reason === 'ahead') stats.ahead++;
      else stats.turn++;
    apply(plan);
    lastFocus = { ...focus };
    lastX = focus.playerX;
    lastZ = focus.playerZ;
  }
  function build(chunk: PlannedChunk, data?: ChunkData): void {
    const begin = performance.now();
    const mesh = new THREE.Mesh(geometryFromChunkData(data ?? createChunkData(chunk, chunk.lod)), material);
    mesh.name = `Terrain ${chunk.id} LOD ${chunk.lod}`;
    mesh.userData.chunkId = chunk.id;
    mesh.userData.lod = chunk.lod;
    mesh.frustumCulled = true;
    const record: CachedChunk = {
      mesh,
      chunk,
      lod: chunk.lod,
      used: ++sequence,
      bytes: geometryBytes(mesh.geometry),
    };
    cache.set(key(chunk, chunk.lod), record);
    bytes += record.bytes;
    stats.built++;
    if (desired.some((d) => d.id === chunk.id && d.lod === chunk.lod)) show(record);
    const spent = performance.now() - begin;
    work.maxTileMs = Math.max(work.maxTileMs, spent);
  }
  function evict(): void {
    if (cache.size <= maxResident && bytes <= maxBytes) return;
    const retired = [...cache.values()]
      .filter((record) => active.get(record.chunk.id) !== record)
      .sort((a, b) => a.used - b.used);
    for (const record of retired) {
      if (cache.size <= maxResident && bytes <= maxBytes) break;
      release(record);
    }
  }
  function updateStats(frustum?: THREE.Frustum): void {
    stats.active = active.size;
    stats.resident = cache.size;
    stats.pending = pending.length;
    stats.bytes = bytes;
    stats.triangles = 0;
    let visible = 0;
    for (const record of active.values()) {
      stats.triangles += (record.mesh.geometry.index?.count ?? 0) / 3;
      if (frustum && record.mesh.geometry.boundingSphere && frustum.intersectsSphere(record.mesh.geometry.boundingSphere)) visible++;
    }
    stats.visible = frustum ? visible : active.size;
  }
  const view: TerrainView = {
    terrain,
    stats,
    work,
    get version() {
      return version;
    },
    tileSize: config.chunkSize,
    forEachActive(visit) {
      for (const record of active.values())
        visit(record.chunk.column, record.chunk.row, record.mesh.geometry.userData.minSurfaceY);
    },
    update(x, z, focus, frustum) {
      if (dead || !Number.isFinite(x) || !Number.isFinite(z)) return;
      if (focus) {
        if (viewChanged(lastFocus, focus, config.chunkSize)) replanView(focus);
      } else if (Math.hypot(x - lastX, z - lastZ) > config.chunkSize / 8) replan(x, z);
      const begin = performance.now();
      let built = 0;
      if (pool?.available) dispatch();
      else
        while (pending.length && built < maxBuilds && (built === 0 || performance.now() - begin < budgetMs)) {
          build(pending.shift()!);
          built++;
        }
      work.lastBuilt = built;
      work.lastMs = performance.now() - begin;
      work.totalMs += work.lastMs;
      evict();
      updateStats(frustum);
    },
    refresh(x, z, radius) {
      if (dead) return;
      const touched = (chunk: WorldChunk) => chunk.maxX >= x - radius && chunk.minX <= x + radius && chunk.maxZ >= z - radius && chunk.minZ <= z + radius;
      for (const record of [...cache.values()]) {
        if (!touched(record.chunk)) continue;
        // With workers the displayed tile stays until its rebuilt version arrives.
        if (pool?.available && active.get(record.chunk.id) === record) {
          record.stale = true;
          cache.delete(key(record.chunk, record.lod));
        } else release(record);
      }
      for (const [k, job] of inFlight) if (touched(job.chunk)) { job.task.cancel(); inFlight.delete(k); }
      if (lastFocus) replanView(lastFocus);
      else
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
      for (const record of active.values()) if (record.stale) retireStale(record);
      for (const job of inFlight.values()) job.task.cancel();
      inFlight.clear();
      material.dispose();
      pending = [];
      desired = [];
      terrain.removeFromParent();
      updateStats();
    },
  };
  return view;
}
