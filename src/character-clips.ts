import * as THREE from 'three';
import {
  CharacterAnimator,
  type AnimationInput,
  type CharacterPose,
} from './character-animation.ts';

const definitions: {
  name: string;
  duration: number;
  input: AnimationInput;
  warmup?: AnimationInput;
}[] = [
  {
    name: 'idle',
    duration: Math.PI,
    input: { mode: 'ground', speed: 0, verticalSpeed: 0 },
  },
  {
    name: 'walk',
    duration: (2 * Math.PI) / 7.6,
    input: { mode: 'ground', speed: 4, verticalSpeed: 0 },
  },
  {
    name: 'run',
    duration: (2 * Math.PI) / 15.2,
    input: { mode: 'ground', speed: 8, verticalSpeed: 0 },
  },
  {
    name: 'jump',
    duration: 0.14,
    input: { mode: 'air', speed: 4, verticalSpeed: 7 },
  },
  {
    name: 'rise',
    duration: 0.6,
    input: { mode: 'air', speed: 4, verticalSpeed: 4 },
    warmup: { mode: 'air', speed: 4, verticalSpeed: 4 },
  },
  {
    name: 'fall',
    duration: 0.6,
    input: { mode: 'air', speed: 4, verticalSpeed: -4 },
  },
  {
    name: 'deploy',
    duration: 0.3,
    input: { mode: 'glide', speed: 10, verticalSpeed: -2 },
  },
  {
    name: 'glide',
    duration: 2,
    input: { mode: 'glide', speed: 10, verticalSpeed: -2 },
    warmup: { mode: 'glide', speed: 10, verticalSpeed: -2 },
  },
  {
    name: 'fold',
    duration: 0.2,
    input: { mode: 'air', speed: 10, verticalSpeed: -2 },
    warmup: { mode: 'glide', speed: 10, verticalSpeed: -2 },
  },
  {
    name: 'land',
    duration: 0.25,
    input: { mode: 'ground', speed: 0, verticalSpeed: 0 },
    warmup: { mode: 'air', speed: 4, verticalSpeed: -4 },
  },
  {
    name: 'swim',
    duration: (2 * Math.PI) / 5.5,
    input: { mode: 'swim', speed: 3, verticalSpeed: 0 },
  },
  {
    name: 'dive',
    duration: (2 * Math.PI) / 5.5,
    input: { mode: 'dive', speed: 3, verticalSpeed: -2 },
  },
  {
    name: 'ascend',
    duration: (2 * Math.PI) / 5.5,
    input: { mode: 'dive', speed: 3, verticalSpeed: 2 },
  },
];

/** Exportable clips sampled from the same pose controller used in the game.
 * Rigid joint animation is intentional; this does not claim weighted skinning.
 */
export function createSquirrelAnimationClips(): THREE.AnimationClip[] {
  const rotations: Record<
    string,
    (p: CharacterPose) => [number, number, number]
  > = {
    SquirrelBody: (p) => [p.bodyX, 0, p.bodyZ],
    HeadJoint: (p) => [p.headX, p.headY, p.headZ],
    ArmLeft: (p) => [p.armLX, 0, p.armLZ],
    ArmRight: (p) => [p.armRX, 0, p.armRZ],
    LegLeft: (p) => [p.legLX, 0, 0],
    LegRight: (p) => [p.legRX, 0, 0],
    TailJoint: (p) => [p.tailX, 0, p.tailZ],
    TailTipJoint: (p) => [p.tailTipX, 0, 0],
    EarLeft: (p) => [0, 0, p.earL],
    EarRight: (p) => [0, 0, -p.earR],
  };
  const quaternion = new THREE.Quaternion(),
    euler = new THREE.Euler();
  return definitions.map((def) => {
    const animator = new CharacterAnimator();
    if (def.warmup)
      for (let i = 0; i < 60; i++) animator.update(def.warmup, 1 / 60);
    const frames = Math.ceil(def.duration * 30),
      times: number[] = [],
      position: number[] = [],
      scale: number[] = [];
    const values = Object.fromEntries(
      Object.keys(rotations).map((name) => [name, [] as number[]]),
    );
    for (let i = 0; i <= frames; i++) {
      const time = (i / frames) * def.duration;
      const pose = animator.update(
        def.input,
        i === 0 ? 0 : def.duration / frames,
      );
      times.push(time);
      position.push(0, pose.bodyY, 0);
      scale.push(
        def.input.mode === 'glide' ? Math.max(0.0001, pose.membrane) : 0.0001,
        1,
        1,
      );
      for (const [name, rotation] of Object.entries(rotations)) {
        const [x, y, z] = rotation(pose);
        euler.set(x, y, z);
        quaternion.setFromEuler(euler);
        values[name].push(
          quaternion.x,
          quaternion.y,
          quaternion.z,
          quaternion.w,
        );
      }
    }
    const tracks: THREE.KeyframeTrack[] = Object.entries(values).map(
      ([name, keys]) =>
        new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, keys),
    );
    tracks.push(
      new THREE.VectorKeyframeTrack('SquirrelBody.position', times, position),
    );
    tracks.push(
      new THREE.VectorKeyframeTrack('MembraneJoint.scale', times, scale),
    );
    return new THREE.AnimationClip(def.name, def.duration, tracks);
  });
}
