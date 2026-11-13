/** Pure tile geometry data (no Three.js): runs on the main thread or in a geography worker
 * with identical results. Normals and colours are already packed for the GPU. */
import type { TerrainLOD, WorldChunk } from './chunks.ts';
import { terrainHeight } from './terrain.ts';
import { surfaceColor } from './geography/surface.ts';
import { LinearColor } from './render/linear-color.ts';
import { indexArray, packColorArray, packNormalArray } from './render/pack.ts';

export interface ChunkData {
  positions: Float32Array;
  colors: Uint16Array;
  normals: Int16Array;
  index: Uint16Array | Uint32Array;
  surfaceVertices: number;
  minSurfaceY: number;
}
/** A surface plus downward skirts hides cracks where neighboring chunks use different LODs. */
export function createChunkData(
  chunk: Pick<WorldChunk, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  lod: TerrainLOD,
): ChunkData {
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
  const color = new LinearColor();
  // Per-vertex results kept for the skirts: a skirt vertex samples exactly the same (x, z) as
  // its edge vertex, so its height, colour and normal are copied instead of recomputed.
  const heights: number[] = [];
  function skirtVertex(index: number): number {
    positions.push(positions[index * 3], heights[index] - 12, positions[index * 3 + 2]);
    colors.push(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2]);
    normals.push(normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]);
    heights.push(heights[index]);
    return positions.length / 3 - 1;
  }
  function vertex(x: number, z: number, skirt = false): number {
    // Neighbour first: the generator memoizes the last point, reused by the colour classification.
    const east = terrainHeight(x + 2, z), h = terrainHeight(x, z);
    positions.push(x, h - (skirt ? 12 : 0), z);
    heights.push(h);
    const slope = Math.abs(east - h);
    surfaceColor(x, z, h, slope, color);
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
    const bottom = edge.map((index) => skirtVertex(index));
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
  let minSurfaceY = Infinity;
  const surfaceVertices = (cellsX + 1) * (cellsZ + 1);
  for (let i = 1; i < surfaceVertices * 3; i += 3)
    minSurfaceY = Math.min(minSurfaceY, positions[i]);
  return {
    positions: Float32Array.from(positions),
    colors: packColorArray(colors),
    normals: packNormalArray(normals),
    index: indexArray(indices),
    surfaceVertices,
    minSurfaceY,
  };
}
