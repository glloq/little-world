/** Hamster player character (doc 43): rig (hamster-model) + state machines (hamster-animation)
 * + tools + fishing line, behind the same surface the game used for the squirrel. The motion
 * state comes from the simulation (player.ts); actions come from gameplay requests; animation
 * events (impact, release, reel, roll-start…) are handed to listeners (audio, effects). Remote
 * characters are driven by applyPresentation() with the same code path (no bone streaming). */
import * as THREE from 'three';
import type { Player } from '../player.ts';
import { CHARACTER_SCALE } from '../squirrel.ts';
import { DEFAULT_APPEARANCE, type Appearance } from '../character-style.ts';
import { buildHamsterRig, BODY_CENTRE, REST, type HamsterRig } from './hamster-model.ts';
import { HamsterAnimator, type ActionName, type AnimationEvent, type HamsterInput, type LocomotionState } from './hamster-animation.ts';
import { createToolHolder, ACTIVITY_ANIMATIONS, type ToolId } from './tools.ts';
import type { PlayerPresentationState } from './presentation-state.ts';

export interface HamsterCharacter {
  group: THREE.Group;
  readonly rig: HamsterRig;
  readonly animationState: LocomotionState;
  readonly action: ActionName | null;
  readonly tool: ToolId | null;
  readonly skeleton: THREE.Skeleton;
  readonly sockets: HamsterRig['sockets'];
  update(player: Player, dt: number, elapsed: number): void;
  setAppearance(appearance: Appearance): void;
  setAboard(aboard: boolean): void;
  /** Plays the animation of a gameplay activity (mine, fell, pick, fish-cast…) or a raw action. */
  play(activityOrAction: string, tool?: ToolId | null): boolean;
  /** Fishing float target (world) and bite state, or null when the line is in. */
  setFishing(f: { x: number; y: number; z: number; biting: boolean } | null): void;
  onEvent(listener: (e: AnimationEvent & { position: THREE.Vector3 }) => void): () => void;
  /** Compact state for a future replication layer (see presentation-state.ts). */
  presentation(t: number): PlayerPresentationState;
  /** Drives this character from a (remote) presentation state. */
  applyPresentation(s: PlayerPresentationState, dt: number): void;
  dispose(): void;
}
const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf4f1e8 });
const bobberGeometry = new THREE.IcosahedronGeometry(.07, 0), bobberMaterial = new THREE.MeshLambertMaterial({ color: 0xe0463c, flatShading: true });

