/** Capybara animation — pure, deterministic, no Three.js.
 * Locomotion is procedural and driven by the distance really travelled; behaviours
 * are data tables (`CAPYBARA_BEHAVIORS`) layered over a posture. The simulation owns
 * position and collisions: nothing here moves the animal.
 */
import { advanceCapybaraGait, makeCapybaraGait, type CapybaraGait } from './capybara-gait.ts';

export const CAPYBARA_CHANNELS = [
  'bodyY', 'bodyPitch', 'bodyRoll', 'pelvisYaw', 'chestYaw', 'chestPitch',
  'neckPitch', 'neckYaw', 'headPitch', 'headYaw', 'headRoll', 'earL', 'earR',
  'rlUpper', 'rlLower', 'rlFoot', 'rrUpper', 'rrLower', 'rrFoot',
  'flUpper', 'flLower', 'flFoot', 'frUpper', 'frLower', 'frFoot', 'eyesClosed',
] as const;
export type CapybaraChannel = typeof CAPYBARA_CHANNELS[number];
export type CapybaraRigPose = Record<CapybaraChannel, number>;
export const CAPYBARA_POSTURES = ['stand', 'sit', 'lie'] as const;
export type CapybaraPosture = typeof CAPYBARA_POSTURES[number];
export const CAPYBARA_LOCOMOTION = [
  'idle', 'walk', 'fast_walk', 'trot', 'turn_left', 'turn_right', 'walk_backward', 'start_walk', 'stop_walk',
] as const;
export type CapybaraLocomotion = typeof CAPYBARA_LOCOMOTION[number];
export const CAPYBARA_BEHAVIOR_NAMES = [
  'idle', 'look_around', 'eat', 'drink', 'graze', 'sniff', 'sit', 'lie_down', 'rest', 'sleep',
  'wake_up', 'stand_up', 'shake', 'react', 'happy', 'afraid', 'wait_loading',
] as const;
export type CapybaraBehavior = typeof CAPYBARA_BEHAVIOR_NAMES[number];
export type CapybaraAnimationEvent = 'step' | 'bite' | 'sip' | 'shake' | 'lie' | 'stand';

