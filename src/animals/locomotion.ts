/** Animal kinematics — pure fixed-step movement, hitch articulation and route checks.
 * Heading follows the game convention (x += sin h, z += cos h). The simulation owns
 * the position; animations and views only read it. No physics engine: a bicycle-like
 * turn limit for the animal and a tractrix for the towed vehicle are enough.
 */
import { teamTurnRadius, type AnimalGait, type AnimalSpeciesDefinition, type AnimalVehicleKind, type VehicleSpec } from './species.ts';

export interface AnimalEnvironment {
  ground(x: number, z: number): number;
  /** Water surface level or null when dry. */
  water(x: number, z: number): number | null;
  inside(x: number, z: number): boolean;
  /** Swept circle against solids (buildings, props, other bodies). Absent = open ground. */
  move?(from: { x: number; y: number; z: number }, toX: number, toZ: number, radius: number, height: number): { x: number; z: number; blocked: boolean };
  /** True when a standing circle would overlap a solid. */
  blocked?(x: number, z: number, radius: number): boolean;
  /** Habitat suitability 0..1 for a species (classification of the Geography Engine). */
  habitat?(x: number, z: number, species: AnimalSpeciesDefinition): number;
}
export interface AnimalBody { x: number; y: number; z: number; heading: number; speed: number; turnRate: number }
export interface DriveInput { throttle: number; steer: number; gait: AnimalGait }
export interface TeamLimits { vehicle: AnimalVehicleKind | null; load: number; rider: boolean }
export interface TrailerState { x: number; z: number; heading: number; rolled: number }
export type BlockReason = 'edge' | 'water' | 'slope' | 'solid' | 'jackknife' | 'vehicle';
export interface StepResult { blocked: BlockReason | null; travelled: number }

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const wrapAngle = (a: number): number => { const t = (a + Math.PI) % (Math.PI * 2); return (t < 0 ? t + Math.PI * 2 : t) - Math.PI; };
const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

export function teamSpeed(species: AnimalSpeciesDefinition, gait: AnimalGait, limits: TeamLimits): number {
  const vehicle = limits.vehicle ? species.vehicles[limits.vehicle] : null;
  const load = clamp(limits.load, 0, 1);
  // A team never trots; a pack or a rider only slows the animal a little.
  const base = vehicle ? Math.min(species.speeds[gait], species.speeds.fast) : species.speeds[gait];
  const factor = vehicle ? vehicle.speedFactor - vehicle.loadPenalty * load : 1 - 0.15 * load - (limits.rider ? 0.08 : 0);
  return base * Math.max(0.2, factor);
}
export function teamMaxSlope(species: AnimalSpeciesDefinition, limits: TeamLimits): number {
  const vehicle = limits.vehicle ? species.vehicles[limits.vehicle] : null;
  return vehicle ? vehicle.maxSlope * (1 - clamp(limits.load, 0, 1) / 3) : species.maxSlope * (1 - 0.15 * clamp(limits.load, 0, 1));
}
function standable(env: AnimalEnvironment, species: AnimalSpeciesDefinition, x: number, z: number): BlockReason | null {
  if (!env.inside(x, z)) return 'edge';
  const level = env.water(x, z);
  if (level !== null && level - env.ground(x, z) > species.maxWade) return 'water';
  return null;
}
export function hitchPoint(body: AnimalBody, species: AnimalSpeciesDefinition): { x: number; z: number } {
  return { x: body.x - Math.sin(body.heading) * species.hitchOffset, z: body.z - Math.cos(body.heading) * species.hitchOffset };
}
export function trailerBehind(body: AnimalBody, species: AnimalSpeciesDefinition): TrailerState {
  return { ...hitchPoint(body, species), heading: body.heading, rolled: 0 };
}
export const trailerAxle = (t: TrailerState, spec: VehicleSpec): { x: number; z: number } =>
  ({ x: t.x - Math.sin(t.heading) * spec.axle, z: t.z - Math.cos(t.heading) * spec.axle });
