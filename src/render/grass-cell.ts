/** Grass cell generation (doc 18), pure: no Three.js, no DOM. Runs on the main thread or in a
 * geography worker with identical results (LinearColor applies Three.js' exact sRGB → linear
 * conversion of Color.setHex). Extracted from render/grass.ts for OPT-4 (doc 82 step 7). */
import {LinearColor} from './linear-color.ts';

export const GRASS_CELL_M = 16;
export interface GrassSample { share: number; tall: number; color: number }
/** Per-instance silhouette variants (height, width, depth factors). */
const VARIANT_HEIGHT = [.78, 1, 1.24], VARIANT_WIDTH = [1.2, 1, .78], VARIANT_DEPTH = [.65, 1, 1.18];
/** Deterministic hash → [0, 1). */
export function rnd(seed: number, a: number, b: number, c = 0) {
  let h = (seed ^ Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export interface GrassCellData { cx: number; cz: number; count: number; matrices: Float32Array; colors: Float32Array }
// Generation scratch: typed arrays reused between cells, one exact-size copy per cell.
let scratchM = new Float32Array(1024 * 16), scratchC = new Float32Array(1024 * 3);
const base = new LinearColor();
/** Instance matrices (16 floats per tuft, column-major) and colours (3) of one 16 m cell. */
export function generateGrassCell(seed: number, cx: number, cz: number, density: number,
  sampler: (x: number, z: number) => GrassSample | null, height: (x: number, z: number) => number, exactPlacement: boolean): GrassCellData {
  let k = 0;
  const patch = 4;
  for (let pz = 0; pz < GRASS_CELL_M / patch; pz++) for (let px = 0; px < GRASS_CELL_M / patch; px++) {
    const sx = cx * GRASS_CELL_M + (px + .5) * patch, sz = cz * GRASS_CELL_M + (pz + .5) * patch, s = sampler(sx, sz);
    if (!s || s.share <= .02) continue;
    const n = Math.round(patch * patch * density * s.share * (.8 + .4 * rnd(seed, cx * 8 + px, cz * 8 + pz, 7)));
    base.setHex(s.color);
    for (let i = 0; i < n; i++) {
      const r0 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4), r1 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4 + 1), r2 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4 + 2), r3 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4 + 3);
      const x = sx + (r0 - .5) * patch, z = sz + (r1 - .5) * patch;
      // Exact final point check prevents the 4 m sampling grid from spilling over exclusions.
      const final = exactPlacement ? sampler(x, z) : s; if (!final || final.share <= .02) continue;
      const tall = r2 < final.tall; if (exactPlacement) base.setHex(final.color);
      // Heights against the hamster (≈ 0.9 m): short grass to the ankle, tall grass to the chest;
      // three silhouettes from deterministic per-instance anisotropy (one geometry, one draw call).
      const variant = Math.floor(rnd(seed ^ 0x673f, cx * 8 + px, cz * 8 + pz, i) * 3);
      const h = (tall ? .35 + .35 * r3 : .15 + .15 * r3) * VARIANT_HEIGHT[variant];
      const w = (tall ? .9 + .4 * r3 : 1.2 + .5 * r3) * VARIANT_WIDTH[variant];
      const tint = .82 + .3 * r2;
      const yaw = r3 * 6.283, c = Math.cos(yaw), s2 = Math.sin(yaw);
      // Y rotation × scale (w, h, w) + translation, column-major (THREE.Matrix4.elements order).
      const depth = w * VARIANT_DEPTH[variant];
      if (k * 16 >= scratchM.length) { const m = new Float32Array(scratchM.length * 2); m.set(scratchM); scratchM = m; const c3 = new Float32Array(scratchC.length * 2); c3.set(scratchC); scratchC = c3; }
      const o = k * 16, q = k * 3, m = scratchM;
      m[o] = c * w; m[o + 1] = 0; m[o + 2] = -s2 * w; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = h; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = s2 * depth; m[o + 9] = 0; m[o + 10] = c * depth; m[o + 11] = 0; m[o + 12] = x; m[o + 13] = height(x, z) - .03; m[o + 14] = z; m[o + 15] = 1;
      scratchC[q] = base.r * tint; scratchC[q + 1] = base.g * tint; scratchC[q + 2] = base.b * tint * .95;
      k++;
    }
  }
  return { cx, cz, count: k, matrices: scratchM.slice(0, k * 16), colors: scratchC.slice(0, k * 3) };
}
