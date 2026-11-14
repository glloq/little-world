/** Hamster animation (doc 43) — explicit state machines, pure (no Three.js): the renderer reads
 * the pose, the gameplay never reads it. Two layers:
 *  - LOCOMOTION, derived every frame from the motion state (mode, speeds, turn rate): IDLE, WALK,
 *    RUN, ROLL_ENTER/LOOP/EXIT, JUMP, FALL, LAND, GLIDE_OPEN/LOOP/CLOSE, SWIM, CLIMB, BOAT;
 *  - ACTION, requested by gameplay (tools, pickup, fishing…), data-driven keyframes over the arms
 *    and torso with timed EVENTS (impact, release, reel…) that drive sounds and effects.
 * Allocation-free per frame; the same inputs give the same poses (remote characters can be
 * rebuilt from a compact presentation state, see presentation-state.ts). */
import type { MotionMode } from '../player.ts';

export const LOCOMOTION_STATES = ['IDLE', 'WALK', 'RUN', 'ROLL_ENTER', 'ROLL_LOOP', 'ROLL_EXIT', 'JUMP', 'FALL', 'LAND', 'GLIDE_OPEN', 'GLIDE_LOOP', 'GLIDE_CLOSE', 'SWIM', 'CLIMB', 'BOAT'] as const;
export type LocomotionState = typeof LOCOMOTION_STATES[number];
export const ACTIONS = ['EQUIP', 'UNEQUIP', 'TOOL_SWING_VERTICAL', 'TOOL_SWING_HORIZONTAL', 'TOOL_DIG', 'WATERING', 'PICKUP', 'CARRY', 'FISH_CAST', 'FISH_WAIT', 'FISH_REEL', 'INTERACT', 'SIT'] as const;
export type ActionName = typeof ACTIONS[number];
export type AnimationEventName = 'equip' | 'unequip' | 'impact' | 'grab' | 'release' | 'reel' | 'pour' | 'wave' | 'roll-start' | 'roll-stop' | 'glide-open' | 'glide-close' | 'land' | 'jump';
export interface HamsterInput {
  mode: MotionMode;
  /** Horizontal speed (m/s), vertical speed (m/s), heading change rate (rad/s, left positive). */
  speed: number; verticalSpeed: number; turnRate: number;
  /** On a boat (the motion mode is then 'ground'). */
  aboard?: boolean;
}
/** Joint channels (radians / model metres). */
export interface HamsterPose {
  bodyY: number; bodyRX: number; bodyRY: number; bodyRZ: number; squash: number;
  /** Accumulated rolling angle (visual only) and limb retraction 0…1. */
  roll: number; tuck: number;
  headRX: number; headRY: number; headRZ: number; earL: number; earR: number;
  shoulderLX: number; shoulderLZ: number; shoulderRX: number; shoulderRZ: number;
  hipLX: number; hipRX: number; tailX: number;
  /** Glide membranes 0 (folded) … 1 (spread). */ membrane: number;
}
const CHANNELS = ['bodyY', 'bodyRX', 'bodyRY', 'bodyRZ', 'squash', 'tuck', 'headRX', 'headRY', 'headRZ', 'earL', 'earR', 'shoulderLX', 'shoulderLZ', 'shoulderRX', 'shoulderRZ', 'hipLX', 'hipRX', 'tailX', 'membrane'] as const;
type Channel = typeof CHANNELS[number];
const restPose = (): HamsterPose => ({ bodyY: 0, bodyRX: 0, bodyRY: 0, bodyRZ: 0, squash: 1, roll: 0, tuck: 0, headRX: 0, headRY: 0, headRZ: 0, earL: 0, earR: 0, shoulderLX: 0, shoulderLZ: 0, shoulderRX: 0, shoulderRZ: 0, hipLX: 0, hipRX: 0, tailX: 0, membrane: 0 });
/** Radius of the ball in roll (model metres) — the visual roll angle follows distance / radius. */
export const ROLL_RADIUS = .62;
/** Durations of the locomotion transitions (s). */
export const TRANSITIONS = { ROLL_ENTER: .18, ROLL_EXIT: .2, GLIDE_OPEN: .25, GLIDE_CLOSE: .2, JUMP: .15, LAND: .2 } as const;

