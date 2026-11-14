/** Grass tufts (doc 18): short and tall grass as a purely visual, LOW-RESOURCE local layer.
 * - Layer 1 (ground colour) is the terrain itself: nothing here.
 * - Layer 2: tufts of 3 crossed blades (3 triangles), ONE InstancedMesh for every tuft around the
 *   focus (1 draw call), opaque, no shadow cast or received.
 * - Layer 3: wind sway and bending around the player in the VERTEX SHADER only (uniforms): no
 *   per-tuft CPU animation, no matrix update per frame, no physics.
 * Tufts are generated per 16 m cell from seed + cell + the Geography classification (grass share
 * of the habitat, biome colour), sampled on a 4 m grid: deterministic, no per-tuft id in any source.
 * The instance buffer is rewritten only when the set of cells changes; tufts shrink to nothing at
 * the edge of the radius (no visible border, no fog). Profiles follow the shared budget level
 * (doc 22): dense / balanced / ultra-economy / groundOnly (off). Never touches gameplay. */
import * as THREE from 'three';

export const GRASS_CELL_M = 16;
/** Profiles (benchmark knobs, doc 18 §profiles): radius (m), tufts per m² at full grass share. */
export const GRASS_PROFILES = {
  dense: { radius: 42, density: 1.1 },
  balanced: { radius: 32, density: .8 },
  ultra: { radius: 20, density: .5 },
  groundOnly: { radius: 0, density: 0 },
} as const;
export type GrassProfile = keyof typeof GRASS_PROFILES;
/** Budget level (0 full … 3 lowest) → profile; `economy` quality starts one step lower. */
export function grassProfileFor(level: number, economy = false): GrassProfile {
  const l = Math.max(0, Math.min(3, Math.round(level) + (economy ? 1 : 0)));
  return (['dense', 'balanced', 'ultra', 'groundOnly'] as const)[l];
}
/** What the grass needs to know about a point: grass share 0…1, tall-grass share 0…1, colour. */
export interface GrassSample { share: number; tall: number; color: number }
export interface GrassStats { profile: GrassProfile; cells: number; tufts: number; triangles: number; calls: number; buildMs: number; pending: number }