type Key = Partial<CapybaraRigPose> & { t: number };
export interface CapybaraBehaviorDef {
  posture: CapybaraPosture;
  duration: number;
  loop: boolean;
  /** Higher priority interrupts lower; equal priority replaces only when finished or looping. */
  priority: number;
  /** Behaviour that follows a finished one-shot. */
  next?: CapybaraBehavior;
  /** Only valid when the animal stands still. */
  still: boolean;
  events: { at: number; name: CapybaraAnimationEvent }[];
  keys: Key[];
}
const head = (pitch: number, neck = pitch * 0.6): Partial<CapybaraRigPose> => ({ headPitch: pitch, neckPitch: neck });
export const CAPYBARA_BEHAVIORS: Record<CapybaraBehavior, CapybaraBehaviorDef> = {
  idle: { posture: 'stand', duration: 4, loop: true, priority: 0, still: false, events: [], keys: [] },
  look_around: { posture: 'stand', duration: 4.2, loop: false, priority: 1, still: true, next: 'idle', events: [], keys: [
    { t: 0, headYaw: 0, neckYaw: 0 }, { t: 0.25, headYaw: 0.5, neckYaw: 0.25, earL: 0.2 },
    { t: 0.5, headYaw: 0.5, neckYaw: 0.25 }, { t: 0.75, headYaw: -0.5, neckYaw: -0.25, earR: 0.2 }, { t: 1, headYaw: 0, neckYaw: 0 }] },
  eat: { posture: 'stand', duration: 2.4, loop: true, priority: 1, still: true, events: [{ at: 0.3, name: 'bite' }, { at: 0.8, name: 'bite' }], keys: [
    { t: 0, ...head(-0.36), chestPitch: -0.05 }, { t: 0.3, ...head(-0.44) }, { t: 0.55, ...head(-0.33), headRoll: 0.08 },
    { t: 0.8, ...head(-0.44), headRoll: -0.08 }, { t: 1, ...head(-0.36), chestPitch: -0.05 }] },
  graze: { posture: 'stand', duration: 3.2, loop: true, priority: 1, still: false, events: [{ at: 0.5, name: 'bite' }], keys: [
    { t: 0, ...head(-0.38), chestPitch: -0.06, headYaw: -0.15 }, { t: 0.5, ...head(-0.46), headYaw: 0.15 }, { t: 1, ...head(-0.38), chestPitch: -0.06, headYaw: -0.15 }] },
  drink: { posture: 'stand', duration: 3, loop: true, priority: 1, still: true, events: [{ at: 0.5, name: 'sip' }], keys: [
    { t: 0, ...head(-0.42, -0.4), chestPitch: -0.1, flUpper: 0.12, frUpper: 0.12 }, { t: 0.5, ...head(-0.47, -0.4) }, { t: 1, ...head(-0.42, -0.4), chestPitch: -0.1, flUpper: 0.12, frUpper: 0.12 }] },
  sniff: { posture: 'stand', duration: 1.8, loop: false, priority: 1, still: true, next: 'idle', events: [], keys: [
    { t: 0, ...head(0) }, { t: 0.2, ...head(-0.4) }, { t: 0.4, ...head(-0.34), headYaw: 0.12 }, { t: 0.6, ...head(-0.42), headYaw: -0.12 }, { t: 1, ...head(0), headYaw: 0 }] },
  sit: { posture: 'sit', duration: 5, loop: true, priority: 1, still: true, events: [], keys: [{ t: 0, earL: 0 }, { t: 0.5, earL: 0.15, earR: 0.15 }, { t: 1, earL: 0 }] },
  lie_down: { posture: 'lie', duration: 1.4, loop: false, priority: 2, still: true, next: 'rest', events: [{ at: 0.7, name: 'lie' }], keys: [
    { t: 0, ...head(0) }, { t: 0.5, ...head(-0.25) }, { t: 1, ...head(-0.05) }] },
  rest: { posture: 'lie', duration: 6, loop: true, priority: 1, still: true, events: [], keys: [
    { t: 0, ...head(-0.05), eyesClosed: 0.15 }, { t: 0.5, ...head(-0.1), eyesClosed: 0.45, earL: 0.1 }, { t: 1, ...head(-0.05), eyesClosed: 0.15 }] },
  sleep: { posture: 'lie', duration: 5, loop: true, priority: 1, still: true, events: [], keys: [
    { t: 0, ...head(-0.42, -0.3), eyesClosed: 1, earL: -0.15, earR: -0.15 }, { t: 0.5, ...head(-0.45, -0.3), eyesClosed: 1 }, { t: 1, ...head(-0.42, -0.3), eyesClosed: 1, earL: -0.15, earR: -0.15 }] },
  wake_up: { posture: 'lie', duration: 1.6, loop: false, priority: 2, still: true, next: 'rest', events: [], keys: [
    { t: 0, ...head(-0.42, -0.3), eyesClosed: 1 }, { t: 0.5, ...head(0.05), eyesClosed: 0.5, earL: 0.3, earR: 0.3 }, { t: 1, ...head(0.08), eyesClosed: 0 }] },
  stand_up: { posture: 'stand', duration: 1.3, loop: false, priority: 2, still: true, next: 'idle', events: [{ at: 0.6, name: 'stand' }], keys: [
    { t: 0, ...head(0.05) }, { t: 0.4, ...head(-0.3), chestPitch: 0.08 }, { t: 1, ...head(0), chestPitch: 0 }] },
  shake: { posture: 'stand', duration: 1.1, loop: false, priority: 2, still: true, next: 'idle', events: [{ at: 0.2, name: 'shake' }], keys: [
    { t: 0, bodyRoll: 0, headRoll: 0 }, { t: 0.15, bodyRoll: 0.09, headRoll: -0.3, earL: 0.4, earR: -0.4 }, { t: 0.3, bodyRoll: -0.09, headRoll: 0.3, earL: -0.4, earR: 0.4 },
    { t: 0.45, bodyRoll: 0.09, headRoll: -0.3, earL: 0.4, earR: -0.4 }, { t: 0.6, bodyRoll: -0.08, headRoll: 0.26 }, { t: 0.75, bodyRoll: 0.05, headRoll: -0.15 }, { t: 1, bodyRoll: 0, headRoll: 0, earL: 0, earR: 0 }] },
  react: { posture: 'stand', duration: 0.9, loop: false, priority: 3, still: false, next: 'idle', events: [], keys: [
    { t: 0, ...head(0) }, { t: 0.2, ...head(0.3), earL: 0.45, earR: 0.45, bodyY: 0.03 }, { t: 0.7, ...head(0.24), earL: 0.3, earR: 0.3 }, { t: 1, ...head(0), earL: 0, earR: 0, bodyY: 0 }] },
  happy: { posture: 'stand', duration: 1.6, loop: false, priority: 2, still: true, next: 'idle', events: [], keys: [
    { t: 0, bodyY: 0, ...head(0) }, { t: 0.2, bodyY: 0.05, ...head(0.22), earL: 0.35, earR: 0.35 }, { t: 0.4, bodyY: 0, headRoll: 0.14 },
    { t: 0.6, bodyY: 0.05, headRoll: -0.14 }, { t: 0.8, bodyY: 0, headRoll: 0.08 }, { t: 1, bodyY: 0, ...head(0), headRoll: 0, earL: 0, earR: 0 }] },
  afraid: { posture: 'stand', duration: 1.2, loop: true, priority: 3, still: false, events: [], keys: [
    { t: 0, bodyY: -0.06, ...head(-0.12), earL: -0.4, earR: -0.4 }, { t: 0.5, bodyY: -0.07, ...head(-0.16), earL: -0.45, earR: -0.45, bodyRoll: 0.015 }, { t: 1, bodyY: -0.06, ...head(-0.12), earL: -0.4, earR: -0.4 }] },
  wait_loading: { posture: 'stand', duration: 5, loop: true, priority: 1, still: true, events: [], keys: [
    { t: 0, headYaw: 0, bodyRoll: 0 }, { t: 0.3, headYaw: -0.4, neckYaw: -0.3, bodyRoll: 0.012 }, { t: 0.6, headYaw: -0.4, neckYaw: -0.3, earL: 0.2 }, { t: 1, headYaw: 0, neckYaw: 0, bodyRoll: 0 }] },
};

