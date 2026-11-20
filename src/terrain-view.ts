import * as THREE from 'three';
import {
  chunkBounds,
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
import { createChunkData, horizonContext, type ChunkData } from './terrain-data.ts';
import type { GeoWorkerPool, GeoTask } from './geography/geo-workers.ts';
export { createChunkData, type ChunkData } from './terrain-data.ts';

/** Three.js geometry of a tile from its pure data (see terrain-data.ts). */
export function geometryFromChunkData(data: ChunkData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', packedColors(data.colors));
  geometry.setAttribute('normal', packedNormals(data.normals));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  if (data.morphY && data.morphColors && data.morphNormals) {
    geometry.setAttribute('morphY', new THREE.BufferAttribute(data.morphY, 1));
    geometry.setAttribute('morphColor', packedColors(data.morphColors));
    geometry.setAttribute('morphNormal', packedNormals(data.morphNormals));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Bounds also cover the morph target and the highest rising skirt (frustum culling).
  let reach = 0;
  if (data.morphY) for (let i = 0; i < data.morphY.length; i++) reach = Math.max(reach, Math.abs(data.morphY[i] - data.positions[i * 3 + 1]));
  if (data.upHorizon && data.upSource) for (let i = 0; i < data.upHorizon.length; i++) reach = Math.max(reach, data.upHorizon[i] - data.positions[data.upSource[i] * 3 + 1]);
  if (reach > 0) { geometry.boundingSphere!.radius += reach; geometry.boundingBox!.min.y -= reach; geometry.boundingBox!.max.y += reach; }
  geometry.userData.surfaceVertices = data.surfaceVertices;
  geometry.userData.minSurfaceY = data.minSurfaceY;
  if (data.upStart !== undefined) Object.assign(geometry.userData, { upStart: data.upStart, upSource: data.upSource, upHorizon: data.upHorizon, upEdges: data.upEdges });
  return geometry;
}
/** Terrain material: vertex colours plus a geomorph between the tile's own shape and its
 * parent representation (attributes morphY/morphColor/morphNormal), driven by uMorph.
 * Every instance shares one program (same cache key); only tiles currently blending own
 * a separate instance with their own uMorph, the others use a fixed 0. */
export function createTerrainMaterial(): { material: THREE.MeshLambertMaterial; morph: { value: number } } {
  const morph = { value: 0 };
  // Front faces only (like the horizon): the heightfield is never seen from below (mines have
  // their own ceilings, the camera stays above the ground). Skirts face outwards, so a
  // T-junction crack shows the neighbour's skirt lit like the ground, and the back-facing
  // skirt of the near tile is culled instead of z-fighting with it (doc 106, QUAL-5).
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMorph = morph;
    shader.vertexShader = 'attribute float morphY;\nattribute vec3 morphColor;\nattribute vec3 morphNormal;\nuniform float uMorph;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(vec3(normal), morphNormal, uMorph));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position);\ntransformed.y = mix(position.y, morphY, uMorph);')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor.rgb = mix(color.rgb, morphColor, uMorph);\n#endif');
  };
  material.customProgramCacheKey = () => 'terrain-geomorph-v1';
  return { material, morph };
}
/** Blend duration between two representations of a tile (seconds). */
export const TERRAIN_MORPH_SECONDS = 0.6;
export function createChunkGeometry(chunk: WorldChunk, lod: TerrainLOD): THREE.BufferGeometry {
  return geometryFromChunkData(createChunkData(chunk, lod));
}

