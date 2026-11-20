/** Pure tile geometry data (no Three.js): runs on the main thread or in a geography worker
 * with identical results. Normals and colours are already packed for the GPU. */
import type { TerrainLOD, WorldChunk } from './chunks.ts';
import { terrainHeight, isLegacyTerrain, getTerrainConfig } from './terrain.ts';
import { createHorizonSampler, horizonGrid, type HorizonVertex } from './horizon-data.ts';
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
  /** Morph targets: the shape of the next coarser representation at every vertex (LOD n+1
   * grid for LOD 0/1, the horizon surface for LOD 2). A tile blends to/from it over a short
   * time when its representation changes, instead of jumping (doc 106, SEAM-3). */
  morphY?: Float32Array;
  morphColors?: Uint16Array;
  morphNormals?: Int16Array;
  /** Rising skirts: one vertex per edge vertex (edges in order −Z, +X, +Z, −X), collapsed
   * onto the edge unless that side borders the horizon; then raised to the horizon height
   * (`upHorizon`) to close the slit between a detailed tile and the coarser horizon. */
  upStart?: number;
  upSource?: Uint32Array;
  upHorizon?: Float32Array;
  /** Edge vertex count per side (−Z, +X, +Z, −X). */
  upEdges?: number[];
  /** Depth of the downward skirts, from the largest gap any neighbour representation can show. */
  skirtDepth?: number;
}
export interface HorizonContext { width: number; length: number; seaLevel: number; spacing: number }
/** Horizon lattice of the active project for a given tile size (as the horizon view builds it). */
export function horizonContext(tileSize = 64): HorizonContext {
  const c = getTerrainConfig();
  return { width: c.width, length: c.length, seaLevel: c.seaLevel, spacing: horizonGrid(c.width, c.length, tileSize).spacing };
}
/** A surface plus downward skirts hides cracks where neighboring chunks use different LODs. */
export function createChunkData(
  chunk: Pick<WorldChunk, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  lod: TerrainLOD,
  horizon: HorizonContext = horizonContext(),
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
  const color = new LinearColor(),surfaceNormal={x:0,y:1,z:0};
  // Per-vertex results kept for the skirts: a skirt vertex samples exactly the same (x, z) as
  // its edge vertex, so its height, colour and normal are copied instead of recomputed.
  const heights: number[] = [];
  let skirtDepth = 12;
  function skirtVertex(index: number): number {
    positions.push(positions[index * 3], heights[index] - skirtDepth, positions[index * 3 + 2]);
    colors.push(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2]);
    normals.push(normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]);
    heights.push(heights[index]);
    return positions.length / 3 - 1;
  }
  function vertex(x: number, z: number, skirt = false): number {
    // Neighbour first: the generator memoizes the last point, reused by the colour classification.
    const legacy=isLegacyTerrain(),east=legacy?terrainHeight(x+2,z):0,h=terrainHeight(x,z);
    positions.push(x, h - (skirt ? 12 : 0), z);
    heights.push(h);
    const slope = Math.abs(east - h);
    surfaceColor(x, z, h, slope, color,surfaceNormal);
    if(legacy)color.multiplyScalar(
      0.92 +
        0.07 * Math.sin(x * 0.275 + z * 0.165) +
        0.035 * Math.sin(x + z * 0.7),
    );
    colors.push(color.r, color.g, color.b);
    // Canonical surface normals are shared with the horizon; the valley keeps its old shading.
    if(legacy){
      const nx=terrainHeight(x-.25,z)-terrainHeight(x+.25,z),nz=terrainHeight(x,z-.25)-terrainHeight(x,z+.25),magnitude=Math.hypot(nx,.5,nz);
      normals.push(nx/magnitude,.5/magnitude,nz/magnitude);
    }else normals.push(surfaceNormal.x,surfaceNormal.y,surfaceNormal.z);
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
  const surfaceVertices = (cellsX + 1) * (cellsZ + 1);
  // --- Morph targets of the surface (floats, packed at the end). ---
  const morphY = new Float32Array(surfaceVertices), morphColor = new Float32Array(surfaceVertices * 3), morphNormal = new Float32Array(surfaceVertices * 3);
  const sampleHorizon = createHorizonSampler({ width: horizon.width, length: horizon.length, seaLevel: horizon.seaLevel }, horizon.spacing);
  const sample: HorizonVertex = { y: 0, r: 0, g: 0, b: 0, nx: 0, ny: 1, nz: 0 };
  const at = (ix: number, iz: number) => iz * (cellsX + 1) + ix;
  const parentOf = (i: number, a: number, b: number) => {
    morphY[i] = (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2;
    for (let k = 0; k < 3; k++) { morphColor[i * 3 + k] = (colors[a * 3 + k] + colors[b * 3 + k]) / 2; morphNormal[i * 3 + k] = (normals[a * 3 + k] + normals[b * 3 + k]) / 2; }
  };
  for (let iz = 0; iz <= cellsZ; iz++)
    for (let ix = 0; ix <= cellsX; ix++) {
      const i = at(ix, iz);
      if (lod === 2 || cellsX < 2 || cellsZ < 2) {
        // Coarsest tile: its parent is the horizon (sea-clamped, 2 triangles per cell).
        sampleHorizon(positions[i * 3], positions[i * 3 + 2], sample);
        morphY[i] = sample.y; morphColor[i * 3] = sample.r; morphColor[i * 3 + 1] = sample.g; morphColor[i * 3 + 2] = sample.b;
        morphNormal[i * 3] = sample.nx; morphNormal[i * 3 + 1] = sample.ny; morphNormal[i * 3 + 2] = sample.nz;
      } else if (ix % 2 === 0 && iz % 2 === 0) parentOf(i, i, i);
      else if (iz % 2 === 0) parentOf(i, at(ix - 1, iz), at(ix + 1, iz));
      else if (ix % 2 === 0) parentOf(i, at(ix, iz - 1), at(ix, iz + 1));
      // Cell centre: on the coarse diagonal from (ix+1, iz-1) to (ix-1, iz+1).
      else parentOf(i, at(ix + 1, iz - 1), at(ix - 1, iz + 1));
    }
  // --- Skirt depth: largest gap between any two representations a neighbour may show on a
  // shared edge (2 m truth, 4 m / 8 m grids, horizon), sampled at the finest grid. ---
  const fine = (length: number) => 2 ** Math.max(0, Math.ceil(Math.log2(length / 2.5)));
  const sides: [number, number, number, number][] = [
    [chunk.minX, chunk.minZ, chunk.maxX, chunk.minZ], [chunk.maxX, chunk.minZ, chunk.maxX, chunk.maxZ],
    [chunk.minX, chunk.maxZ, chunk.maxX, chunk.maxZ], [chunk.minX, chunk.minZ, chunk.minX, chunk.maxZ],
  ];
  let spread = 0;
  for (const [x0, z0, x1, z1] of sides) {
    const n = fine(Math.hypot(x1 - x0, z1 - z0)), h: number[] = [];
    for (let k = 0; k <= n; k++) h.push(terrainHeight(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n));
    const grid = (k: number, step: number) => { if (step > n) step = n; const a = Math.floor(k / step) * step, b = Math.min(n, a + step), t = b > a ? (k - a) / (b - a) : 0; return h[a] + (h[b] - h[a]) * t; };
    for (let k = 0; k <= n; k++) {
      const horizonY = sampleHorizon(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, sample).y;
      const values = [h[k], grid(k, 2), grid(k, 4), horizonY];
      spread = Math.max(spread, Math.max(...values) - Math.min(...values));
    }
  }
  skirtDepth = Math.max(12, Math.ceil(spread + 1));
  // Surface morph targets extended to skirt vertices (same target, moved down by the skirt).
  const extraY: number[] = [], extraColor: number[] = [], extraNormal: number[] = [];
  const copyTarget = (source: number, dy: number) => {
    extraY.push(morphY[source] + dy);
    extraColor.push(morphColor[source * 3], morphColor[source * 3 + 1], morphColor[source * 3 + 2]);
    extraNormal.push(morphNormal[source * 3], morphNormal[source * 3 + 1], morphNormal[source * 3 + 2]);
  };
  for (const edge of edges) {
    const bottom = edge.map((index) => { copyTarget(index, -skirtDepth); return skirtVertex(index); });
    // Front faces point outwards: seen through a sub-pixel T-junction crack from the
    // neighbouring tile, a skirt is lit with the edge normal like the ground around it
    // (a back face would be shaded with the inverted normal: a dark dotted seam).
    for (let i = 0; i < edge.length - 1; i++)
      indices.push(
        edge[i],
        edge[i + 1],
        bottom[i],
        edge[i + 1],
        bottom[i + 1],
        bottom[i],
      );
  }
  // Rising skirts, collapsed on their edge until the view raises them (horizon side only).
  const upStart = positions.length / 3, upSource: number[] = [], upHorizon: number[] = [], upEdges: number[] = [];
  for (const edge of edges) {
    upEdges.push(edge.length);
    const top = edge.map((index) => {
      copyTarget(index, 0); upSource.push(index);
      upHorizon.push(sampleHorizon(positions[index * 3], positions[index * 3 + 2], sample).y);
      positions.push(positions[index * 3], heights[index], positions[index * 3 + 2]);
      colors.push(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2]);
      normals.push(normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]);
      heights.push(heights[index]);
      return positions.length / 3 - 1;
    });
    for (let i = 0; i < edge.length - 1; i++)
      indices.push(edge[i], edge[i + 1], top[i], edge[i + 1], top[i + 1], top[i]);
  }
  let minSurfaceY = Infinity;
  for (let i = 1; i < surfaceVertices * 3; i += 3)
    minSurfaceY = Math.min(minSurfaceY, positions[i]);
  const allMorphY = new Float32Array(positions.length / 3);
  allMorphY.set(morphY);allMorphY.set(extraY, surfaceVertices);
  const allMorphColor = new Float32Array(positions.length);allMorphColor.set(morphColor);allMorphColor.set(extraColor, surfaceVertices * 3);
  const allMorphNormal = new Float32Array(positions.length);allMorphNormal.set(morphNormal);allMorphNormal.set(extraNormal, surfaceVertices * 3);
  for (let i = 0; i < allMorphNormal.length; i += 3) {
    const m = Math.hypot(allMorphNormal[i], allMorphNormal[i + 1], allMorphNormal[i + 2]) || 1;
    allMorphNormal[i] /= m; allMorphNormal[i + 1] /= m; allMorphNormal[i + 2] /= m;
  }
  return {
    positions: Float32Array.from(positions),
    colors: packColorArray(colors),
    normals: packNormalArray(normals),
    index: indexArray(indices),
    surfaceVertices,
    minSurfaceY,
    morphY: allMorphY,
    morphColors: packColorArray(allMorphColor),
    morphNormals: packNormalArray(allMorphNormal),
    upStart,
    upSource: Uint32Array.from(upSource),
    upHorizon: Float32Array.from(upHorizon),
    upEdges,
    skirtDepth,
  };
}
