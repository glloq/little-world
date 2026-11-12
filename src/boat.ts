import { clamp, insideWorld, terrainHeight, waterSurface } from './terrain.ts';

/** Fixed-step, render-independent arcade boat controller.
 * Coordinates: bow toward local +Z, steering right turns toward -X to match the camera. */
export interface BoatState {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
}
export interface BoatInput {
  throttle: number;  // -1..1
  steer: number;     // -1 left, +1 right
}
export const BOAT_MAX_SPEED = 9;
export const BOAT_REVERSE_SPEED = 3.5;
export const BOAT_BOARDING_RADIUS = 8;
export const BOAT_DOCK = { x: -25, z: 213 };

export function spawnBoat(): BoatState {
  return { x: -17, y: -.15, z: 220, heading: 0, speed: 0 };
}
export function boatSurfaceAt(x: number, z: number): number | null {
  const level = waterSurface(x, z);
  if (level === null || !insideWorld(x, z) || level - terrainHeight(x, z) < 1.15) return null;
  return level;
}
export function canBoatSailAt(x: number, z: number, heading: number): boolean {
  const sx = Math.sin(heading), sz = Math.cos(heading);
  // Check bow/stern and both sides, not only the keel.
  return [
    [0, 0], [0, 4], [0, -4], [-1.6, 0], [1.6, 0],
  ].every(([side, front]) => boatSurfaceAt(x + front*sx - side*sz, z + front*sz + side*sx) !== null);
}
export function updateBoat(boat: BoatState, input: BoatInput, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .05);
  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);
  const target = throttle >= 0 ? throttle * BOAT_MAX_SPEED : throttle * BOAT_REVERSE_SPEED;
  const acceleration = throttle === 0 ? 2.4 : 4.5;
  boat.speed += clamp(target - boat.speed, -acceleration*dt, acceleration*dt);
  if (Math.abs(boat.speed) < .025) boat.speed = 0;
  // A boat turns much less when stationary.
  const steeringStrength = Math.min(1, Math.abs(boat.speed) / 4);
  const candidateHeading = boat.heading - steer * steeringStrength * 1.05 * dt * Math.sign(boat.speed || 1);
  if (canBoatSailAt(boat.x, boat.z, candidateHeading)) boat.heading = candidateHeading;
  const nextX = boat.x + Math.sin(boat.heading) * boat.speed * dt;
  const nextZ = boat.z + Math.cos(boat.heading) * boat.speed * dt;
  if (canBoatSailAt(nextX, nextZ, boat.heading)) {
    boat.x = nextX;boat.z = nextZ;
  } else {
    boat.speed = 0;
  }
  boat.y = (boatSurfaceAt(boat.x, boat.z) ?? 0) - .15;
}
export function boatDistanceXZ(boat: BoatState, x: number, z: number): number {
  return Math.hypot(x - boat.x, z - boat.z);
}
export function nearBoat(boat: BoatState, x: number, y: number, z: number): boolean {
  return boatDistanceXZ(boat, x, z) < BOAT_BOARDING_RADIUS && Math.abs(y - (boat.y + 1)) < 4;
}
export function nearDock(boat: BoatState): boolean {
  return Math.hypot(boat.x-BOAT_DOCK.x,boat.z-BOAT_DOCK.z)<17;
}
/** Place swimmer to port side; do not teleport them through the keel. */
export function waterDisembarkPoint(boat: BoatState): {x:number;y:number;z:number} {
  const x=boat.x+3.25*Math.cos(boat.heading);
  const z=boat.z-3.25*Math.sin(boat.heading);
  const level=waterSurface(x,z) ?? boat.y+.15;
  return {x,y:level+.07,z};
}
