/** Compact presentation state of a player character (doc 43, doc 16 compatibility).
 * This is the ONLY data a future network layer would need to show a remote hamster: position,
 * heading, locomotion mode and speeds, current action (with a sequence number so that a remote
 * client plays each one-shot action exactly once), tool, glide/roll flags, fishing float.
 * No bone, no frame of animation, no gameplay authority here: world changes (harvest, mining,
 * fishing rewards) stay validated by the gameplay authority. Pure data + validation; no socket
 * and no network code (AGENTS §1 quater: multiplayer is a later milestone). */
import { MOTION_MODES, type MotionMode } from '../player.ts';
import { ACTIONS, type ActionName } from './hamster-animation.ts';
import { TOOL_IDS, type ToolId } from './tools.ts';

export interface PlayerPresentationState {
  v: 1;
  /** Simulation time (s) of the sample, for interpolation. */ t: number;
  x: number; y: number; z: number; yaw: number;
  mode: MotionMode; speed: number; verticalSpeed: number; turnRate: number; aboard: boolean;
  action: ActionName | null; actionSeq: number; tool: ToolId | null;
  fishing: { x: number; y: number; z: number; biting: boolean } | null;
}
const finite = (v: unknown, lim = 1e6) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
/** Strict validation of an incoming state (untrusted in a future network context). */
export function parsePresentationState(value: unknown): PlayerPresentationState {
  const s = value as PlayerPresentationState;
  if (!s || typeof s !== 'object' || s.v !== 1) throw Error('État de présentation invalide');
  for (const k of ['t', 'x', 'y', 'z', 'yaw', 'speed', 'verticalSpeed', 'turnRate', 'actionSeq'] as const) if (!finite(s[k])) throw Error('Champ invalide : ' + k);
  if (!(MOTION_MODES as readonly string[]).includes(s.mode) || typeof s.aboard !== 'boolean') throw Error('Mode invalide');
  if (s.action !== null && !(ACTIONS as readonly string[]).includes(s.action)) throw Error('Action invalide');
  if (s.tool !== null && !(TOOL_IDS as readonly string[]).includes(s.tool)) throw Error('Outil invalide');
  if (s.fishing !== null && (!s.fishing || !finite(s.fishing.x) || !finite(s.fishing.y) || !finite(s.fishing.z) || typeof s.fishing.biting !== 'boolean')) throw Error('Pêche invalide');
  return { v: 1, t: s.t, x: s.x, y: s.y, z: s.z, yaw: s.yaw, mode: s.mode, speed: s.speed, verticalSpeed: s.verticalSpeed, turnRate: s.turnRate, aboard: s.aboard, action: s.action, actionSeq: s.actionSeq, tool: s.tool, fishing: s.fishing ? { ...s.fishing } : null };
}
/** Linear interpolation of two samples (angles by the shortest path; discrete fields from `b`). */
export function interpolatePresentation(a: PlayerPresentationState, b: PlayerPresentationState, time: number): PlayerPresentationState {
  const u = b.t > a.t ? Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t))) : 1, l = (p: number, q: number) => p + (q - p) * u;
  const dyaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  return { ...b, t: time, x: l(a.x, b.x), y: l(a.y, b.y), z: l(a.z, b.z), yaw: a.yaw + dyaw * u, speed: l(a.speed, b.speed), verticalSpeed: l(a.verticalSpeed, b.verticalSpeed), turnRate: l(a.turnRate, b.turnRate) };
}
