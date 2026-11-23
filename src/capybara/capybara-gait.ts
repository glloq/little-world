/** Capybara V6.3 animation phase — deterministic, independent from physics/Three.js.
 * The world controller owns position and collision. This is presentation only.
 */
export interface CapybaraMotion {
  /** Ground speed in model metres/second; negative speed means backing up. */
  speed: number;
  /** Delta time in seconds, typically simulation frame duration. */
  dt: number;
}
export interface CapybaraGait {
  phase: number;
  influence: number;
}
const TAU = Math.PI * 2;
/** Approximately 1.35 m per complete four-beat stride. */
export const CAPYBARA_STRIDE_METRES = 1.35;
export const CAPYBARA_WALK_BLEND_SPEED = 0.18;
/** `strideMetres` lets a gait (trot, loaded draught) lengthen or shorten the stride. */
export function advanceCapybaraGait(gait: CapybaraGait, motion: CapybaraMotion, strideMetres = CAPYBARA_STRIDE_METRES): CapybaraGait {
  const dt = Number.isFinite(motion.dt) ? Math.max(0, Math.min(motion.dt, 0.1)) : 0;
  const speed = Number.isFinite(motion.speed) ? motion.speed : 0;
  const phase = (gait.phase + speed * dt * TAU / Math.max(0.2, strideMetres)) % TAU;
  const desired = Math.min(1, Math.abs(speed) / CAPYBARA_WALK_BLEND_SPEED);
  const blend = 1 - Math.exp(-10 * dt);
  return { phase, influence: gait.influence + (desired - gait.influence) * blend };
}
export function makeCapybaraGait(): CapybaraGait { return { phase: 0, influence: 0 }; }