interface CachedChunk {
  /** Displayed but outdated after an edit: kept until its replacement arrives (no hole). */
  stale?: boolean;
  /** Current blend towards the parent representation (0 own shape … 1 parent shape). */
  morph: number;
  morphTo: number;
  blend?: { material: THREE.MeshLambertMaterial; morph: { value: number } };
  /** Per side (−Z, +X, +Z, −X): 0 neighbour as fine or finer, −1 horizon, n > 0 neighbour
   * n LOD steps coarser (edge stitched onto its grid). Packed as a key to detect changes. */
  rise: number;
  /** Original heights of the edge vertices (before stitching), in rising-skirt order. */
  edgeBase?: Float32Array;
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
export interface TerrainWorkStats {lastMs:number;maxTileMs:number;totalMs:number;lastBuilt:number;ready:number;inFlight:number;maxReady:number}
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
  /** Blend duration between representations (s); 0 swaps instantly (as before doc 106). */
  morphSeconds?: number;
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
  const { material } = createTerrainMaterial();
  const morphSeconds = options.morphSeconds ?? TERRAIN_MORPH_SECONDS, blending = morphSeconds > 0;
  /** Tiles fading towards their parent before being replaced (coarser LOD) or removed (horizon). */
  const outgoing = new Map<string, { from: CachedChunk; to: CachedChunk | null }>();
  const columns = Math.ceil(config.width / config.chunkSize), rows = Math.ceil(config.length / config.chunkSize);
  let animatedAt = -1, riseVersion = -1;
  function setMorph(record: CachedChunk, value: number): void {
    record.morph = value;
    if (value > 0 || record.morphTo > 0) {
      if (!record.blend) { record.blend = createTerrainMaterial(); record.mesh.material = record.blend.material; }
      record.blend.morph.value = value;
    } else if (record.blend) {
      record.mesh.material = material; record.blend.material.dispose(); record.blend = undefined;
    }
  }
  function startBlend(record: CachedChunk, from: number, to: number): void { record.morphTo = to; setMorph(record, from); }
  function attach(record: CachedChunk): void { terrain.add(record.mesh); active.set(record.chunk.id, record); version++; }
  function finishOutgoing(id: string, o: { from: CachedChunk; to: CachedChunk | null }): void {
    outgoing.delete(id);
    o.from.mesh.removeFromParent(); startBlend(o.from, 0, 0);
    if (o.to) { attach(o.to); startBlend(o.to, 0, 0); }
    else { active.delete(id); version++; }
  }
  function animate(now: number): void {
    const dt = animatedAt < 0 ? 0 : Math.min(0.1, (now - animatedAt) / 1000); animatedAt = now;
    const step = blending ? dt / morphSeconds : 1;
    for (const record of active.values()) {
      if (record.morph === record.morphTo) continue;
      const next = record.morph < record.morphTo ? Math.min(record.morphTo, record.morph + step) : Math.max(record.morphTo, record.morph - step);
      setMorph(record, next);
    }
    for (const [id, o] of outgoing) if (o.from.morph >= 1) finishOutgoing(id, o);
  }
  /** Edge treatment from the displayed neighbours: sides bordering the horizon raise their
   * rising skirt to the horizon height; sides next to a coarser tile are stitched onto that
   * tile's grid (T-junction vertices placed on the coarse edge), so the joint is watertight. */
  function updateRises(): void {
    if (riseVersion === version) return;
    riseVersion = version;
    for (const record of active.values()) {
      const { column, row } = record.chunk, g = record.mesh.geometry, data = g.userData;
      if (data.upStart === undefined) continue;
      const sideState = (c: number, r: number) => {
        if (c < 0 || r < 0 || c >= columns || r >= rows) return 0;
        const n = active.get(`${c}:${r}`);
        return n ? Math.max(0, n.lod - record.lod) : 3;
      };
      const states = [sideState(column, row - 1), sideState(column + 1, row), sideState(column, row + 1), sideState(column - 1, row)];
      const key = states[0] | (states[1] << 2) | (states[2] << 4) | (states[3] << 6);
      if (key === record.rise) continue;
      record.rise = key;
      const position = g.getAttribute('position') as THREE.BufferAttribute, target = g.getAttribute('morphY') as THREE.BufferAttribute | undefined;
      const source = data.upSource as Uint32Array, horizon = data.upHorizon as Float32Array, edges = data.upEdges as number[];
      const base = record.edgeBase ??= Float32Array.from(source, (v) => position.getY(v));
      let k = 0;
      for (let side = 0; side < 4; side++) {
        const n = edges[side], state = states[side], ratio = state > 0 && state < 3 ? 2 ** state : 1;
        for (let i = 0; i < n; i++) {
          const a = Math.floor(i / ratio) * ratio, b = Math.min(n - 1, a + ratio), t = b > a ? (i - a) / (b - a) : 0;
          const y = base[k + a] + (base[k + b] - base[k + a]) * t;
          position.setY(source[k + i], y);
        }
        for (let i = 0; i < n; i++, k++) {
          const from = source[k], vertex = data.upStart + k, y = position.getY(from), raised = state === 3;
          position.setY(vertex, raised ? Math.max(y, horizon[k]) : y);
          if (target) target.setX(vertex, raised ? Math.max(target.getX(from), horizon[k]) : target.getX(from));
        }
      }
      // Corners are shared by two sides: the second side's stitch must not undo the first.
      position.clearUpdateRanges(); position.addUpdateRange(0, position.count * 3); position.needsUpdate = true;
      if (target) { target.clearUpdateRanges(); target.addUpdateRange(data.upStart, source.length); target.needsUpdate = true; }
    }
  }
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
  const work: TerrainWorkStats = { lastMs: 0, maxTileMs: 0, totalMs: 0, lastBuilt: 0, ready:0, inFlight:0, maxReady:0 };
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
  let hasDrawn = false;
  let lastX = Infinity,
    lastZ = Infinity,
    lastFocus: ViewFocus | null = null,
    dead = false;
  // Cache keys are looked up for every pending tile on every frame: build each string once.
  const keyCache = new Map<string, string[]>();
  const key = (chunk: WorldChunk, lod: TerrainLOD) => { let k = keyCache.get(chunk.id); if (!k) { k = [`${chunk.id}/0`, `${chunk.id}/1`, `${chunk.id}/2`]; keyCache.set(chunk.id, k); } return k[lod]; };
  const pool = options.workers ?? null;
  /** Tiles requested from the workers (key → job), at most MAX_IN_FLIGHT at once so a
   * replanned camera keeps priority over older requests. */
  const inFlight = new Map<string, { chunk: PlannedChunk; task: GeoTask<ChunkData> }>();
  const MAX_IN_FLIGHT = 6;
  const completed=new Map<string,ChunkData>(),failed=new Set<string>();
  let desiredKeys=new Set<string>();
  function dispatch(): void {
    for (const [k, job] of inFlight)
      if (!desiredKeys.has(k)) { job.task.cancel(); inFlight.delete(k);failed.delete(k); }
    // Results that arrived for a plan since changed are kept (bounded): a tile flipping back
    // (U-turn, LOD hysteresis) is integrated at once instead of being built again (SPEED-3).
    if (completed.size > 24) for (const k of completed.keys()) { if (completed.size <= 24) break; if (!desiredKeys.has(k)) completed.delete(k); }
    for (let i = 0; i < pending.length && inFlight.size < MAX_IN_FLIGHT; i++) {
      const chunk = pending[i], k = key(chunk, chunk.lod);
      // Already built (e.g. by a request issued before a replan): show it, never wait for it.
      const ready = cache.get(k);
      if (ready) { pending.splice(i--, 1); show(ready); continue; }
      if (inFlight.has(k)||failed.has(k)||completed.has(k)) continue;
      const task = pool!.run<ChunkData>({ kind: 'tile', chunk: { minX: chunk.minX, maxX: chunk.maxX, minZ: chunk.minZ, maxZ: chunk.maxZ }, lod: chunk.lod, horizon: horizonContext(config.chunkSize) }, i);
      inFlight.set(k, { chunk, task });
      task.promise.then(({ result, stale }) => {
        if (inFlight.get(k)?.task !== task) return;
        if (dead || stale || cache.has(k)) {inFlight.delete(k);return;}
        // Worker callbacks only enqueue data. Integration and GPU-buffer preparation happen
        // under the same update budget as synchronous tiles, never in a microtask burst.
        completed.set(k,result);work.ready=completed.size;work.maxReady=Math.max(work.maxReady,completed.size);
      }, () => {
        // Worker failure: the tile is built on the main thread by the synchronous path.
        if (inFlight.get(k)?.task === task) {inFlight.delete(k);failed.add(k);}
      });
    }
  }
  function release(record: CachedChunk): void {
    record.mesh.removeFromParent();
    record.mesh.geometry.dispose();
    record.blend?.material.dispose(); record.blend = undefined;
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
    const id = record.chunk.id, previous = active.get(id);
    record.used = ++sequence;
    const leaving = outgoing.get(id);
    if (leaving) {
      // Wanted again while fading out: blend back; otherwise only retarget the replacement.
      if (leaving.from === record) { outgoing.delete(id); record.morphTo = 0; }
      else leaving.to = record;
      return;
    }
    if (previous === record) return;
    // Coarser replacement of a displayed tile: first blend the tile into its parent shape
    // (exactly the replacement's shape), then swap (finishOutgoing). No visible jump.
    if (blending && previous && !previous.stale && record.lod === previous.lod + 1) {
      outgoing.set(id, { from: previous, to: record });
      previous.morphTo = 1;
      return;
    }
    if (previous?.stale) retireStale(previous);
    else previous?.mesh.removeFromParent();
    attach(record);
    // Finer replacement, or a coarsest tile taking over from the horizon: start from the
    // parent shape (what was displayed) and blend to the detailed shape.
    if (blending && ((previous && !previous.stale && previous.lod === record.lod + 1) || (!previous && record.lod === 2 && hasDrawn))) startBlend(record, 1, 0);
    else startBlend(record, 0, 0);
  }
  function apply(plan: PlannedChunk[]): void {
    desired = plan;desiredKeys=new Set(plan.map(c=>key(c,c.lod)));
    for(const k of failed)if(!desiredKeys.has(k))failed.delete(k);
    stats.replans++;
    const wanted = new Set(desired.map((chunk) => chunk.id));
    for (const [id, record] of active)
      if (!wanted.has(id)) {
        const leaving = outgoing.get(id);
        if (leaving) { leaving.to = null; continue; }
        // A coarsest tile leaving the plan blends into the horizon before uncovering it.
        if (blending && !record.stale && record.lod === 2 && hasDrawn) { outgoing.set(id, { from: record, to: null }); record.morphTo = 1; continue; }
        if (record.stale) retireStale(record);
        else { record.mesh.removeFromParent(); startBlend(record, 0, 0); }
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
    const mesh = new THREE.Mesh(geometryFromChunkData(data ?? createChunkData(chunk, chunk.lod, horizonContext(config.chunkSize))), material);
    mesh.matrixAutoUpdate = false;
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
      morph: 0,
      morphTo: 0,
      rise: 0,
    };
    cache.set(key(chunk, chunk.lod), record);
    bytes += record.bytes;
    stats.built++;
    if (desiredKeys.has(key(chunk,chunk.lod))) show(record);
    const spent = performance.now() - begin;
    work.maxTileMs = Math.max(work.maxTileMs, spent);
  }
  function evict(): void {
    if (cache.size <= maxResident && bytes <= maxBytes) return;
    const retired = [...cache.values()]
      .filter((record) => active.get(record.chunk.id) !== record && outgoing.get(record.chunk.id)?.to !== record)
      .sort((a, b) => a.used - b.used);
    for (const record of retired) {
      if (cache.size <= maxResident && bytes <= maxBytes) break;
      release(record);
    }
  }
  function updateStats(frustum?: THREE.Frustum): void {
    stats.active = active.size;
    stats.resident = cache.size;
    stats.pending = pending.length;work.ready=completed.size;work.inFlight=inFlight.size;
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
      while(pending.length&&built<maxBuilds&&(built===0||performance.now()-begin<budgetMs)){
        const index=pool?.available?pending.findIndex(c=>completed.has(key(c,c.lod))||failed.has(key(c,c.lod))):0;
        if(index<0)break;
        const chunk=pending.splice(index,1)[0],k=key(chunk,chunk.lod),data=completed.get(k);
        completed.delete(k);failed.delete(k);inFlight.get(k)?.task.cancel();inFlight.delete(k);
        build(chunk,data);built++;
      }
      if(pool?.available)dispatch();
      animate(performance.now());
      updateRises();
      hasDrawn = true;
      work.lastBuilt = built;
      work.lastMs = performance.now() - begin;
      work.totalMs += work.lastMs;
      evict();
      updateStats(frustum);
    },
    refresh(x, z, radius) {
      if (dead) return;
      for (const [id, o] of [...outgoing]) { setMorph(o.from, 1); finishOutgoing(id, o); }
      const touched = (chunk: WorldChunk) => chunk.maxX >= x - radius && chunk.minX <= x + radius && chunk.maxZ >= z - radius && chunk.minZ <= z + radius;
      for (const record of [...cache.values()]) {
        if (!touched(record.chunk)) continue;
        // With workers the displayed tile stays until its rebuilt version arrives.
        if (pool?.available && active.get(record.chunk.id) === record) {
          record.stale = true;
          cache.delete(key(record.chunk, record.lod));
        } else release(record);
      }
      for (const [k, job] of inFlight) if (touched(job.chunk)) { job.task.cancel(); inFlight.delete(k);completed.delete(k);failed.delete(k); }
      // Kept results of earlier plans are outdated by the edit too.
      for (const k of [...completed.keys()]) { const [column, row] = k.split('/')[0].split(':').map(Number), c = chunkBounds(config, column, row); if (!c || touched(c)) completed.delete(k); }
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
      for (const record of [...cache.values()]) { release(record); record.blend?.material.dispose(); }
      for (const record of active.values()) if (record.stale) retireStale(record);
      outgoing.clear();
      for (const job of inFlight.values()) job.task.cancel();
      inFlight.clear();completed.clear();failed.clear();
      material.dispose();
      pending = [];
      desired = [];
      terrain.removeFromParent();
      updateStats();
    },
  };
  return view;
}
