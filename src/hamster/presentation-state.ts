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
import {FLIGHT_SKINS,type FlightSkin} from '../gameplay/flight-progress.ts';

export interface PlayerPresentationState {
  v: 1;
  /** Simulation time (s) of the sample, for interpolation. */ t: number;
  x: number; y: number; z: number; yaw: number;
  mode: MotionMode; speed: number; verticalSpeed: number; turnRate: number; aboard: boolean;
  action: ActionName | null; actionSeq: number; tool: ToolId | null;
  /** Optional V1 extension: continuous motion phases and visual context; legacy packets remain valid. */
  stridePhase?:number;rollPhase?:number;turnIntent?:number;
  jumpKind?:'idle'|'run'|'roll';landingSpeed?:number;
  /** Optional monotone simulation events; remote render can miss intermediate air/ground frames. */
  jumpSeq?:number;landingSeq?:number;
  groundPitch?:number;groundRoll?:number;rollSlip?:number;
  landingKind?:'idle'|'run'|'roll'|'glide';landingSlide?:number;
  footSupportLeft?:number;footSupportRight?:number;
  gasBoosting?:boolean;gasPulseSeq?:number;gasSkinId?:FlightSkin;gasSoundId?:FlightSkin;
  /** Optional glider presentation cues (render only, never flight authority). */
  glideStalled?:boolean;glideBrake?:number;glidePitch?:number;glideTurnRate?:number;
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
  for(const key of ['stridePhase','rollPhase','turnIntent','landingSpeed'] as const)
    if(s[key]!==undefined&&!finite(s[key],1e8))throw Error('Cue invalide : '+key);
  if(s.jumpKind!==undefined&&!['idle','run','roll'].includes(s.jumpKind))throw Error('Type de saut invalide');
  for(const key of ['jumpSeq','landingSeq'] as const)
    if(s[key]!==undefined&&(!Number.isSafeInteger(s[key])||s[key]!<0))throw Error('Séquence de mouvement invalide : '+key);
  if(s.gasBoosting!==undefined&&typeof s.gasBoosting!=='boolean')throw Error('Drapeau de propulsion invalide');
  if(s.glideStalled!==undefined&&typeof s.glideStalled!=='boolean')throw Error('Drapeau de décrochage invalide');
  for(const key of ['glideBrake','glidePitch','glideTurnRate'] as const){
    if(s[key]!==undefined&&(!finite(s[key],3)||key==='glideBrake'&&(s[key]!<0||s[key]!>1)))throw Error('Cue de planeur invalide : '+key);
  }
  if(s.gasPulseSeq!==undefined&&(!Number.isSafeInteger(s.gasPulseSeq)||s.gasPulseSeq<0))throw Error('Séquence de propulsion invalide');
  if(s.gasSkinId!==undefined&&!FLIGHT_SKINS.includes(s.gasSkinId))throw Error('Skin de propulsion invalide');
  if(s.gasSoundId!==undefined&&!FLIGHT_SKINS.includes(s.gasSoundId))throw Error('Son de propulsion invalide');
  if(s.landingKind!==undefined&&!['idle','run','roll','glide'].includes(s.landingKind))throw Error('Type de réception invalide');
  if(s.landingSlide!==undefined&&(!finite(s.landingSlide,1)||s.landingSlide<0))throw Error('Glissade invalide');
  for(const key of ['footSupportLeft','footSupportRight'] as const)
    if(s[key]!==undefined&&!finite(s[key],.5))throw Error('Appui pied invalide : '+key);
  for(const key of ['groundPitch','groundRoll','rollSlip'] as const)
    if(s[key]!==undefined&&(!finite(s[key],1)||Math.abs(s[key]!)>1))throw Error('Cue de surface invalide : '+key);
  return { v: 1, t: s.t, x: s.x, y: s.y, z: s.z, yaw: s.yaw, mode: s.mode, speed: s.speed, verticalSpeed: s.verticalSpeed, turnRate: s.turnRate, aboard: s.aboard, action: s.action, actionSeq: s.actionSeq, tool: s.tool, fishing: s.fishing ? { ...s.fishing } : null,
    ...(s.stridePhase!==undefined?{stridePhase:s.stridePhase}:{}),
    ...(s.rollPhase!==undefined?{rollPhase:s.rollPhase}:{}),
    ...(s.turnIntent!==undefined?{turnIntent:s.turnIntent}:{}),
    ...(s.jumpKind!==undefined?{jumpKind:s.jumpKind}:{}),
    ...(s.jumpSeq!==undefined?{jumpSeq:s.jumpSeq}:{}),
    ...(s.landingSeq!==undefined?{landingSeq:s.landingSeq}:{}),
    ...(s.landingSpeed!==undefined?{landingSpeed:s.landingSpeed}:{}),
    ...(s.groundPitch!==undefined?{groundPitch:s.groundPitch}:{}),
    ...(s.groundRoll!==undefined?{groundRoll:s.groundRoll}:{}),
    ...(s.rollSlip!==undefined?{rollSlip:s.rollSlip}:{}),
    ...(s.glideStalled!==undefined?{glideStalled:s.glideStalled}:{}),
    ...(s.glideBrake!==undefined?{glideBrake:s.glideBrake}:{}),
    ...(s.glidePitch!==undefined?{glidePitch:s.glidePitch}:{}),
    ...(s.glideTurnRate!==undefined?{glideTurnRate:s.glideTurnRate}:{}),
    ...(s.gasBoosting!==undefined?{gasBoosting:s.gasBoosting}:{}),
    ...(s.gasPulseSeq!==undefined?{gasPulseSeq:s.gasPulseSeq}:{}),
    ...(s.gasSkinId!==undefined?{gasSkinId:s.gasSkinId}:{}),
    ...(s.gasSoundId!==undefined?{gasSoundId:s.gasSoundId}:{}),
    ...(s.landingKind!==undefined?{landingKind:s.landingKind}:{}),
    ...(s.landingSlide!==undefined?{landingSlide:s.landingSlide}:{}),
    ...(s.footSupportLeft!==undefined?{footSupportLeft:s.footSupportLeft}:{}),
    ...(s.footSupportRight!==undefined?{footSupportRight:s.footSupportRight}:{}) };
}
/** Linear interpolation of two samples (angles by the shortest path; discrete fields from `b`). */
export function interpolatePresentation(a: PlayerPresentationState, b: PlayerPresentationState, time: number): PlayerPresentationState {
  const u = b.t > a.t ? Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t))) : 1, l = (p: number, q: number) => p + (q - p) * u;
  const dyaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  return { ...b, t: time, x: l(a.x, b.x), y: l(a.y, b.y), z: l(a.z, b.z), yaw: a.yaw + dyaw * u, speed: l(a.speed, b.speed), verticalSpeed: l(a.verticalSpeed, b.verticalSpeed), turnRate: l(a.turnRate, b.turnRate),
    ...(a.stridePhase!==undefined&&b.stridePhase!==undefined?{stridePhase:l(a.stridePhase,b.stridePhase)}:{}),
    ...(a.rollPhase!==undefined&&b.rollPhase!==undefined?{rollPhase:l(a.rollPhase,b.rollPhase)}:{}),
    ...(a.groundPitch!==undefined&&b.groundPitch!==undefined?{groundPitch:l(a.groundPitch,b.groundPitch)}:{}),
    ...(a.groundRoll!==undefined&&b.groundRoll!==undefined?{groundRoll:l(a.groundRoll,b.groundRoll)}:{}),
    ...(a.rollSlip!==undefined&&b.rollSlip!==undefined?{rollSlip:l(a.rollSlip,b.rollSlip)}:{}),
    ...(a.landingSlide!==undefined&&b.landingSlide!==undefined?{landingSlide:l(a.landingSlide,b.landingSlide)}:{}),
    ...(a.glideBrake!==undefined&&b.glideBrake!==undefined?{glideBrake:l(a.glideBrake,b.glideBrake)}:{}),
    ...(a.glidePitch!==undefined&&b.glidePitch!==undefined?{glidePitch:l(a.glidePitch,b.glidePitch)}:{}),
    ...(a.glideTurnRate!==undefined&&b.glideTurnRate!==undefined?{glideTurnRate:l(a.glideTurnRate,b.glideTurnRate)}:{}),
    ...(a.footSupportLeft!==undefined&&b.footSupportLeft!==undefined?{footSupportLeft:l(a.footSupportLeft,b.footSupportLeft)}:{}),
    ...(a.footSupportRight!==undefined&&b.footSupportRight!==undefined?{footSupportRight:l(a.footSupportRight,b.footSupportRight)}:{}) };
}