type Key = Partial<Record<Channel, number>> & { t: number };
export interface ActionDefinition {
  duration: number; loop: boolean;
  /** Tool shown in the paw while the action runs (the equipped tool, if any). */ tool: boolean;
  /** Timed events (fraction of the duration). */ events: { at: number; name: AnimationEventName }[];
  /** Keyframes (t in 0…1) of the channels the action drives (others keep the locomotion pose). */ keys: Key[];
}
/** Centralised action table: arms raised (shoulderRX < 0), body twist, bend… */
export const ACTION_DEFS: Record<ActionName, ActionDefinition> = {
  EQUIP: { duration: .3, loop: false, tool: true, events: [{ at: .5, name: 'equip' }], keys: [{ t: 0, shoulderRX: 0 }, { t: .5, shoulderRX: -1.2, shoulderRZ: .4 }, { t: 1, shoulderRX: -.4, shoulderRZ: .1 }] },
  UNEQUIP: { duration: .25, loop: false, tool: true, events: [{ at: .6, name: 'unequip' }], keys: [{ t: 0, shoulderRX: -.4 }, { t: .6, shoulderRX: -1.1, shoulderRZ: .5 }, { t: 1, shoulderRX: 0, shoulderRZ: 0 }] },
  TOOL_SWING_VERTICAL: { duration: .45, loop: false, tool: true, events: [{ at: .55, name: 'impact' }], keys: [
    { t: 0, shoulderRX: -1.2, shoulderLX: -1.1, bodyRX: 0 }, { t: .35, shoulderRX: -2.9, shoulderLX: -2.7, bodyRX: -.18, headRX: -.15 },
    { t: .55, shoulderRX: -.35, shoulderLX: -.4, bodyRX: .22, headRX: .12, squash: .94 }, { t: 1, shoulderRX: -1.1, shoulderLX: -1, bodyRX: 0, squash: 1 }] },
  TOOL_SWING_HORIZONTAL: { duration: .45, loop: false, tool: true, events: [{ at: .55, name: 'impact' }], keys: [
    { t: 0, shoulderRX: -.9, shoulderRZ: .2, bodyRY: 0 }, { t: .35, shoulderRX: -1.3, shoulderRZ: 1.1, bodyRY: .75, shoulderLX: -.8 },
    { t: .55, shoulderRX: -.7, shoulderRZ: -.5, bodyRY: -.45, shoulderLX: -.9, squash: .95 }, { t: 1, shoulderRX: -.9, shoulderRZ: .2, bodyRY: 0, shoulderLX: -.4, squash: 1 }] },
  TOOL_DIG: { duration: .5, loop: false, tool: true, events: [{ at: .6, name: 'impact' }], keys: [
    { t: 0, shoulderRX: -.8, shoulderLX: -.8, bodyRX: 0 }, { t: .35, shoulderRX: -1.5, shoulderLX: -1.5, bodyRX: -.1 }, { t: .6, shoulderRX: -.2, shoulderLX: -.25, bodyRX: .35 }, { t: 1, shoulderRX: -.7, shoulderLX: -.7, bodyRX: 0 }] },
  WATERING: { duration: .8, loop: false, tool: true, events: [{ at: .4, name: 'pour' }], keys: [{ t: 0, shoulderRX: -.6 }, { t: .3, shoulderRX: -1.3, bodyRX: .15 }, { t: .75, shoulderRX: -1.3, bodyRX: .15 }, { t: 1, shoulderRX: -.6, bodyRX: 0 }] },
  PICKUP: { duration: .4, loop: false, tool: false, events: [{ at: .5, name: 'grab' }], keys: [
    { t: 0, bodyRX: 0 }, { t: .5, bodyRX: .45, shoulderLX: -.5, shoulderRX: -.5, headRX: .25, squash: .92 }, { t: 1, bodyRX: 0, shoulderLX: 0, shoulderRX: 0, headRX: 0, squash: 1 }] },
  CARRY: { duration: 1, loop: true, tool: false, events: [], keys: [{ t: 0, shoulderLX: -1.35, shoulderRX: -1.35, shoulderLZ: .15, shoulderRZ: -.15 }, { t: 1, shoulderLX: -1.35, shoulderRX: -1.35, shoulderLZ: .15, shoulderRZ: -.15 }] },
  FISH_CAST: { duration: .6, loop: false, tool: true, events: [{ at: .55, name: 'release' }], keys: [
    { t: 0, shoulderRX: -.9, bodyRX: 0 }, { t: .4, shoulderRX: -2.7, bodyRX: -.18, headRX: -.1 }, { t: .55, shoulderRX: -.7, bodyRX: .12 }, { t: 1, shoulderRX: -.9, bodyRX: 0, headRX: 0 }] },
  FISH_WAIT: { duration: 2, loop: true, tool: true, events: [], keys: [{ t: 0, shoulderRX: -.9, shoulderLX: -.7 }, { t: .5, shoulderRX: -.95, shoulderLX: -.75 }, { t: 1, shoulderRX: -.9, shoulderLX: -.7 }] },
  FISH_REEL: { duration: .7, loop: false, tool: true, events: [{ at: .3, name: 'reel' }], keys: [
    { t: 0, shoulderRX: -.9, shoulderLX: -.7 }, { t: .3, shoulderRX: -1.6, shoulderLX: -1.2, bodyRX: -.12 }, { t: .6, shoulderRX: -1.7, shoulderLX: -.6, bodyRX: -.1 }, { t: 1, shoulderRX: -.9, shoulderLX: -.4, bodyRX: 0 }] },
  INTERACT: { duration: .45, loop: false, tool: false, events: [{ at: .4, name: 'wave' }], keys: [{ t: 0, shoulderRX: 0 }, { t: .4, shoulderRX: -2.4, shoulderRZ: .5, headRZ: .12 }, { t: 1, shoulderRX: 0, shoulderRZ: 0, headRZ: 0 }] },
  SIT: { duration: 1, loop: true, tool: false, events: [], keys: [{ t: 0, bodyY: -.06, hipLX: -1.2, hipRX: -1.2, squash: .95 }, { t: 1, bodyY: -.06, hipLX: -1.2, hipRX: -1.2, squash: .95 }] },
};
const smooth = (x: number) => x * x * (3 - 2 * x);
function sample(keys: Key[], u: number, out: Partial<Record<Channel, number>>) {
  for (const ch of CHANNELS) {
    let a: Key | null = null, b: Key | null = null;
    for (const k of keys) if (k[ch] !== undefined) { if (k.t <= u) a = k; else if (!b) b = k; }
    if (!a && !b) continue; if (!a) { out[ch] = b![ch]; continue; } if (!b) { out[ch] = a[ch]; continue; }
    const f = smooth((u - a.t) / Math.max(1e-6, b.t - a.t)); out[ch] = a[ch]! + (b[ch]! - a[ch]!) * f;
  }
}
export interface AnimationEvent { name: AnimationEventName; action?: ActionName }