/** Tractrix: the axle is dragged toward the new hitch position; returns the signed roll. */
export function followHitch(trailer: TrailerState, hitch: { x: number; z: number }, spec: VehicleSpec): number {
  const axle = trailerAxle(trailer, spec);
  const dx = hitch.x - axle.x, dz = hitch.z - axle.z, length = Math.hypot(dx, dz);
  const heading = length > 1e-6 ? Math.atan2(dx, dz) : trailer.heading;
  const nx = hitch.x - Math.sin(heading) * spec.axle, nz = hitch.z - Math.cos(heading) * spec.axle;
  const rolled = (nx - axle.x) * Math.sin(heading) + (nz - axle.z) * Math.cos(heading);
  trailer.x = hitch.x; trailer.z = hitch.z; trailer.heading = heading; trailer.rolled += rolled;
  return rolled;
}
/** Wheel and tail points of a vehicle that must stay on passable, free ground. */
function vehicleBlocked(env: AnimalEnvironment, species: AnimalSpeciesDefinition, trailer: TrailerState, spec: VehicleSpec): boolean {
  const s = Math.sin(trailer.heading), c = Math.cos(trailer.heading), half = spec.width / 2;
  for (const [back, side] of [[spec.axle, half], [spec.axle, -half], [spec.length, 0]]) {
    const x = trailer.x - s * back + c * side, z = trailer.z - c * back - s * side;
    if (standable(env, species, x, z) || env.blocked?.(x, z, 0.18)) return true;
  }
  return false;
}
/** One fixed step. The body and trailer are only modified when the whole team can move. */
export function stepAnimal(
  body: AnimalBody, input: DriveInput, species: AnimalSpeciesDefinition, limits: TeamLimits,
  env: AnimalEnvironment, dt: number, trailer: TrailerState | null = null,
): StepResult {
  if (!(dt > 0) || dt > 0.25) throw new Error('Pas de simulation animal invalide');
  const spec = limits.vehicle ? species.vehicles[limits.vehicle] : null;
  let throttle = clamp(finite(input.throttle), -1, 1);
  if (throttle < 0 && spec && !spec.reverse) throttle = 0;
  const wanted = throttle >= 0 ? throttle * teamSpeed(species, input.gait, limits) : throttle * species.speeds.reverse;
  const rate = Math.abs(wanted) < Math.abs(body.speed) || wanted * body.speed < 0 ? species.braking : species.acceleration * (spec ? 0.6 : 1);
  const speed = body.speed + clamp(wanted - body.speed, -rate * dt, rate * dt);
  // Turning: limited by the team's circle when moving; only a free animal pivots on the spot.
  const radius = teamTurnRadius(species, limits.vehicle);
  const steer = clamp(finite(input.steer), -1, 1);
  const yawLimit = Math.abs(speed) > 0.05 ? Math.min(species.turnRate, Math.abs(speed) / radius) : spec ? 0 : species.pivotRate;
  const turnRate = steer * yawLimit * (speed < 0 ? -1 : 1);
  const heading = wrapAngle(body.heading + turnRate * dt);
  const stop = (reason: BlockReason): StepResult => { body.speed = 0; body.turnRate = 0; return { blocked: reason, travelled: 0 }; };
  if (Math.abs(speed) < 1e-4 && Math.abs(turnRate) < 1e-5) { body.speed = 0; body.turnRate = 0; return { blocked: null, travelled: 0 }; }
  let x = body.x + Math.sin(heading) * speed * dt, z = body.z + Math.cos(heading) * speed * dt;
  let slid = false;
  if (env.move && (x !== body.x || z !== body.z)) {
    const moved = env.move(body, x, z, species.radius, species.height);
    slid = moved.blocked; x = moved.x; z = moved.z;
    if (slid && Math.hypot(x - body.x, z - body.z) < Math.abs(speed) * dt * 0.2) return stop('solid');
  }
  // Probe ahead of the chest (behind the rump when backing) for water, world edge and slope.
  const reach = species.halfLength * Math.sign(speed || 1);
  const px = x + Math.sin(heading) * reach, pz = z + Math.cos(heading) * reach;
  const reason = standable(env, species, x, z) ?? standable(env, species, px, pz);
  if (reason) return stop(reason);
  const y = env.ground(x, z);
  const step = Math.hypot(x - body.x, z - body.z);
  if (step > 1e-4) {
    const slope = (env.ground(px, pz) - y) / species.halfLength;
    if (slope > teamMaxSlope(species, limits)) return stop('slope');
  }
  if (trailer && spec) {
    const next: TrailerState = { ...trailer };
    const moved: AnimalBody = { ...body, x, z, heading };
    followHitch(next, hitchPoint(moved, species), spec);
    if (Math.abs(wrapAngle(heading - next.heading)) > spec.maxArticulation) return stop('jackknife');
    if (vehicleBlocked(env, species, next, spec)) return stop('vehicle');
    Object.assign(trailer, next);
  }
  body.x = x; body.z = z; body.y = y; body.heading = heading;
  body.speed = slid ? speed * 0.5 : speed; body.turnRate = turnRate;
  return { blocked: null, travelled: step * Math.sign(speed) };
}
/** Drive command that brings a team to a point: slows to turn, eases in when arriving. */
export function steerToward(body: AnimalBody, target: { x: number; z: number }, gait: AnimalGait, arrive = 0.6, vehicle: AnimalVehicleKind | null = null): DriveInput & { arrived: boolean } {
  const dx = target.x - body.x, dz = target.z - body.z, distance = Math.hypot(dx, dz);
  if (distance <= arrive) return { throttle: 0, steer: 0, gait, arrived: true };
  const error = wrapAngle(Math.atan2(dx, dz) - body.heading);
  const steer = clamp(error * 2.2, -1, 1);
  // A free animal pivots toward a target behind it; a team keeps rolling on its circle.
  const facing = Math.abs(error);
  const throttle = vehicle ? clamp(distance / 2, 0.35, 1) * (facing > 1 ? 0.6 : 1) : facing > 1.4 ? 0 : clamp(distance / 1.5, 0.3, 1) * (1 - facing / 2.2);
  return { throttle, steer, gait, arrived: false };
}