/** Deterministic hash → [0, 1). */
function rnd(seed: number, a: number, b: number, c = 0) {
  let h = (seed ^ Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** One tuft: 3 blades (1 triangle each) at 0°, 60°, 120°, base on the ground, tip at y = 1.
 * Normals point up (soft, even lighting of thin blades); colour darker at the root. */
export function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a), w = .07, lean = (k - 1) * .12;
    pos.push(-c * w, 0, -s * w, c * w, 0, s * w, -s * lean, 1, c * lean);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    col.push(.62, .66, .55, .62, .66, .55, 1.08, 1.06, .96);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
/** A generated cell: instance matrices (16 floats per tuft, column-major) and colours (3), ready to
 * copy into the shared buffers (a rebuild is a few typed-array copies, no per-tuft maths). */
interface Cell { cx: number; cz: number; count: number; matrices: Float32Array; colors: Float32Array }

export function createGrass(parent: THREE.Object3D, seed: number, sampler: (x: number, z: number) => GrassSample | null, height: (x: number, z: number) => number, capacity = 12000) {
  const geometry = tuftGeometry();
  const uniforms = { uTime: { value: 0 }, uWind: { value: .35 }, uFocus: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uPlayer: { value: new THREE.Vector3(1e6, 0, 1e6) } };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'uniform float uTime; uniform float uWind; uniform vec3 uFocus; uniform float uRadius; uniform vec3 uPlayer;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vec3 rootW = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      float hf = clamp( position.y, 0.0, 1.0 ); hf *= hf;
      // Wind: slow gusts travelling across the field (world-stable phase).
      float gust = sin( uTime * 1.7 + rootW.x * .21 + rootW.z * .17 ) + .5 * sin( uTime * 3.1 + rootW.x * .53 - rootW.z * .37 );
      mvPosition.xz += vec2( .8, .45 ) * gust * uWind * .22 * hf;
      // Bending away from the player (pushed down and outwards within ~1.3 m).
      vec2 away = rootW.xz - uPlayer.xz; float d = length( away );
      float push = ( 1.0 - smoothstep( .3, 1.3, d ) ) * hf;
      mvPosition.xz += ( d > 1e-3 ? away / d : vec2( 0.0 ) ) * push * .55;
      mvPosition.y -= push * .45 * ( mvPosition.y - rootW.y );
      // Edge of the grass radius: tufts shrink to their root (no visible border).
      float k = 1.0 - smoothstep( uRadius * .72, uRadius, distance( rootW.xz, uFocus.xz ) );
      mvPosition.xyz = rootW + ( mvPosition.xyz - rootW ) * k;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
    // Thin double-sided blades: both faces lit with the upward normal (no dark back faces).
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
  };
  material.customProgramCacheKey = () => 'little-world-grass-v2';
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'Grass'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  parent.add(mesh);
  const cells = new Map<string, Cell>();
  let profile: GrassProfile = 'balanced', queue: [number, number][] = [], focusKey = '', dirty = false, disposed = false;
  const stats: GrassStats = { profile, cells: 0, tufts: 0, triangles: 0, calls: 0, buildMs: 0, pending: 0 };
  const radius = () => GRASS_PROFILES[profile].radius;
  function generate(cx: number, cz: number): Cell {
    const mats: number[] = [], cols: number[] = [], p = GRASS_PROFILES[profile], patch = 4;
    for (let pz = 0; pz < GRASS_CELL_M / patch; pz++) for (let px = 0; px < GRASS_CELL_M / patch; px++) {
      const sx = cx * GRASS_CELL_M + (px + .5) * patch, sz = cz * GRASS_CELL_M + (pz + .5) * patch, s = sampler(sx, sz);
      if (!s || s.share <= .02) continue;
      const n = Math.round(patch * patch * p.density * s.share * (.8 + .4 * rnd(seed, cx * 8 + px, cz * 8 + pz, 7)));
      const base = new THREE.Color(s.color);
      for (let i = 0; i < n; i++) {
        const r0 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4), r1 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4 + 1), r2 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4 + 2), r3 = rnd(seed, cx * 8 + px, cz * 8 + pz, i * 4 + 3);
        const x = sx + (r0 - .5) * patch, z = sz + (r1 - .5) * patch, tall = r2 < s.tall;
        // Heights against the hamster (≈ 0.9 m): short grass to the ankle, tall grass to the chest.
        const h = tall ? .35 + .35 * r3 : .15 + .15 * r3, w = tall ? .9 + .4 * r3 : 1.2 + .5 * r3, tint = .86 + .24 * r2;
        const yaw = r3 * 6.283, c = Math.cos(yaw), s2 = Math.sin(yaw);
        // Y rotation × scale (w, h, w) + translation, column-major (THREE.Matrix4.elements order).
        mats.push(c * w, 0, -s2 * w, 0, 0, h, 0, 0, s2 * w, 0, c * w, 0, x, height(x, z) - .03, z, 1);
        cols.push(base.r * tint, base.g * tint, base.b * tint * .95);
      }
    }
    return { cx, cz, count: cols.length / 3, matrices: new Float32Array(mats), colors: new Float32Array(cols) };
  }
  function plan(fx: number, fz: number) {
    const r = radius(), cx = Math.floor(fx / GRASS_CELL_M), cz = Math.floor(fz / GRASS_CELL_M), n = Math.ceil(r / GRASS_CELL_M), need: [number, number, number][] = [], wanted = new Set<string>();
    if (r > 0) for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      const x = cx + dx, z = cz + dz, ex = Math.max(x * GRASS_CELL_M - fx, 0, fx - (x + 1) * GRASS_CELL_M), ez = Math.max(z * GRASS_CELL_M - fz, 0, fz - (z + 1) * GRASS_CELL_M), d = Math.hypot(ex, ez);
      if (d > r) continue; const key = x + ':' + z; wanted.add(key); if (!cells.has(key)) need.push([x, z, d]);
    }
    for (const key of [...cells.keys()]) if (!wanted.has(key)) { cells.delete(key); dirty = true; }
    queue = need.sort((a, b) => a[2] - b[2]).map(([x, z]) => [x, z]);
  }
  function rebuild() {
    let n = 0;const matrices = mesh.instanceMatrix.array as Float32Array, colors = mesh.instanceColor!.array as Float32Array;
    for (const c of cells.values()) {
      const k = Math.min(c.count, capacity - n); if (k <= 0) break;
      matrices.set(k === c.count ? c.matrices : c.matrices.subarray(0, k * 16), n * 16); colors.set(k === c.count ? c.colors : c.colors.subarray(0, k * 3), n * 3); n += k;
    }
    mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) { mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true; }
    stats.tufts = n; stats.triangles = n * 3; stats.calls = n ? 1 : 0; stats.cells = cells.size;
  }
  return {
    stats, mesh,
    setProfile(next: GrassProfile) { if (next === profile) return; profile = next; stats.profile = next; cells.clear(); focusKey = ''; dirty = true; },
    setWind(strength: number) { uniforms.uWind.value = Math.max(0, Math.min(1.5, strength)); },
    /** Per frame: uniforms (time, focus, player) + a time-budgeted generation of missing cells. */
    update(dt: number, focus: { x: number; y?: number; z: number }, budgetMs = 1) {
      if (disposed) return;
      uniforms.uTime.value += dt; uniforms.uFocus.value.set(focus.x, focus.y ?? 0, focus.z); uniforms.uPlayer.value.set(focus.x, focus.y ?? 0, focus.z); uniforms.uRadius.value = Math.max(1, radius());
      const key = Math.floor(focus.x / GRASS_CELL_M) + ':' + Math.floor(focus.z / GRASS_CELL_M);
      if (key !== focusKey) { focusKey = key; plan(focus.x, focus.z); }
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < budgetMs) { const [x, z] = queue.shift()!; cells.set(x + ':' + z, generate(x, z)); dirty = true; }
      stats.pending = queue.length;
      if (dirty && (!queue.length || performance.now() - t0 < budgetMs)) { dirty = false; const t1 = performance.now(); rebuild(); stats.buildMs = performance.now() - t1; }
    },
    /** Authored change (relief, biotopes): regenerate the cells around it. */
    refresh(x: number, z: number, r: number) { for (const c of [...cells.values()]) if (Math.hypot((c.cx + .5) * GRASS_CELL_M - x, (c.cz + .5) * GRASS_CELL_M - z) < r + GRASS_CELL_M) cells.delete(c.cx + ':' + c.cz); focusKey = ''; dirty = true; },
    dispose() { if (disposed) return; disposed = true; mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); cells.clear(); },
  };
}
export type Grass = ReturnType<typeof createGrass>;
