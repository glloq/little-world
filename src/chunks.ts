/** Finite world chunk planning, independent of rendering and procedural geometry. */
export interface ChunkConfig {
  width: number;
  length: number;
  chunkSize: number;
  viewDistance: number;
}
export type TerrainLOD = 0 | 1 | 2;
export interface WorldChunk {
  id: string;
  column: number;
  row: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface PlannedChunk extends WorldChunk {
  distance: number;
  lod: TerrainLOD;
}
export function validateChunkConfig(config: ChunkConfig): void {
  for (const key of ['width', 'length', 'chunkSize', 'viewDistance'] as const) {
    if (!Number.isFinite(config[key]) || config[key] <= 0)
      throw new Error(`Invalid chunk configuration: ${key}`);
  }
}
export function chunkBounds(
  config: ChunkConfig,
  column: number,
  row: number,
): WorldChunk | null {
  if (
    !Number.isInteger(column) ||
    !Number.isInteger(row) ||
    column < 0 ||
    row < 0 ||
    column >= Math.ceil(config.width / config.chunkSize) ||
    row >= Math.ceil(config.length / config.chunkSize)
  )
    return null;
  const minX = -config.width / 2 + column * config.chunkSize;
  const minZ = -config.length / 2 + row * config.chunkSize;
  return {
    id: `${column}:${row}`,
    column,
    row,
    minX,
    minZ,
    maxX: Math.min(config.width / 2, minX + config.chunkSize),
    maxZ: Math.min(config.length / 2, minZ + config.chunkSize),
  };
}
export function distanceToChunk(
  chunk: WorldChunk,
  x: number,
  z: number,
): number {
  return Math.hypot(
    Math.max(chunk.minX - x, 0, x - chunk.maxX),
    Math.max(chunk.minZ - z, 0, z - chunk.maxZ),
  );
}
/** Enumerates only nearby cells, so planning cost does not grow with total map area. */
export function planChunks(
  config: ChunkConfig,
  x: number,
  z: number,
  previous?: ReadonlyMap<string, TerrainLOD>,
): PlannedChunk[] {
  validateChunkConfig(config);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
  const { width, length, chunkSize, viewDistance } = config;
  const minColumn = Math.max(
    0,
    Math.floor((x - viewDistance + width / 2) / chunkSize),
  );
  const maxColumn = Math.min(
    Math.ceil(width / chunkSize) - 1,
    Math.floor((x + viewDistance + width / 2) / chunkSize),
  );
  const minRow = Math.max(
    0,
    Math.floor((z - viewDistance + length / 2) / chunkSize),
  );
  const maxRow = Math.min(
    Math.ceil(length / chunkSize) - 1,
    Math.floor((z + viewDistance + length / 2) / chunkSize),
  );
  const planned: PlannedChunk[] = [];
  const near = viewDistance * 0.28,
    medium = viewDistance * 0.62;
  for (let row = minRow; row <= maxRow; row++)
    for (let column = minColumn; column <= maxColumn; column++) {
      const chunk = chunkBounds(config, column, row)!;
      const distance = distanceToChunk(chunk, x, z);
      if (distance > viewDistance) continue;
      let lod: TerrainLOD = distance < near ? 0 : distance < medium ? 1 : 2;
      // Hysteresis around LOD thresholds prevents repeated rebuild/switches while hovering on a boundary.
      const old = previous?.get(chunk.id);
      if (old !== undefined && old !== lod) {
        const threshold = Math.min(old, lod) === 0 ? near : medium;
        if (Math.abs(distance - threshold) < chunkSize * 0.15) lod = old;
      }
      planned.push({ ...chunk, distance, lod });
    }
  return planned.sort(
    (a, b) => a.distance - b.distance || a.row - b.row || a.column - b.column,
  );
}

/** Camera-aware interest (R-04): what the renderer should hold in detail this frame.
 * Separates the player (360° safety ring, prediction) from the real camera (frustum,
 * altitude, projected size). Purely visual: collisions and logic never depend on it. */
export interface ViewFocus {
  playerX: number;
  playerZ: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  /** Horizontal viewing direction (need not be normalised). */
  forwardX: number;
  forwardZ: number;
  /** Horizontal half field of view (radians). */
  halfFovH: number;
  /** Screen height / (2 tan(vertical fov / 2)); 493 px is the 640 px / 66° reference. */
  focalPx: number;
  velocityX: number;
  velocityZ: number;
  /** Ground height under the camera, for altitude-aware LOD. */
  groundY: number;
  /** Shared adaptive level from PresentationBudget (0 best … 2 lowest). */
  quality: number;
}
export type InterestReason = 'safety' | 'view' | 'ahead';
export interface ViewPlannedChunk extends PlannedChunk {
  reason: InterestReason;
  priority: number;
}
export const INTEREST = {
  /** Extra angle around the frustum kept for quick turns (rad). */
  turnMargin: 0.3,
  /** Movement prediction horizon (s) and its maximum shift (fraction of view distance). */
  lookahead: 2,
  maxAheadShift: 0.5,
  referenceFocal: 493,
} as const;
export function safetyRadius(config: ChunkConfig): number {
  return Math.max(48, config.chunkSize * 1.5);
}
/** LOD distances scale with projected size (focal length) and the shared quality level. */
export function lodDistances(config: ChunkConfig, focus: Pick<ViewFocus, 'focalPx' | 'quality'>) {
  const scale = Math.max(0.5, Math.min(2.5, focus.focalPx / INTEREST.referenceFocal)) / (1 + Math.max(0, focus.quality) * 0.35);
  return { near: config.viewDistance * 0.28 * scale, medium: config.viewDistance * 0.62 * scale };
}
export function planView(
  config: ChunkConfig,
  focus: ViewFocus,
  previous?: ReadonlyMap<string, TerrainLOD>,
): ViewPlannedChunk[] {
  validateChunkConfig(config);
  const values = Object.values(focus);
  if (!values.every((v) => Number.isFinite(v))) return [];
  const { width, length, chunkSize, viewDistance } = config;
  const safety = safetyRadius(config);
  const shift = Math.min(1, (viewDistance * INTEREST.maxAheadShift) / (Math.hypot(focus.velocityX, focus.velocityZ) * INTEREST.lookahead || 1));
  const aheadX = focus.playerX + focus.velocityX * INTEREST.lookahead * shift,
    aheadZ = focus.playerZ + focus.velocityZ * INTEREST.lookahead * shift;
  const moving = Math.hypot(focus.velocityX, focus.velocityZ) > 1;
  const forward = Math.hypot(focus.forwardX, focus.forwardZ) || 1,
    fx = focus.forwardX / forward,
    fz = focus.forwardZ / forward;
  const altitude = Math.max(0, focus.cameraY - focus.groundY);
  const { near, medium } = lodDistances(config, focus);
  const reach = viewDistance + safety + Math.hypot(focus.cameraX - focus.playerX, focus.cameraZ - focus.playerZ);
  const cx = Math.min(focus.cameraX, focus.playerX, aheadX) - reach,
    cxMax = Math.max(focus.cameraX, focus.playerX, aheadX) + reach,
    cz = Math.min(focus.cameraZ, focus.playerZ, aheadZ) - reach,
    czMax = Math.max(focus.cameraZ, focus.playerZ, aheadZ) + reach;
  const minColumn = Math.max(0, Math.floor((cx + width / 2) / chunkSize)),
    maxColumn = Math.min(Math.ceil(width / chunkSize) - 1, Math.floor((cxMax + width / 2) / chunkSize)),
    minRow = Math.max(0, Math.floor((cz + length / 2) / chunkSize)),
    maxRow = Math.min(Math.ceil(length / chunkSize) - 1, Math.floor((czMax + length / 2) / chunkSize));
  const planned: ViewPlannedChunk[] = [];
  for (let row = minRow; row <= maxRow; row++)
    for (let column = minColumn; column <= maxColumn; column++) {
      const chunk = chunkBounds(config, column, row)!;
      const toCamera = distanceToChunk(chunk, focus.cameraX, focus.cameraZ);
      let reason: InterestReason | null = null;
      if (distanceToChunk(chunk, focus.playerX, focus.playerZ) <= safety) reason = 'safety';
      else if (toCamera <= viewDistance) {
        const vx = (chunk.minX + chunk.maxX) / 2 - focus.cameraX,
          vz = (chunk.minZ + chunk.maxZ) / 2 - focus.cameraZ,
          d = Math.hypot(vx, vz),
          radius = Math.hypot(chunk.maxX - chunk.minX, chunk.maxZ - chunk.minZ) / 2;
        const angle = Math.acos(Math.max(-1, Math.min(1, (vx * fx + vz * fz) / (d || 1))));
        if (d <= radius || angle - Math.asin(Math.min(1, radius / d)) <= focus.halfFovH + INTEREST.turnMargin) reason = 'view';
      }
      if (!reason && moving && distanceToChunk(chunk, aheadX, aheadZ) <= safety * 1.5) reason = 'ahead';
      if (!reason) continue;
      const distance = Math.hypot(toCamera, altitude);
      let lod: TerrainLOD = distance < near ? 0 : distance < medium ? 1 : 2;
      const old = previous?.get(chunk.id);
      if (old !== undefined && old !== lod) {
        const threshold = Math.min(old, lod) === 0 ? near : medium;
        if (Math.abs(distance - threshold) < chunkSize * 0.15) lod = old;
      }
      const rank = reason === 'safety' ? 0 : reason === 'view' ? 1 : 2;
      planned.push({ ...chunk, distance, lod, reason, priority: rank * 1e6 + distance });
    }
  return planned.sort((a, b) => a.priority - b.priority || a.row - b.row || a.column - b.column);
}
/** Replan when the view changes meaningfully, not every frame (rotation, motion, altitude, teleport). */
export function viewChanged(previous: ViewFocus | null, next: ViewFocus, chunkSize: number): boolean {
  if (!previous) return true;
  if (Math.hypot(next.playerX - previous.playerX, next.playerZ - previous.playerZ) > chunkSize / 8) return true;
  if (Math.hypot(next.cameraX - previous.cameraX, next.cameraZ - previous.cameraZ) > chunkSize / 8) return true;
  if (Math.abs(next.cameraY - previous.cameraY) > 12) return true;
  if (next.quality !== previous.quality || Math.abs(next.focalPx - previous.focalPx) > 20) return true;
  const a = Math.atan2(previous.forwardX, previous.forwardZ),
    b = Math.atan2(next.forwardX, next.forwardZ);
  return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) > 0.17;
}
