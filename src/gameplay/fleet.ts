/** Boats the player can use (doc 42 §boats): the player's own boat plus every boat moored in the
 * ports (placed `boat.*` entities). Each keeps its own state and stays where it is left; the
 * boat in use is driven by the existing arcade controller (boat.ts). Moored boats are solid:
 * a box collider follows each boat (re-registered when it is left somewhere else) and is off
 * while the player is aboard that boat. Pure runtime state: nothing is written to the V3 source. */
import * as THREE from 'three';
import { nearBoat, type BoatState } from '../boat.ts';
import type { WorldCollisionQuery } from '../physics/collision-world.ts';

export interface FleetBoat {
  id: string;
  assetId: string;
  state: BoatState;
  object: THREE.Object3D;
  /** Model height above the boat's water line (authored float height). */
  yOffset: number;
  /** Model yaw relative to the sailing heading (the rowboat model is long along X). */
  yaw: number;
  /** Collider footprint (x along the beam, z along the keel) and hull height, metres. */
  hull: { beam: number; length: number; height: number };
  /** State at the previous fixed step (presentation interpolation only). */
  previous?: { x: number; y: number; z: number; heading: number };
}
/** Forward axis of the boat models: rowboat long along X, sailboat along Z. */
export const BOAT_MODEL_YAW: Record<string, number> = { 'boat.rowboat_wood': -Math.PI / 2 };
const yawOf = (q: THREE.Quaternion) => 2 * Math.atan2(q.y, q.w);
const UP = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), yawQ = new THREE.Quaternion(), tiltQ = new THREE.Quaternion();

export function createFleet(collision: WorldCollisionQuery | null) {
  const boats: FleetBoat[] = [];
  let current: FleetBoat | null = null, aboard = false;
  const colliderId = (b: FleetBoat) => 'boat:' + b.id;
  function placeCollider(b: FleetBoat) {
    if (!collision) return;
    collision.remove(colliderId(b));
    // Axis-aligned box around the rotated hull footprint, from below the water line to the gunwale.
    const c = Math.abs(Math.cos(b.state.heading)), s = Math.abs(Math.sin(b.state.heading));
    const sx = c * b.hull.beam + s * b.hull.length, sz = s * b.hull.beam + c * b.hull.length;
    collision.add({ id: colliderId(b), shape: 'box', position: { x: b.state.x, y: b.state.y - .5, z: b.state.z }, size: { x: sx, y: b.hull.height + .5, z: sz }, enabled: () => !(aboard && current === b) });
  }
  return {
    boats,
    get current() { return current; },
    /** Registers a boat (its object already in the scene at its mooring). */
    add(b: Omit<FleetBoat, 'yaw'> & { yaw?: number }) { const boat = { yaw: BOAT_MODEL_YAW[b.assetId] ?? 0, ...b }; boats.push(boat); if (!current) current = boat; placeCollider(boat); return boat; },
    /** Registers a moored placement: state from its transform (heading from the model yaw). */
    addMoored(id: string, assetId: string, object: THREE.Object3D, waterLevel: number, size: [number, number, number]) {
      const yaw = BOAT_MODEL_YAW[assetId] ?? 0, heading = yawOf(object.quaternion) - yaw, k = Math.abs(object.scale.y) || 1;
      const state: BoatState = { x: object.position.x, z: object.position.z, y: waterLevel - .15, heading, speed: 0 };
      // The model's long side: X for the rowboat, Z for the sailboat (registry sizes, scaled).
      const along = yaw ? size[0] : size[2], across = yaw ? size[2] : size[0];
      return this.add({ id, assetId, object, state, yOffset: object.position.y - state.y, yaw, hull: { beam: across * k * .9, length: along * k * .9, height: Math.min(size[1], 1.6) * k } });
    },
    /** Nearest boat the player can board from (x, y, z), or null. */
    nearest(x: number, y: number, z: number): FleetBoat | null {
      let best: FleetBoat | null = null, d = Infinity;
      for (const b of boats) { if (!nearBoat(b.state, x, y, z)) continue; const e = Math.hypot(b.state.x - x, b.state.z - z); if (e < d) { d = e; best = b; } }
      return best;
    },
    board(b: FleetBoat) { current = b; aboard = true; },
    /** Leaving the boat: it stays there, solid again. */
    leave() { aboard = false; if (current) { current.state.speed = 0; placeCollider(current); } },
    get aboard() { return aboard; },
    /** Remembers every boat's state before a fixed step, for interpolated presentation. */
    capture() { for (const b of boats) { const p = b.previous ??= { x: 0, y: 0, z: 0, heading: 0 }; p.x = b.state.x; p.y = b.state.y; p.z = b.state.z; p.heading = b.state.heading; } },
    /** Model of a boat follows its state (bobbing on the water), interpolated between the
     * last two fixed steps with `alpha` like the player, so a rider never slides on the deck. */
    sync(b: FleetBoat, elapsed: number, alpha = 1) {
      const p = b.previous, s = b.state, u = p ? alpha : 1;
      const x = p ? p.x + (s.x - p.x) * u : s.x, y = p ? p.y + (s.y - p.y) * u : s.y, z = p ? p.z + (s.z - p.z) * u : s.z;
      const heading = p ? p.heading + Math.atan2(Math.sin(s.heading - p.heading), Math.cos(s.heading - p.heading)) * u : s.heading;
      b.object.position.set(x, y + b.yOffset + Math.sin(elapsed * 1.7 + x * .1) * .055, z);
      const n = b.state.waveNormal;
      if (!n) { b.object.rotation.set(0, heading + b.yaw, 0); return; }
      // On a surf swell the hull follows the wave slope (pitch and roll), heading unchanged.
      yawQ.setFromAxisAngle(UP, heading + b.yaw);
      tiltQ.setFromUnitVectors(UP, normal.set(n.x, n.y, n.z).normalize());
      b.object.quaternion.copy(tiltQ).multiply(yawQ);
    },
  };
}
export type Fleet = ReturnType<typeof createFleet>;
