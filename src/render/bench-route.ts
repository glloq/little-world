/** OPT-0 — reproducible benchmark routes (metrics mode only, `?benchRoute=<name>`).
 * A route is a pure function of the fixed simulation tick: the same tick gives the same
 * pose on every run and every machine, whatever the presentation rate. It replaces the
 * player simulation while active (the player is "carried"), so the world, streaming,
 * dressing and renderer see exactly the same trajectory between A/B runs. Never loaded
 * as gameplay: it only drives position/velocity/camera for measurements. */
export interface BenchPoint { x: number; z: number }
export interface BenchPathRoute {
  kind: 'path';
  /** Player presentation mode while travelling. */
  mode: 'ground' | 'glide' | 'boat';
  /** m/s along the curve. */
  speed: number;
  points: BenchPoint[];
  /** Ground: on terrain. Glide: smoothed terrain-following clearance (m). */
  clearance?: number;
  pitch: number;
  dist: number;
  /** Closed loop (wraps) or out-and-back (ping-pong). */
  loop: boolean;
}
export interface BenchStation { x: number; z: number; yaw: number; ticks: number }
export interface BenchStationsRoute { kind: 'stations'; stations: BenchStation[]; pitch: number; dist: number }
export type BenchRoute = BenchPathRoute | BenchStationsRoute;
export interface BenchPose {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number; dist: number;
  mode: 'ground' | 'glide' | 'boat';
  /** Index of the current station / lap, for per-phase statistics. */
  phase: number;
}

/** Island 4 × 3 km (maps/island). Coordinates chosen from tools/world-views.json views. */
export const BENCH_ROUTES: Record<string, BenchRoute> = {
  /** Dense western forest (−1800…−1100, −400…−100) at running speed, closed loop. */
  forest: { kind: 'path', mode: 'ground', speed: 6, loop: true, pitch: .2, dist: 8,
    points: [{ x: -1500, z: -250 }, { x: -1380, z: -300 }, { x: -1350, z: -200 }, { x: -1450, z: -130 }, { x: -1600, z: -150 }, { x: -1660, z: -260 }, { x: -1600, z: -350 }] },
  /** Castle town streets (around −140, 650) at running speed, closed loop. */
  village: { kind: 'path', mode: 'ground', speed: 6, loop: true, pitch: .3, dist: 10,
    points: [{ x: -140, z: 590 }, { x: -80, z: 620 }, { x: -75, z: 690 }, { x: -140, z: 725 }, { x: -200, z: 690 }, { x: -200, z: 620 }] },
  /** 120 km/h glide across forest, town, meadows and the volcano flank; turns and a hairpin. */
  flight: { kind: 'path', mode: 'glide', speed: 33.3, loop: true, clearance: 60, pitch: .32, dist: 14,
    points: [{ x: -1500, z: -250 }, { x: -800, z: 150 }, { x: -150, z: 650 }, { x: 500, z: 300 }, { x: 700, z: -350 },
      { x: 450, z: -900 }, { x: 200, z: -700 }, { x: -500, z: -900 }, { x: -1200, z: -700 }] },
  /** Boat along the southern coast, out and back. */
  boat: { kind: 'path', mode: 'boat', speed: 8, loop: false, pitch: .25, dist: 14,
    points: [{ x: -1100, z: 1430 }, { x: -600, z: 1440 }, { x: -100, z: 1445 }, { x: 400, z: 1440 }, { x: 800, z: 1430 }] },
  /** Arrival in cold zones: far teleports (forest, town, volcano, south coast), 8 s each (240 ticks). */
  zones: { kind: 'stations', pitch: .3, dist: 10, stations: [
    { x: -1500, z: -250, yaw: 1.57, ticks: 240 }, { x: -140, z: 650, yaw: 3.14, ticks: 240 },
    { x: 900, z: -600, yaw: 0, ticks: 240 }, { x: 300, z: 1300, yaw: 3.14, ticks: 240 }] },
};

interface Curve { xs: Float64Array; zs: Float64Array; ys: Float64Array; length: number; step: number }
const SAMPLE_M = 2;

