/** Capybara V6.3 skeleton and procedural skin — pure data, no Three.js, no DOM.
 * The approved V6.3 mesh is kept untouched: bones and weights are derived from
 * the rest positions, so the browser, the Node tests and the GLB generator share
 * exactly one definition. Model space: +X forward, +Y up, +Z left, ground Y≈0.
 */
export const CAPYBARA_BONES = [
  'Root', 'Pelvis', 'Chest', 'Neck', 'Head', 'EarLeft', 'EarRight',
  'RearUpperLeft', 'RearLowerLeft', 'RearFootLeft',
  'RearUpperRight', 'RearLowerRight', 'RearFootRight',
  'FrontUpperLeft', 'FrontLowerLeft', 'FrontFootLeft',
  'FrontUpperRight', 'FrontLowerRight', 'FrontFootRight',
  'SocketRider', 'SocketSaddle', 'SocketPackLeft', 'SocketPackRight',
  'SocketHarness', 'SocketHitch', 'SocketHead',
] as const;
export type CapybaraBone = typeof CAPYBARA_BONES[number];
export type Vec3 = readonly [number, number, number];

/** Pivots in MODEL space (converted to parent-relative offsets by the builder). */
export const CAPYBARA_PIVOTS: Record<CapybaraBone, Vec3> = {
  Root: [0, 0, 0],
  Pelvis: [-0.95, 0.98, 0],
  Chest: [0.15, 1.02, 0],
  Neck: [0.5, 1.12, 0],
  Head: [0.68, 1.18, 0],
  EarLeft: [0.62, 1.64, 0.31],
  EarRight: [0.62, 1.64, -0.31],
  RearUpperLeft: [-1.1, 0.66, 0.36],
  RearLowerLeft: [-1.12, 0.32, 0.39],
  RearFootLeft: [-1.12, 0.1, 0.39],
  RearUpperRight: [-1.1, 0.66, -0.36],
  RearLowerRight: [-1.12, 0.32, -0.39],
  RearFootRight: [-1.12, 0.1, -0.39],
  FrontUpperLeft: [0.24, 0.7, 0.34],
  FrontLowerLeft: [0.26, 0.34, 0.37],
  FrontFootLeft: [0.27, 0.1, 0.38],
  FrontUpperRight: [0.24, 0.7, -0.34],
  FrontLowerRight: [0.26, 0.34, -0.37],
  FrontFootRight: [0.27, 0.1, -0.38],
  SocketRider: [-0.48, 1.73, 0],
  SocketSaddle: [-0.49, 1.66, 0],
  SocketPackLeft: [-0.55, 1.2, 0.7],
  SocketPackRight: [-0.55, 1.2, -0.7],
  SocketHarness: [0.22, 1.08, 0],
  SocketHitch: [-1.62, 0.77, 0],
  SocketHead: [1.1, 1.5, 0],
};
export const CAPYBARA_PARENTS: Record<CapybaraBone, CapybaraBone | null> = {
  Root: null, Pelvis: 'Root', Chest: 'Pelvis', Neck: 'Chest', Head: 'Neck',
  EarLeft: 'Head', EarRight: 'Head',
  RearUpperLeft: 'Pelvis', RearLowerLeft: 'RearUpperLeft', RearFootLeft: 'RearLowerLeft',
  RearUpperRight: 'Pelvis', RearLowerRight: 'RearUpperRight', RearFootRight: 'RearLowerRight',
  FrontUpperLeft: 'Chest', FrontLowerLeft: 'FrontUpperLeft', FrontFootLeft: 'FrontLowerLeft',
  FrontUpperRight: 'Chest', FrontLowerRight: 'FrontUpperRight', FrontFootRight: 'FrontLowerRight',
  // The saddle rides between the two body bones; the hitch never follows a deforming limb.
  SocketRider: 'Pelvis', SocketSaddle: 'Pelvis', SocketPackLeft: 'Pelvis', SocketPackRight: 'Pelvis',
  SocketHarness: 'Chest', SocketHitch: 'Root', SocketHead: 'Head',
};
export const CAPYBARA_LEGS = ['RearLeft', 'RearRight', 'FrontLeft', 'FrontRight'] as const;
export type CapybaraLeg = typeof CAPYBARA_LEGS[number];
/** Length of a straight leg from its upper pivot to the sole, used for foot planting. */
export const CAPYBARA_LEG_LENGTH = { rear: 0.66, front: 0.7 } as const;

