/** Capybara non-locomotion presentation state. Pure, deterministic and allocation-light. */
export const CAPYBARA_STATES = ['idle', 'walk', 'follow', 'rest', 'sleep', 'wake'] as const;
export type CapybaraState = typeof CAPYBARA_STATES[number];
export interface CapybaraPose {
  state: CapybaraState;
  time: number;
  roll: number;
  lower: number;
  headYaw: number;
  headPitch: number;
  breathing: number;
  eyesClosed: number;
  walkWeight: number;
}
export interface CapybaraPoseInput {
  dt: number;
  speed: number;
  state: CapybaraState;
  /** target relative to forward +X, in radians; clamped to +/- 0.55 rad. */
  lookYaw?: number;
  /** target pitch in radians, clamped to +/- 0.24 rad. */
  lookPitch?: number;
}
const clamp = (n:number, a:number,b:number) => Math.min(b, Math.max(a,n));
const damping = (current:number,target:number,rate:number,dt:number) =>
  current+(target-current)*(1-Math.exp(-rate*dt));
export function initialCapybaraPose(): CapybaraPose {
  return {state:'idle',time:0,roll:0,lower:0,headYaw:0,headPitch:0,breathing:0,eyesClosed:0,walkWeight:0};
}
/** Animator does not modify physics. Rest and sleep are side-lying visual previews
 * using a body lean; articulated hind legs, ground contact and eye geometry need a rig.
 */
export function advanceCapybaraPose(pose:CapybaraPose,input:CapybaraPoseInput):CapybaraPose {
  const dt = Number.isFinite(input.dt) ? clamp(input.dt,0,.1):0;
  const speed = Number.isFinite(input.speed)?Math.abs(input.speed):0;
  // Gameplay should forbid actual movement during rest/sleep; enforce visual standing if moving.
  const state:CapybaraState = speed>.12 && (input.state==='rest'||input.state==='sleep')
    ? 'walk' : input.state;
  const lying = state==='rest'||state==='sleep';
  const headTrack = state==='follow'||state==='idle'||state==='walk';
  const yaw = headTrack && Number.isFinite(input.lookYaw) ? clamp(input.lookYaw!,-.55,.55):0;
  const pitch = headTrack && Number.isFinite(input.lookPitch) ? clamp(input.lookPitch!,-.24,.24):0;
  const t = pose.time+dt;
  const blink = state==='sleep'?1:(state==='rest'?.5:0);
  return {
    state, time:t,
    roll:damping(pose.roll,lying?1.12:0,3.2,dt),
    lower:damping(pose.lower,lying?.47:0,3.2,dt),
    headYaw:damping(pose.headYaw,yaw,5.4,dt),
    headPitch:damping(pose.headPitch,pitch,5.4,dt),
    breathing:Math.sin(t*(state==='sleep'?1.5:2.6))*(lying?.016:.007),
    eyesClosed:damping(pose.eyesClosed,blink,5,dt),
    walkWeight:damping(pose.walkWeight,lying?0:Math.min(1,speed/.2),8,dt),
  };
}