/** Posture offsets added to the standing rest pose (sternal rest: legs folded under). */
const POSTURES: Record<CapybaraPosture, Partial<CapybaraRigPose>> = {
  stand: {},
  sit: { bodyY: -0.3, bodyPitch: 0.3, rlUpper: 0.75, rrUpper: 0.75, rlLower: -1.3, rrLower: -1.3, rlFoot: 0.85, rrFoot: 0.85,
    flUpper: -0.28, frUpper: -0.28, neckPitch: -0.2, headPitch: -0.1 },
  lie: { bodyY: -0.4, rlUpper: 1.05, rrUpper: 1.05, rlLower: -2.0, rrLower: -2.0, rlFoot: 0.95, rrFoot: 0.95,
    flUpper: 1.0, frUpper: 1.0, flLower: -2.05, frLower: -2.05, flFoot: 1.05, frFoot: 1.05 },
};
export const CAPYBARA_GAITS = {
  walk: { stride: 1.35, swing: 0.34, lift: 0.5, bob: 0.012 },
  trot: { stride: 1.9, swing: 0.46, lift: 0.75, bob: 0.026 },
} as const;
export const CAPYBARA_SPEEDS = { walk: 1.1, fastWalk: 1.9, trot: 3.2 } as const;
const TAU = Math.PI * 2;
/** Footfall offsets (fraction of a stride): lateral-sequence walk, diagonal trot. */
const WALK_OFFSETS = { rl: 0, fl: 0.25, rr: 0.5, fr: 0.75 } as const;
const TROT_OFFSETS = { rl: 0, fr: 0, rr: 0.5, fl: 0.5 } as const;
const LEGS = ['rl', 'rr', 'fl', 'fr'] as const;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));
const finite = (v: number | undefined, fallback = 0): number => (Number.isFinite(v) ? v as number : fallback);
const ease = (t: number): number => t * t * (3 - 2 * t);

export interface CapybaraAnimationInput {
  /** Signed ground speed (m/s) measured by the simulation; negative when backing. */
  speed: number;
  /** Yaw rate (rad/s), positive to the left. */
  turnRate?: number;
  /** Head target relative to the body (radians); undefined looks ahead. */
  lookYaw?: number;
  lookPitch?: number;
  /** 0 free … 1 heaviest draught: lowers the head, shortens the stride, leans into the collar. */
  load?: number;
  rider?: boolean;
  /** Terrain pitch under the body (radians, nose up positive). */
  groundPitch?: number;
}
export function emptyCapybaraPose(): CapybaraRigPose {
  return Object.fromEntries(CAPYBARA_CHANNELS.map((c) => [c, 0])) as CapybaraRigPose;
}
function sampleKeys(keys: readonly Key[], u: number, out: CapybaraRigPose, weight: number): void {
  for (const channel of CAPYBARA_CHANNELS) {
    let before: Key | undefined, after: Key | undefined;
    for (const key of keys) {
      if (key[channel] === undefined) continue;
      if (key.t <= u) before = key; else if (!after) after = key;
    }
    if (!before && !after) continue;
    const a = before ?? after!, b = after ?? before!;
    const span = b.t - a.t, k = span > 1e-6 ? ease(clamp((u - a.t) / span, 0, 1)) : 0;
    out[channel] += (a[channel]! + (b[channel]! - a[channel]!) * k) * weight;
  }
}