function catmull(a: number, b: number, c: number, d: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
/** Arc-length table of a Catmull-Rom curve (uniform), resampled every SAMPLE_M metres. */
export function buildCurve(route: BenchPathRoute, ground: (x: number, z: number) => number): Curve {
  const p = route.points, n = p.length, at = (i: number) => route.loop ? p[(i % n + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  const dense: number[] = [], segs = route.loop ? n : n - 1, sub = 64;
  for (let i = 0; i < segs; i++) for (let k = 0; k < sub; k++) {
    const t = k / sub, a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    dense.push(catmull(a.x, b.x, c.x, d.x, t), catmull(a.z, b.z, c.z, d.z, t));
  }
  const last = route.loop ? p[0] : p[n - 1];
  dense.push(last.x, last.z);
  const cum = [0];
  for (let i = 2; i < dense.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(dense[i] - dense[i - 2], dense[i + 1] - dense[i - 1]));
  const length = cum[cum.length - 1], count = Math.max(2, Math.ceil(length / SAMPLE_M) + 1);
  const xs = new Float64Array(count), zs = new Float64Array(count), ys = new Float64Array(count);
  for (let j = 0, seg = 0; j < count; j++) {
    const s = Math.min(length, j * SAMPLE_M);
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const span = cum[seg + 1] - cum[seg] || 1, t = (s - cum[seg]) / span;
    xs[j] = dense[seg * 2] + (dense[seg * 2 + 2] - dense[seg * 2]) * t;
    zs[j] = dense[seg * 2 + 1] + (dense[seg * 2 + 3] - dense[seg * 2 + 1]) * t;
    ys[j] = ground(xs[j], zs[j]);
  }
  if (route.mode === 'glide') {
    // Clearance above the highest ground within ±150 m, then a ±100 m moving average:
    // a smooth flight line that never dives into the relief.
    const w = Math.round(150 / SAMPLE_M), m = Math.round(100 / SAMPLE_M), raw = new Float64Array(count);
    const idx = (j: number) => route.loop ? (j % count + count) % count : Math.max(0, Math.min(count - 1, j));
    for (let j = 0; j < count; j++) { let h = -Infinity; for (let k = -w; k <= w; k++) h = Math.max(h, ys[idx(j + k)]); raw[j] = h + (route.clearance ?? 60); }
    for (let j = 0; j < count; j++) { let s = 0; for (let k = -m; k <= m; k++) s += raw[idx(j + k)]; ys[j] = Math.max(s / (2 * m + 1), ys[j] + 15); }
  }
  return { xs, zs, ys, length, step: SAMPLE_M };
}
function sampleCurve(c: Curve, s: number, out: { x: number; y: number; z: number }) {
  const f = s / c.step, i = Math.min(c.xs.length - 2, Math.max(0, Math.floor(f))), t = Math.min(1, Math.max(0, f - i));
  out.x = c.xs[i] + (c.xs[i + 1] - c.xs[i]) * t;
  out.y = c.ys[i] + (c.ys[i + 1] - c.ys[i]) * t;
  out.z = c.zs[i] + (c.zs[i + 1] - c.zs[i]) * t;
}

/** Stateful evaluator: precomputes the curve once, then evaluates poses without allocation. */
export function createBenchRoute(route: BenchRoute, ground: (x: number, z: number) => number) {
  const curve = route.kind === 'path' ? buildCurve(route, ground) : null;
  const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  const pose: BenchPose = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: route.pitch, dist: route.dist, mode: 'ground', phase: 0 };
  const duration = route.kind === 'stations' ? route.stations.reduce((n, s) => n + s.ticks, 0) : null;
  return {
    route, pose, length: curve?.length ?? 0,
    /** Ticks for one lap / one out-and-back / all stations. */
    get periodTicks() { return route.kind === 'stations' ? duration! : Math.round((route.loop ? curve!.length : 2 * curve!.length) / route.speed * 30); },
    at(tick: number): BenchPose {
      if (route.kind === 'stations') {
        let t = tick % duration!, i = 0;
        while (t >= route.stations[i].ticks) { t -= route.stations[i].ticks; i++; }
        const s = route.stations[i];
        pose.x = s.x; pose.z = s.z; pose.y = ground(s.x, s.z); pose.vx = pose.vy = pose.vz = 0;
        pose.yaw = s.yaw; pose.mode = 'ground'; pose.phase = i;
        return pose;
      }
      const c = curve!, travelled = tick / 30 * route.speed;
      let s: number, dir = 1;
      if (route.loop) { s = travelled % c.length; pose.phase = Math.floor(travelled / c.length); }
      else { const lap = Math.floor(travelled / c.length); s = travelled - lap * c.length; if (lap % 2) { s = c.length - s; dir = -1; } pose.phase = lap; }
      sampleCurve(c, s, a);
      const ahead = route.loop ? (s + dir * 1) % c.length : Math.min(c.length, Math.max(0, s + dir * 1));
      sampleCurve(c, ahead < 0 ? ahead + c.length : ahead, b);
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      if (route.mode !== 'glide') dy = 0;
      dx /= len; dz /= len; dy /= len;
      pose.x = a.x; pose.y = a.y; pose.z = a.z;
      pose.vx = dx * route.speed; pose.vy = dy * route.speed; pose.vz = dz * route.speed;
      pose.yaw = Math.atan2(dx, dz); pose.mode = route.mode;
      return pose;
    },
  };
}
export type BenchRouteRunner = ReturnType<typeof createBenchRoute>;
