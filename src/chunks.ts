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