export class CapybaraAnimator {
  readonly pose = emptyCapybaraPose();
  readonly events: CapybaraAnimationEvent[] = [];
  locomotion: CapybaraLocomotion = 'idle';
  private target = emptyCapybaraPose();
  private gait: CapybaraGait = makeCapybaraGait();
  private name: CapybaraBehavior = 'idle';
  private time = 0;
  private clock = 0;
  private fired = 0;
  private postureWeight: Record<CapybaraPosture, number> = { stand: 1, sit: 0, lie: 0 };
  private behaviorWeight = 0;
  private trot = 0;
  private previousSpeed = 0;
  private surge = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private lastStep = [0, 0, 0, 0];

  get behavior(): CapybaraBehavior { return this.name; }
  get posture(): CapybaraPosture { return CAPYBARA_BEHAVIORS[this.name].posture; }
  get stridePhase(): number { return this.gait.phase; }
  /** True while the posture forbids locomotion (gameplay must not move a lying animal). */
  get grounded(): boolean { return this.postureWeight.stand < 0.6; }

  /** Requests a behaviour; refused when a higher-priority one-shot is still running. */
  play(name: CapybaraBehavior): boolean {
    const next = CAPYBARA_BEHAVIORS[name], current = CAPYBARA_BEHAVIORS[this.name];
    if (name === this.name) return true;
    const running = !current.loop && this.time < current.duration;
    if (running && next.priority < current.priority) return false;
    this.name = name; this.time = 0; this.fired = 0; this.behaviorWeight = 0;
    return true;
  }