const index = (bone: CapybaraBone): number => CAPYBARA_BONES.indexOf(bone);
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const LEG_COLUMNS = [
  { x: -1.12, side: 1, kneeY: 0.32, bones: ['RearUpperLeft', 'RearLowerLeft', 'RearFootLeft'] },
  { x: -1.12, side: -1, kneeY: 0.32, bones: ['RearUpperRight', 'RearLowerRight', 'RearFootRight'] },
  { x: 0.27, side: 1, kneeY: 0.34, bones: ['FrontUpperLeft', 'FrontLowerLeft', 'FrontFootLeft'] },
  { x: 0.27, side: -1, kneeY: 0.34, bones: ['FrontUpperRight', 'FrontLowerRight', 'FrontFootRight'] },
] as const;

/** Weights of one rest position as sparse [boneIndex, weight] pairs (unnormalised). */
function influences(x: number, y: number, z: number, out: Map<number, number>): void {
  out.clear();
  let leg = 0;
  for (const column of LEG_COLUMNS) {
    if (z * column.side <= 0) continue;
    const along = 1 - smooth(0.3, 0.55, Math.abs(x - column.x));
    // Below the belly the columns are isolated; above, only the flanks belong to the leg.
    const lateral = Math.max(smooth(0.1, 0.24, Math.abs(z)), 1 - smooth(0.2, 0.26, y));
    const mask = along * lateral * (1 - smooth(0.42, 0.8, y));
    if (mask <= 0) continue;
    const lower = 1 - smooth(column.kneeY - 0.08, column.kneeY + 0.08, y);
    const foot = 1 - smooth(0.06, 0.16, y);
    out.set(index(column.bones[0]), mask * (1 - lower));
    out.set(index(column.bones[1]), mask * lower * (1 - foot));
    out.set(index(column.bones[2]), mask * lower * foot);
    leg = mask;
  }
  const body = 1 - leg;
  if (body <= 0) return;
  const chest = smooth(-0.75, -0.15, x), neck = smooth(0.38, 0.62, x), head = smooth(0.62, 0.86, x);
  const ear = smooth(1.58, 1.68, y) * smooth(0.15, 0.24, Math.abs(z)) * (1 - smooth(0.76, 0.84, x)) * smooth(0.44, 0.5, x);
  const add = (bone: CapybaraBone, w: number): void => { if (w > 1e-4) out.set(index(bone), (out.get(index(bone)) ?? 0) + w * body); };
  add('Pelvis', 1 - chest);
  add('Chest', chest * (1 - neck));
  add('Neck', neck * (1 - head) * (1 - ear));
  add('Head', head * (1 - ear));
  add(z >= 0 ? 'EarLeft' : 'EarRight', Math.max(neck, head) * ear);
}

export interface CapybaraSkin { skinIndex: Uint16Array; skinWeight: Float32Array }
/** Four normalised influences per vertex, deterministic for a given position buffer. */
export function computeCapybaraSkin(positions: ArrayLike<number>): CapybaraSkin {
  const count = Math.floor(positions.length / 3);
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  const map = new Map<number, number>();
  for (let v = 0; v < count; v++) {
    influences(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], map);
    const top = [...map].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((sum, [, w]) => sum + w, 0);
    if (total <= 0) { skinIndex[v * 4] = index('Pelvis'); skinWeight[v * 4] = 1; continue; }
    top.forEach(([bone, w], i) => { skinIndex[v * 4 + i] = bone; skinWeight[v * 4 + i] = w / total; });
  }
  return { skinIndex, skinWeight };
}
/** Parent-relative rest offset of a bone. */
export function capybaraRestOffset(bone: CapybaraBone): Vec3 {
  const parent = CAPYBARA_PARENTS[bone], p = CAPYBARA_PIVOTS[bone];
  if (!parent) return p;
  const q = CAPYBARA_PIVOTS[parent];
  return [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
}