export interface RouteDiagnostic { severity: 'error' | 'warning'; code: 'short' | 'edge' | 'water' | 'slope' | 'width' | 'turn' | 'turnaround' | 'obstacle'; index: number; message: string }
/** Static check of an authored route for a team: slopes, water, width, corners and turn-round room. */
export function validateAnimalRoute(points: readonly { x: number; z: number }[], species: AnimalSpeciesDefinition, vehicle: AnimalVehicleKind | null, env: AnimalEnvironment, load = 1): RouteDiagnostic[] {
  const out: RouteDiagnostic[] = [], limits: TeamLimits = { vehicle, load, rider: false };
  const half = (vehicle ? species.vehicles[vehicle].width : species.radius * 2) / 2 + 0.15, radius = teamTurnRadius(species, vehicle), maxSlope = teamMaxSlope(species, limits);
  if (points.length < 2) return [{ severity: 'error', code: 'short', index: 0, message: 'Un trajet exige au moins deux points.' }];
  const seen = new Set<string>();
  const add = (severity: RouteDiagnostic['severity'], code: RouteDiagnostic['code'], index: number, message: string): void => {
    if (seen.has(code + index)) return; seen.add(code + index); out.push({ severity, code, index, message });
  };
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.5) { add('error', 'short', i, `Tronçon ${i + 1} trop court.`); continue; }
    const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length, steps = Math.ceil(length / 1.5);
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ux * length * s / steps, z = a.z + uz * length * s / steps;
      if (!env.inside(x, z)) { add('error', 'edge', i, `Tronçon ${i + 1} hors du monde.`); break; }
      for (const side of [-half, 0, half]) {
        const sx = x + uz * side, sz = z - ux * side, level = env.water(sx, sz);
        if (level !== null && level - env.ground(sx, sz) > species.maxWade) add('error', side ? 'width' : 'water', i, side ? `Tronçon ${i + 1} : le passage est plus étroit que l’attelage (eau).` : `Tronçon ${i + 1} : eau trop profonde.`);
        else if (env.blocked?.(sx, sz, 0.2)) add('error', side ? 'width' : 'obstacle', i, side ? `Tronçon ${i + 1} : passage trop étroit pour l’attelage.` : `Tronçon ${i + 1} : obstacle sur le trajet.`);
      }
      if (s < steps) {
        const nx = x + ux * length / steps, nz = z + uz * length / steps;
        const slope = Math.abs(env.ground(nx, nz) - env.ground(x, z)) / (length / steps);
        if (slope > maxSlope) add('error', 'slope', i, `Tronçon ${i + 1} : pente de ${Math.round(slope * 100)} % (maximum ${Math.round(maxSlope * 100)} %).`);
      }
    }
    if (i > 0) {
      const p = points[i - 1], inLength = Math.hypot(a.x - p.x, a.z - p.z);
      const turn = Math.abs(wrapAngle(Math.atan2(b.x - a.x, b.z - a.z) - Math.atan2(a.x - p.x, a.z - p.z)));
      // Room needed on each side of a corner to follow the team's circle.
      const need = radius * Math.tan(turn / 2);
      if (turn > 2.6 || need > Math.min(inLength, length) * 0.9) add(vehicle ? 'error' : 'warning', 'turn', i, `Virage ${i} trop serré pour un rayon de ${radius.toFixed(1)} m.`);
    }
  }
  if (vehicle) for (const index of [0, points.length - 1]) {
    // A team turns round on a loop: the circle beside the end point must be free.
    const end = points[index], other = points[index ? index - 1 : 1];
    const length = Math.hypot(end.x - other.x, end.z - other.z) || 1, ux = (end.x - other.x) / length, uz = (end.z - other.z) / length;
    const free = [1, -1].some((side) => {
      for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4, cx = end.x + uz * side * radius, cz = end.z - ux * side * radius;
        const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius, level = env.water(x, z);
        if (!env.inside(x, z) || (level !== null && level - env.ground(x, z) > species.maxWade) || env.blocked?.(x, z, half)) return false;
      }
      return true;
    });
    if (!free) add('warning', 'turnaround', index, `Pas assez de place pour faire demi-tour au point ${index + 1} (rayon ${radius.toFixed(1)} m).`);
  }
  return out;
}