  update(input: CapybaraAnimationInput, delta: number): CapybaraRigPose {
    const dt = Number.isFinite(delta) ? clamp(delta, 0, 0.1) : 0;
    const speed = finite(input.speed), abs = Math.abs(speed), turn = finite(input.turnRate);
    const load = clamp(finite(input.load), 0, 1);
    this.events.length = 0;
    this.clock += dt;
    // Movement always wins over a still behaviour: the animal stands up and walks.
    if (abs > 0.12 && (CAPYBARA_BEHAVIORS[this.name].still || this.posture !== 'stand')) {
      this.name = 'idle'; this.time = 0; this.fired = 0;
    }
    let def = CAPYBARA_BEHAVIORS[this.name];
    this.time += dt;
    while (this.fired < def.events.length && def.events[this.fired].at * def.duration <= this.time) this.events.push(def.events[this.fired++].name);
    if (this.time >= def.duration) {
      if (def.loop) { this.time %= def.duration; this.fired = 0; }
      else if (def.next) { this.name = def.next; this.time = 0; this.fired = 0; def = CAPYBARA_BEHAVIORS[this.name]; }
    }
    for (const posture of CAPYBARA_POSTURES) this.postureWeight[posture] = damp(this.postureWeight[posture], def.posture === posture ? 1 : 0, 3.4, dt);
    this.behaviorWeight = damp(this.behaviorWeight, 1, 7, dt);

    // Gait: the stride lengthens from walk to trot, the phase follows real distance.
    this.trot = damp(this.trot, abs > (CAPYBARA_SPEEDS.fastWalk + CAPYBARA_SPEEDS.trot) / 2 ? 1 : 0, 5, dt);
    const w = CAPYBARA_GAITS.walk, t = CAPYBARA_GAITS.trot, mix = this.trot;
    const stride = (w.stride + (t.stride - w.stride) * mix) * (1 - 0.22 * load);
    this.gait = advanceCapybaraGait(this.gait, { dt, speed }, stride);
    const moving = this.gait.influence * this.postureWeight.stand;
    const acceleration = dt > 0 ? (abs - this.previousSpeed) / dt : 0;
    this.previousSpeed = abs;
    this.surge = damp(this.surge, clamp(acceleration * 0.035, -0.07, 0.07), 6, dt);
    this.locomotion = abs < 0.06 ? (Math.abs(turn) > 0.25 ? (turn > 0 ? 'turn_left' : 'turn_right') : 'idle')
      : speed < 0 ? 'walk_backward'
      : acceleration > 1.2 && abs < CAPYBARA_SPEEDS.walk ? 'start_walk'
      : acceleration < -1.2 && abs < CAPYBARA_SPEEDS.walk ? 'stop_walk'
      : Math.abs(turn) > 0.7 && abs < CAPYBARA_SPEEDS.fastWalk ? (turn > 0 ? 'turn_left' : 'turn_right')
      : abs > (CAPYBARA_SPEEDS.fastWalk + CAPYBARA_SPEEDS.trot) / 2 ? 'trot' : abs > (CAPYBARA_SPEEDS.walk + CAPYBARA_SPEEDS.fastWalk) / 2 ? 'fast_walk' : 'walk';

    const p = this.target;
    for (const channel of CAPYBARA_CHANNELS) p[channel] = 0;
    for (const posture of CAPYBARA_POSTURES) {
      const weight = this.postureWeight[posture];
      if (weight < 1e-3) continue;
      const offsets = POSTURES[posture];
      for (const channel in offsets) p[channel as CapybaraChannel] += offsets[channel as CapybaraChannel]! * weight;
    }
    const swing = (w.swing + (t.swing - w.swing) * mix) * (1 - 0.3 * load) * moving;
    const lift = (w.lift + (t.lift - w.lift) * mix) * moving;
    // Turning on the spot still steps: a slow shuffle driven by the yaw rate.
    const shuffle = abs < 0.06 ? clamp(Math.abs(turn) / 1.2, 0, 1) * this.postureWeight.stand : 0;
    const phase = shuffle > 0 ? this.clock * 5 : this.gait.phase;
    LEGS.forEach((leg, i) => {
      const offset = WALK_OFFSETS[leg] + (TROT_OFFSETS[leg] - WALK_OFFSETS[leg]) * mix;
      const angle = phase + offset * TAU, raise = Math.max(0, Math.cos(angle));
      const amount = swing + shuffle * 0.1, up = lift + shuffle * 0.35;
      p[`${leg}Upper`] += Math.sin(angle) * amount + raise * up * 0.25;
      p[`${leg}Lower`] -= raise * up;
      p[`${leg}Foot`] += raise * up * 0.6;
      const step = Math.floor((angle - Math.PI / 2) / TAU);
      if (step !== this.lastStep[i]) { this.lastStep[i] = step; if (moving > 0.5) this.events.push('step'); }
    });
    const bob = (w.bob + (t.bob - w.bob) * mix) * moving;
    p.bodyY += Math.cos(2 * this.gait.phase) * bob + Math.sin(this.clock * 2.4) * 0.006 * (1 - moving) - 0.02 * load * moving;
    p.bodyPitch += -this.surge - 0.05 * load * moving;
    p.pelvisYaw += Math.sin(this.gait.phase) * 0.035 * moving;
    p.chestYaw += clamp(turn * 0.12, -0.2, 0.2) * this.postureWeight.stand - Math.sin(this.gait.phase) * 0.03 * moving;
    p.bodyRoll += clamp(-turn * abs * 0.02, -0.08, 0.08);
    p.neckPitch += -0.18 * load * moving - Math.cos(2 * this.gait.phase) * 0.03 * moving * (input.rider ? 0.5 : 1);
    p.headPitch += -0.1 * load * moving;
    // The view pitches the whole body onto the slope; the head stays roughly level.
    p.neckPitch -= clamp(finite(input.groundPitch), -0.5, 0.5) * 0.35;

    // Behaviour layer (only its own channels), then the independent head look.
    if (def.keys.length) sampleKeys(def.keys, clamp(this.time / def.duration, 0, 1), p, this.behaviorWeight * (def.still ? 1 - Math.min(1, moving) : 1));
    const looking = def.posture !== 'lie' || this.name === 'rest';
    this.lookYaw = damp(this.lookYaw, looking && this.name !== 'sleep' ? clamp(finite(input.lookYaw), -0.9, 0.9) : 0, 5.4, dt);
    this.lookPitch = damp(this.lookPitch, looking ? clamp(finite(input.lookPitch), -0.35, 0.35) : 0, 5.4, dt);
    p.neckYaw += this.lookYaw * 0.4; p.headYaw += this.lookYaw * 0.6;
    p.neckPitch += this.lookPitch * 0.4; p.headPitch += this.lookPitch * 0.6;
    p.eyesClosed = clamp(p.eyesClosed, 0, 1);

    const blend = 1 - Math.exp(-dt * 14);
    for (const channel of CAPYBARA_CHANNELS) this.pose[channel] += (p[channel] - this.pose[channel]) * blend;
    return this.pose;
  }
}