export function buildHamster(): HamsterCharacter {
  const rig = buildHamsterRig(), j = rig.joints, animator = new HamsterAnimator(), tools = createToolHolder(rig);
  rig.group.scale.setScalar(CHARACTER_SCALE);
  const listeners = new Set<(e: AnimationEvent & { position: THREE.Vector3 }) => void>();
  let facing = 0, lastFacing = 0, aboard = false, actionTool: ToolId | null = null, actionSeq = 0, fishing: { x: number; y: number; z: number; biting: boolean } | null = null, disposed = false;
  let appearance = { ...DEFAULT_APPEARANCE } as Appearance;
  // Fishing line (2 points) and float, only shown while the line is out.
  const linePositions = new Float32Array(6), lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const line = new THREE.Line(lineGeometry, lineMaterial); line.frustumCulled = false; line.visible = false; line.name = 'FishingLine';
  const bobber = new THREE.Mesh(bobberGeometry, bobberMaterial); bobber.visible = false; bobber.name = 'FishingFloat';
  const extras = new THREE.Group(); extras.name = 'HamsterWorldExtras'; extras.add(line, bobber);
  const group = new THREE.Group(); group.name = 'PlayerHamster'; group.add(rig.group, extras);
  const tmp = new THREE.Vector3(), tip = new THREE.Vector3(), input: HamsterInput = { mode: 'ground', speed: 0, verticalSpeed: 0, turnRate: 0 };
  const base = { earL: j.EarLeft.rotation.z, earR: j.EarRight.rotation.z };
  function applyAppearance() {
    for (const [emotion, face] of Object.entries(rig.faces)) face.visible = emotion === appearance.emotion;
    const tucked = animator.pose.tuck > .5;
    rig.accessories.hat.visible = appearance.hat && !tucked; rig.accessories.goggles.visible = !!appearance.goggles && !tucked && !appearance.hat;
    rig.accessories.backpack.visible = appearance.backpack && !tucked;
    rig.accessories.scarf.visible = appearance.neckwear === 'scarf'; rig.accessories.pendant.visible = appearance.neckwear === 'pendant';
  }
  function pose(dt: number, elapsed: number) {
    const p = animator.update(input, dt);
    j.HamsterBody.position.set(0, BODY_CENTRE + p.bodyY - (1 - p.squash) * BODY_CENTRE * .5, 0);
    // Rolling spin (settles on a whole turn after the roll, i.e. upright).
    j.HamsterBody.rotation.set(p.bodyRX + p.roll, p.bodyRY, p.bodyRZ);
    const sq = p.squash, side = 1 / Math.sqrt(sq); j.HamsterBody.scale.set(side, sq, side);
    j.Head.rotation.set(p.headRX, p.headRY, p.headRZ);
    j.EarLeft.rotation.z = base.earL + p.earL; j.EarRight.rotation.z = base.earR - p.earR;
    j.ShoulderLeft.rotation.set(p.shoulderLX, 0, p.shoulderLZ); j.ShoulderRight.rotation.set(p.shoulderRX, 0, p.shoulderRZ);
    j.HipLeft.rotation.x = p.hipLX; j.HipRight.rotation.x = p.hipRX; j.Tail.rotation.x = p.tailX;
    // Roll: paws retract into the ball (scaled down and pulled toward the centre).
    const limb = 1 - .85 * p.tuck;
    for (const name of ['ArmLeft', 'ArmRight', 'FootLeft', 'FootRight'] as const) j[name].scale.setScalar(limb);
    for (const name of ['HipLeft', 'HipRight'] as const) { const r = REST[name]; j[name].position.set(r[0] * (1 - .4 * p.tuck), r[1] * (1 - .5 * p.tuck), r[2] * (1 - .4 * p.tuck)); }
    rig.setMembranes(p.membrane);
    rig.shadow.visible = input.mode === 'ground' || input.mode === 'roll';
    applyAppearance();
    // Tool: shown by actions that use one, and while the fishing line is out.
    const want: ToolId | null = animator.toolOut ? actionTool : fishing ? 'fishing-rod' : null;
    tools.show(want);
    group.updateMatrixWorld(true);
    if (fishing && tools.rodTip(tip)) {
      const bob = fishing.biting ? -.12 + Math.sin(elapsed * 22) * .05 : Math.sin(elapsed * 2.4) * .03;
      // The line and float live in this character's group: world points → group frame.
      const o = group.position; bobber.position.set(fishing.x - o.x, fishing.y + .03 + bob - o.y, fishing.z - o.z); bobber.visible = true;
      linePositions.set([tip.x - o.x, tip.y - o.y, tip.z - o.z, fishing.x - o.x, fishing.y + .06 + bob - o.y, fishing.z - o.z]); lineGeometry.getAttribute('position').needsUpdate = true; lineGeometry.computeBoundingSphere(); line.visible = true;
    } else { line.visible = false; bobber.visible = false; }
    for (const e of animator.events) { const at = tools.head(tmp) ?? j.HandRight.getWorldPosition(tmp); for (const l of listeners) l({ ...e, position: at }); }
  }
  function face(dx: number, dz: number, dt: number, rate = 9) {
    if (Math.hypot(dx, dz) < 1e-6) return;
    const desired = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(desired - facing), Math.cos(desired - facing));
    facing += delta * Math.min(1, dt * rate);
  }
  const character: HamsterCharacter = {
    group, rig,
    get animationState() { return animator.state; }, get action() { return animator.action; }, get tool() { return tools.current; },
    skeleton: rig.skeleton, sockets: rig.sockets,
    update(player, dt, elapsed) {
      if (disposed) return;
      const v = player.velocity, speed = Math.hypot(v.x, v.z);
      if (player.mode === 'climb' && player.climbDir) face(player.climbDir.x, player.climbDir.z, dt, 14);
      else if (speed > .4) face(v.x, v.z, dt, player.mode === 'roll' ? 4 : 9);
      rig.group.rotation.y = facing;
      const turn = dt > 0 ? Math.atan2(Math.sin(facing - lastFacing), Math.cos(facing - lastFacing)) / dt : 0; lastFacing = facing;
      input.mode = player.mode; input.speed = speed; input.verticalSpeed = v.y; input.turnRate = turn; input.aboard = aboard;
      if (fishing && !animator.action && animator.play('FISH_WAIT')) actionTool = 'fishing-rod';
      pose(dt, elapsed);
    },
    setAppearance(a) { appearance = { ...a }; applyAppearance(); },
    setAboard(b) { aboard = b; },
    play(activityOrAction, tool) {
      const preset = ACTIVITY_ANIMATIONS[activityOrAction], action = (preset?.action ?? activityOrAction) as ActionName;
      if (!animator.play(action)) return false;
      actionTool = tool !== undefined ? tool : preset?.tool ?? null; actionSeq++; return true;
    },
    setFishing(f) { if (!f && fishing && animator.action === 'FISH_WAIT') animator.stop('FISH_WAIT'); fishing = f ? { ...f } : null; },
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    presentation(t) {
      const w = rig.group.getWorldPosition(tmp);
      return { v: 1, t, x: w.x, y: w.y, z: w.z, yaw: facing, mode: input.mode as PlayerPresentationState['mode'], speed: input.speed, verticalSpeed: input.verticalSpeed, turnRate: input.turnRate, aboard, action: animator.action, actionSeq, tool: animator.toolOut ? actionTool : fishing ? 'fishing-rod' : null, fishing: fishing ? { ...fishing } : null };
    },
    applyPresentation(s, dt) {
      if (disposed) return;
      group.position.set(s.x, s.y, s.z); facing = s.yaw; rig.group.rotation.y = facing; lastFacing = facing;
      if (s.actionSeq !== actionSeq && s.action) { actionSeq = s.actionSeq; animator.play(s.action); actionTool = s.tool; }
      fishing = s.fishing ? { ...s.fishing } : null; aboard = s.aboard;
      input.mode = s.mode; input.speed = s.speed; input.verticalSpeed = s.verticalSpeed; input.turnRate = s.turnRate; input.aboard = s.aboard;
      if (fishing && !animator.action && animator.play('FISH_WAIT')) actionTool = 'fishing-rod';
      pose(dt, s.t);
    },
    dispose() { if (disposed) return; disposed = true; listeners.clear(); tools.dispose(); lineGeometry.dispose(); rig.dispose(); group.removeFromParent(); },
  };
  return character;
}