export class HamsterAnimator {
  readonly pose = restPose();
  state: LocomotionState = 'IDLE';
  private target = restPose();
  private previous: MotionMode = 'ground';
  private transitionTime = 0;
  private time = 0; private stride = 0; private lastSpeed = 0; private accel = 0;
  private act: { name: ActionName; t: number; def: ActionDefinition; fired: number } | null = null;
  private actionWeight = 0;
  private readonly actionPose: Partial<Record<Channel, number>> = {};
  /** Events of the last update (cleared each update; read them right after). */
  readonly events: AnimationEvent[] = [];
  get action(): ActionName | null { return this.act?.name ?? null; }
  /** True while an action can show an object in the paws (any action, outside the ball). The
   * character decides which object (tool, seed bag or nothing); `def.tool` says whether the action
   * uses the equipped tool when none is given. */
  get toolOut(): boolean { return !!this.act && this.state !== 'ROLL_LOOP' && this.state !== 'ROLL_ENTER'; }
  /** Starts an action (restarts it if already running). Refused while rolling or gliding. */
  play(name: ActionName): boolean {
    if (this.state.startsWith('ROLL') || this.state.startsWith('GLIDE') || this.state === 'SWIM') return false;
    this.act = { name, t: 0, def: ACTION_DEFS[name], fired: 0 }; return true;
  }
  stop(name?: ActionName) { if (!name || this.act?.name === name) this.act = null; }
  private emit(name: AnimationEventName, action?: ActionName) { this.events.push(action ? { name, action } : { name }); }
  private locomotion(input: HamsterInput) {
    const mode = input.mode;
    if (mode !== this.previous) {
      const was = this.previous;
      this.state = mode === 'roll' ? 'ROLL_ENTER' : was === 'roll' ? 'ROLL_EXIT'
        : mode === 'glide' ? 'GLIDE_OPEN' : was === 'glide' ? 'GLIDE_CLOSE'
        : mode === 'ground' && was === 'air' ? 'LAND'
        : mode === 'air' && input.verticalSpeed > 0 && (was === 'ground' || was === 'climb') ? 'JUMP' : this.state;
      if (mode === 'roll') this.emit('roll-start'); if (was === 'roll') this.emit('roll-stop');
      if (mode === 'glide') this.emit('glide-open'); if (was === 'glide') this.emit('glide-close');
      if (this.state === 'LAND') this.emit('land'); if (this.state === 'JUMP') this.emit('jump');
      this.previous = mode; this.transitionTime = 0;
      if (mode === 'roll' || mode === 'glide' || mode === 'swim' || mode === 'dive') this.act = null;
    }
    const pending = (s: LocomotionState) => this.state === s && this.transitionTime < TRANSITIONS[s as keyof typeof TRANSITIONS];
    if (pending('ROLL_ENTER') || pending('ROLL_EXIT') || pending('GLIDE_OPEN') || pending('GLIDE_CLOSE') || pending('JUMP') || pending('LAND')) return;
    this.state = input.aboard ? 'BOAT' : mode === 'roll' ? 'ROLL_LOOP' : mode === 'glide' ? 'GLIDE_LOOP' : mode === 'swim' || mode === 'dive' ? 'SWIM' : mode === 'climb' ? 'CLIMB'
      : mode === 'air' ? (input.verticalSpeed > 0 ? 'JUMP' : 'FALL') : input.speed < .3 ? 'IDLE' : input.speed > 6 ? 'RUN' : 'WALK';
  }
  update(input: HamsterInput, delta: number): HamsterPose {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .1)) : 0, speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
    this.events.length = 0; this.time += dt; this.transitionTime += dt;
    this.accel += (((speed - this.lastSpeed) / Math.max(dt, 1e-3)) - this.accel) * Math.min(1, dt * 6); this.lastSpeed = speed;
    this.locomotion(input);
    const p = this.target, t = this.time, s = this.state;
    for (const ch of CHANNELS) p[ch] = ch === 'squash' ? 1 : 0;
    this.stride += dt * (s === 'SWIM' ? 5 : Math.max(3.5, speed * 2.4));
    const st = Math.sin(this.stride);
    p.earL = Math.sin(t * 1.7) * .05; p.earR = Math.sin(t * 1.7 + .9) * .05; p.tailX = Math.sin(t * 2.2) * .1;
    const lean = Math.max(-.2, Math.min(.2, this.accel * .025)), bank = Math.max(-.3, Math.min(.3, -input.turnRate * speed * .03));
    switch (s) {
      case 'IDLE': p.squash = 1 + Math.sin(t * 2.4) * .018; p.headRY = Math.sin(t * .5) * .12; p.headRX = Math.sin(t * .8) * .04; break;
      case 'WALK': case 'RUN': { const run = s === 'RUN';
        p.bodyY = Math.abs(st) * (run ? .07 : .035); p.bodyRX = (run ? .12 : .04) + lean; p.bodyRZ = bank + st * (run ? .05 : .03);
        p.shoulderLX = st * (run ? .7 : .45); p.shoulderRX = -p.shoulderLX; p.hipLX = -st * (run ? .8 : .5); p.hipRX = -p.hipLX; p.earL += run ? -.25 : -.08; p.earR = p.earL; break; }
      case 'ROLL_ENTER': case 'ROLL_LOOP': case 'ROLL_EXIT': {
        const f = s === 'ROLL_ENTER' ? smooth(Math.min(1, this.transitionTime / TRANSITIONS.ROLL_ENTER)) : s === 'ROLL_EXIT' ? 1 - smooth(Math.min(1, this.transitionTime / TRANSITIONS.ROLL_EXIT)) : 1;
        p.tuck = f; p.squash = 1 - .06 * f; p.headRX = .35 * f; p.earL = p.earR = -.5 * f; p.shoulderLX = p.shoulderRX = -.6 * f; p.hipLX = p.hipRX = .7 * f; p.bodyRZ = bank * .6; break; }
      case 'JUMP': p.squash = this.transitionTime < .08 ? .9 : 1.06; p.shoulderLZ = -.5; p.shoulderRZ = .5; p.hipLX = p.hipRX = .5; p.earL = p.earR = -.2; break;
      case 'FALL': p.shoulderLZ = -.9; p.shoulderRZ = .9; p.shoulderLX = p.shoulderRX = -.4; p.hipLX = p.hipRX = -.3; p.earL = p.earR = .25; p.squash = 1.04; break;
      case 'LAND': p.squash = 1 - .14 * Math.sin(Math.PI * Math.min(1, this.transitionTime / TRANSITIONS.LAND)); p.hipLX = p.hipRX = .4; break;
      case 'GLIDE_OPEN': case 'GLIDE_LOOP': case 'GLIDE_CLOSE': {
        const f = s === 'GLIDE_OPEN' ? smooth(Math.min(1, this.transitionTime / TRANSITIONS.GLIDE_OPEN)) : s === 'GLIDE_CLOSE' ? 1 - smooth(Math.min(1, this.transitionTime / TRANSITIONS.GLIDE_CLOSE)) : 1;
        p.membrane = f; p.shoulderLZ = -1.35 * f; p.shoulderRZ = 1.35 * f; p.shoulderLX = p.shoulderRX = -.35 * f; p.hipLX = p.hipRX = -.6 * f;
        p.bodyRX = .5 * f; p.bodyRZ = bank * 1.6; p.headRX = -.35 * f; p.earL = p.earR = .3 * f; p.squash = 1 - .05 * f; break; }
      case 'SWIM': p.bodyRX = .35; p.bodyY = Math.sin(t * 3) * .03; p.shoulderLX = st * .8 - .5; p.shoulderRX = -st * .8 - .5; p.hipLX = -st * .6; p.hipRX = st * .6; p.headRX = -.3; break;
      case 'CLIMB': { const r = speed > .15 || Math.abs(input.verticalSpeed) > .15 ? st : Math.sin(t * 1.4) * .15;
        p.bodyRX = -.25; p.shoulderLX = -2.4 + r * .45; p.shoulderRX = -2.4 - r * .45; p.hipLX = -.4 - r * .4; p.hipRX = -.4 + r * .4; p.headRX = -.2; break; }
      case 'BOAT': p.bodyY = -.06; p.hipLX = p.hipRX = -1.2; p.squash = .96; p.shoulderLX = p.shoulderRX = -.5; break;
    }
    // Action layer: blended in/out, timed events.
    if (this.act) {
      const a = this.act; a.t += dt; let u = a.t / a.def.duration;
      for (; a.fired < a.def.events.length && a.def.events[a.fired].at <= Math.min(u, 1); a.fired++) this.emit(a.def.events[a.fired].name, a.name);
      if (u >= 1) { if (a.def.loop) { a.t %= a.def.duration; a.fired = 0; u = a.t / a.def.duration; } else this.act = null; }
      if (this.act) { for (const k of Object.keys(this.actionPose)) delete this.actionPose[k as Channel]; sample(a.def.keys, Math.min(1, u), this.actionPose); }
    }
    this.actionWeight += ((this.act ? 1 : 0) - this.actionWeight) * Math.min(1, dt * 18);
    if (this.actionWeight > .001) for (const [ch, v] of Object.entries(this.actionPose) as [Channel, number][]) p[ch] += (v - p[ch]) * this.actionWeight;
    // Blend toward the target; rolling angle integrates distance (independent visual rotation).
    const blend = 1 - Math.exp(-dt * 16);
    for (const ch of CHANNELS) this.pose[ch] += (p[ch] - this.pose[ch]) * (ch === 'membrane' || ch === 'tuck' ? Math.min(1, blend * 1.4) : blend);
    // Rolling: forward spin integrates distance; afterwards it settles on the nearest full turn.
    if (s.startsWith('ROLL') && s !== 'ROLL_EXIT') this.pose.roll += speed * dt / ROLL_RADIUS;
    else { const turn = Math.PI * 2, rest = Math.round(this.pose.roll / turn) * turn; this.pose.roll += (rest - this.pose.roll) * Math.min(1, dt * 10); }
    if (input.mode !== 'glide' && s !== 'GLIDE_CLOSE') this.pose.membrane = Math.min(this.pose.membrane, Math.max(0, this.pose.membrane - dt * 8));
    return this.pose;
  }
}
