import type { MotionMode } from './player.ts';

/** Visual state is derived from locomotion; it never changes physical state. */
export type CharacterAnimation =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'rise'
  | 'fall'
  | 'deploy'
  | 'glide'
  | 'fold'
  | 'land'
  | 'swim'
  | 'dive'
  | 'ascend'
  | 'climb';
export interface AnimationInput {
  mode: MotionMode;
  speed: number;
  verticalSpeed: number;
}
export interface CharacterPose {
  bodyY: number;
  bodyX: number;
  bodyZ: number;
  headX: number;
  headY: number;
  headZ: number;
  armLX: number;
  armRX: number;
  armLZ: number;
  armRZ: number;
  legLX: number;
  legRX: number;
  tailX: number;
  tailZ: number;
  tailTipX: number;
  earL: number;
  earR: number;
  membrane: number;
}
function restPose(): CharacterPose {
  return {
    bodyY: 0,
    bodyX: 0,
    bodyZ: 0,
    headX: 0,
    headY: 0,
    headZ: 0,
    armLX: 0,
    armRX: 0,
    armLZ: 0,
    armRZ: 0,
    legLX: 0,
    legRX: 0,
    tailX: 0,
    tailZ: 0,
    tailTipX: 0,
    earL: 0,
    earR: 0,
    membrane: 0,
  };
}
const poseKeys = Object.keys(restPose()) as (keyof CharacterPose)[];

/** Small allocation-free pose mixer for a rigid low-poly joint rig.
 * One phase clock keeps limb cycles continuous across walk/run transitions.
 */
export class CharacterAnimator {
  readonly pose = restPose();
  state: CharacterAnimation = 'idle';
  private target = restPose();
  private previousMode: MotionMode = 'ground';
  private transitionTime = 0;
  private transition: 'jump' | 'land' | 'deploy' | 'fold' | null = null;
  private time = 0;
  private stridePhase = 0;

  update(input: AnimationInput, delta: number): CharacterPose {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
    this.time += dt;
    this.stridePhase +=
      dt *
      (input.mode === 'swim' || input.mode === 'dive'
        ? 5.5
        : Math.max(3, speed * 1.9));
    if (input.mode !== this.previousMode) {
      this.transition =
        input.mode === 'glide'
          ? 'deploy'
          : this.previousMode === 'glide' && input.mode === 'air'
            ? 'fold'
            : input.mode === 'ground' &&
                (this.previousMode === 'air' || this.previousMode === 'glide')
              ? 'land'
              : this.previousMode === 'ground' &&
                  input.mode === 'air' &&
                  input.verticalSpeed > 0
                ? 'jump'
                : null;
      this.transitionTime = 0;
      this.previousMode = input.mode;
    } else this.transitionTime += dt;
    const duration =
      this.transition === 'deploy'
        ? 0.24
        : this.transition === 'land'
          ? 0.2
          : 0.14;
    if (this.transitionTime >= duration) this.transition = null;
    this.state =
      input.mode === 'climb'
        ? 'climb'
        : input.mode === 'ground'
        ? this.transition === 'land'
          ? 'land'
          : speed < 0.4
            ? 'idle'
            : speed > 6
              ? 'run'
              : 'walk'
        : input.mode === 'glide'
          ? this.transition === 'deploy'
            ? 'deploy'
            : 'glide'
          : input.mode === 'swim'
            ? 'swim'
            : input.mode === 'dive'
              ? input.verticalSpeed > 0.4
                ? 'ascend'
                : 'dive'
              : this.transition === 'jump'
                ? 'jump'
                : this.transition === 'fold'
                  ? 'fold'
                  : input.verticalSpeed > 0
                    ? 'rise'
                    : 'fall';
    const p = this.target,
      t = this.time,
      stride = Math.sin(this.stridePhase);
    for (const key of poseKeys) p[key] = 0;
    p.tailX = Math.sin(t * 2.5) * 0.07;
    p.tailZ = Math.sin(t * 1.7) * 0.045;
    p.tailTipX = Math.sin(t * 2.5 - 0.7) * 0.06;
    p.earL = Math.sin(t * 1.8) * 0.025;
    p.earR = Math.sin(t * 1.8 + 0.8) * 0.025;
    if (this.state === 'idle') {
      p.bodyY = Math.sin(t * 2) * 0.018;
      p.headY = Math.sin(t * 0.6) * 0.07;
      p.headX = Math.sin(t * 0.9) * 0.025;
    } else if (this.state === 'walk' || this.state === 'run') {
      const running = this.state === 'run';
      p.bodyY = Math.abs(stride) * (running ? 0.09 : 0.045);
      p.bodyX = running ? 0.11 : 0.03;
      p.armLX = stride * 0.48;
      p.armRX = -stride * 0.48;
      p.legLX = -stride * (running ? 0.55 : 0.32);
      p.legRX = -p.legLX;
      p.headZ = stride * 0.018;
      p.tailX += running ? 0.17 : 0.05;
    } else if (this.state === 'land') {
      p.bodyY = -0.13 * Math.sin((Math.PI * this.transitionTime) / 0.2);
      p.legLX = 0.35;
      p.legRX = 0.35;
      p.headX = 0.08;
    } else if (input.mode === 'glide') {
      p.bodyY = 0.08;
      p.bodyX = -0.11;
      p.bodyZ = -Math.sin(t * 0.9) * 0.065;
      p.armLZ = 0.93;
      p.armRZ = -0.93;
      p.legLX = -0.18;
      p.legRX = -0.18;
      p.headX = 0.05;
      p.headZ = Math.sin(t * 0.75) * 0.035;
      p.tailX += 0.24;
      p.membrane = 1;
    } else if (input.mode === 'climb') {
      // Upright against the wall, paws reaching up alternately, hind legs pushing.
      const moving = speed > 0.15 || Math.abs(input.verticalSpeed) > 0.15;
      const reach = moving ? stride : Math.sin(t * 1.4) * 0.15;
      p.bodyX = -0.28;
      p.bodyY = Math.abs(reach) * 0.04;
      p.armLX = -1.85 + reach * 0.45;
      p.armRX = -1.85 - reach * 0.45;
      p.armLZ = 0.28;
      p.armRZ = -0.28;
      p.legLX = -0.25 - reach * 0.4;
      p.legRX = -0.25 + reach * 0.4;
      p.headX = -0.18;
      p.tailX += 0.35;
    } else if (input.mode === 'swim' || input.mode === 'dive') {
      p.bodyX =
        input.mode === 'swim' ? 0.58 : this.state === 'ascend' ? -0.36 : 0.88;
      p.bodyY = Math.sin(t * 3) * 0.03;
      p.headX = -0.22;
      p.armLX = stride * 0.65;
      p.armRX = -stride * 0.65;
      p.armLZ = 0.23;
      p.armRZ = -0.23;
      p.legLX = -stride * 0.38;
      p.legRX = stride * 0.38;
      p.tailX += 0.3;
    } else {
      const rising = input.verticalSpeed > 0;
      p.bodyX = rising ? -0.12 : 0.12;
      p.armLZ = 0.35;
      p.armRZ = -0.35;
      p.legLX = rising ? 0.5 : -0.18;
      p.legRX = rising ? 0.5 : -0.18;
      p.tailX += rising ? -0.1 : 0.22;
    }
    const blend = 1 - Math.exp(-dt * 14);
    for (const key of poseKeys)
      this.pose[key] += (p[key] - this.pose[key]) * blend;
    // A folded membrane must never linger visibly on the ground or in water.
    if (input.mode !== 'glide') this.pose.membrane = 0;
    return this.pose;
  }
}
