/** Animal host — the only bridge between the game and the animal system.
 * It builds the environment from the existing terrain/collision queries, runs the
 * simulation from the game's fixed step, feeds the view from its render step and maps
 * the existing interaction contract (E prompt) to mount / hitch / cargo actions.
 * `main.ts` only forwards calls: no animal rule lives there.
 */
import * as THREE from 'three';
import type { Purse } from '../gameplay/economy.ts';
import type { NPCState } from '../npc.ts';
import type { WorldCollisionQuery } from '../physics/collision-world.ts';
import type { Controls, Player } from '../player.ts';
import type { TargetDescriptor } from '../ui/interactions/targets.ts';
import { animalTarget } from '../ui/interactions/targets.ts';
import { openCargoPanel, type CargoPanel } from './cargo-panel.ts';
import { cargoUnits } from './cargo.ts';
import { trailerAxle, wrapAngle, type AnimalEnvironment } from './locomotion.ts';
import type { AnimalsSaveV1 } from './save.ts';
import { PLAYER_OWNER, type AnimalAuthorV1 } from './schema.ts';
import { createAnimalSimulation, type AnimalEvent, type AnimalState, type VehicleState } from './simulation.ts';
import { speciesOf, type AnimalSpeciesDefinition } from './species.ts';
import { createAnimalView } from './view.ts';

export interface AnimalHostOptions {
  scene: THREE.Object3D;
  animals: Record<string, AnimalAuthorV1>;
  saved?: AnimalsSaveV1;
  ground: (x: number, z: number) => number;
  water: (x: number, z: number) => number | null;
  inside: (x: number, z: number) => boolean;
  /** Biome id at a point (Geography Engine), or null when unknown. */
  biome?: (x: number, z: number) => string | null;
  collision: WorldCollisionQuery | null;
  npcs: () => readonly NPCState[];
  purse: Purse | null;
  inventory: () => { itemId: string; name: string; count: number }[];
  itemName: (id: string) => string;
  showInfo: (message: string, tone?: 'warning') => void;
  onEvent?: (event: AnimalEvent) => void;
  questDone?: (questId: string) => boolean;
  rigBudget: () => number;
  panelHost: HTMLElement;
}
const colliderId = (id: string): string => `animal:${id}`;

export function createAnimalHost(options: AnimalHostOptions) {
  const { collision } = options;
  let mover: string | null = null, panel: CargoPanel | null = null;
  const env: AnimalEnvironment = {
    ground: options.ground, water: options.water, inside: options.inside,
    habitat: (x, z, species: AnimalSpeciesDefinition) => { const biome = options.biome?.(x, z); return biome ? species.habitats[biome as keyof typeof species.habitats] ?? 0 : 1; },
    ...(collision ? {
      move: (from, toX, toZ, radius, height) => {
        const r = collision.move(from, { x: toX, y: from.y, z: toZ }, radius, height);
        return { x: r.position.x, z: r.position.z, blocked: r.blockedX || r.blockedZ };
      },
      blocked: (x, z, radius) => { const y = options.ground(x, z); return collision.intersectsVolume({ minX: x - radius, maxX: x + radius, minY: y + 0.35, maxY: y + 1.1, minZ: z - radius, maxZ: z + radius }); },
    } : {}),
  };
  const ownerName = (id: string): string => options.npcs().find((n) => n.definition.id === id)?.definition.name ?? 'un habitant';
  const sim = createAnimalSimulation({ animals: options.animals, env, saved: options.saved, onEvent: options.onEvent, ownerName, questDone: options.questDone,
    // The simulation moves one animal at a time: its own colliders are ignored meanwhile.
    moving: (animal) => { mover = animal?.id ?? null; } });
  const view = createAnimalView(options.scene, sim, { ground: options.ground, rigBudget: options.rigBudget });
  // Animals and parked vehicles are obstacles for the player and for each other.
  if (collision) {
    for (const a of sim.animals.values()) collision.add({ id: colliderId(a.id), shape: 'box', position: { x: a.body.x, y: a.body.y, z: a.body.z },
      size: { x: a.species.radius * 2, y: a.species.height, z: a.species.radius * 2 }, enabled: () => mover !== a.id && sim.ridden !== a && a.tier === 'full' });
    for (const v of sim.vehicles.values()) { const spec = speciesOf('capybara').vehicles[v.kind];
      collision.add({ id: colliderId(v.id), shape: 'box', position: { x: v.trailer.x, y: 0, z: v.trailer.z }, size: { x: spec.width, y: spec.wheelRadius * 4, z: spec.width }, enabled: () => mover !== v.hitchedTo && !(sim.ridden && sim.ridden.vehicleId === v.id) }); }
  }
  function syncColliders(): void {
    if (!collision) return;
    for (const a of sim.animals.values()) if (a.tier === 'full' && a.travelled !== 0) collision.moveBody(colliderId(a.id), { x: a.body.x, y: a.body.y, z: a.body.z });
    for (const v of sim.vehicles.values()) { const axle = trailerAxle(v.trailer, speciesOf('capybara').vehicles[v.kind]); collision.moveBody(colliderId(v.id), { x: axle.x, y: options.ground(axle.x, axle.z), z: axle.z }); }
  }
  syncColliders();
  const seatWorld = new THREE.Vector3();
  /** NPC riders sit on their animal while it travels and stand beside it during a pause. */
  function pinRiders(): void {
    const states = options.npcs();
    for (const a of sim.animals.values()) {
      if (!a.author.riderId || a.rider !== a.author.riderId) continue;
      const npc = states.find((s) => s.definition.id === a.author.riderId);
      if (!npc) continue;
      const seat = sim.seat(a), c = Math.cos(a.body.heading), s = Math.sin(a.body.heading), side = a.species.radius + 0.7;
      if (a.riderMounted) { npc.x = seat.x; npc.z = seat.z; npc.y = seat.y - 0.35; }
      else { npc.x = a.body.x + c * side; npc.z = a.body.z - s * side; npc.y = options.ground(npc.x, npc.z); }
      npc.previousX = npc.x; npc.previousY = npc.y; npc.previousZ = npc.z;
      npc.vx = 0; npc.vz = 0; npc.heading = a.body.heading; npc.target = null; npc.wait = 1; if (npc.phase === 'walk') npc.phase = 'idle';
    }
  }
  /** Fixed step. While riding, the animal owns the movement and carries the player. */
  function tick(dt: number, keys: Controls & { trot: boolean }, player: Player, world: { night: boolean; hoursPerSecond: number }): void {
    const a = sim.ridden;
    if (a) {
      const length = Math.hypot(keys.forward, keys.right);
      if (length > 0.1 && !panel) {
        // Same camera-relative intent as the player on foot; the animal turns toward it.
        const f = keys.forward / Math.max(1, length), r = keys.right / Math.max(1, length), sx = Math.sin(keys.cameraYaw), cz = Math.cos(keys.cameraYaw);
        const error = wrapAngle(Math.atan2(f * sx - r * cz, f * cz + r * sx) - a.body.heading), facing = Math.abs(error);
        const throttle = Math.min(1, length) * (a.vehicleId ? (facing > 1 ? 0.6 : 1) : facing > 1.4 ? 0 : 1 - facing / 2.4);
        sim.setDrive({ throttle, steer: Math.max(-1, Math.min(1, error * 2.2)), gait: keys.trot ? 'trot' : 'fast' });
      } else sim.setDrive({ throttle: 0, steer: 0, gait: 'walk' });
    }
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    sim.tick(dt, { player: { x: player.position.x, y: player.position.y, z: player.position.z, speed }, night: world.night, hoursPerSecond: world.hoursPerSecond });
    syncColliders(); pinRiders();
    if (sim.ridden) {
      const seat = sim.seat(sim.ridden);
      player.position.set(seat.x, seat.y, seat.z); player.velocity.set(0, 0, 0); player.mode = 'ground'; player.heading = seat.heading;
    }
    if (panel && !panel.valid()) { panel.close(); panel = null; }
  }
  const reach = (): number => 3.2;
  const label = (a: AnimalState): string => a.author.name;
  function acquisitionLabel(a: AnimalState): string | null {
    const rule = a.author.acquisition;
    if (!rule || a.ownerId === PLAYER_OWNER || a.borrowed) return null;
    return rule.mode === 'purchase' ? `Acheter (${rule.price} pièces)` : rule.mode === 'loan' ? 'Emprunter' : rule.mode === 'quest' ? 'Recevoir' : 'Adopter';
  }
  /** Interaction descriptor for the shared E prompt, or null when no animal is concerned. */
  function target(player: Player): TargetDescriptor | null {
    const ridden = sim.ridden;
    if (ridden) return animalTarget({ id: ridden.id, name: '', label: 'Descendre', enabled: true });
    // Animals are handled on foot only: not indoors, in water, in the air, rolling, climbing or sliding.
    if (player.space || player.mode !== 'ground') return null;
    const { animal, vehicle } = sim.nearest(player.position.x, player.position.z, reach());
    if (animal) {
      const buy = acquisitionLabel(animal);
      if (buy) return animalTarget({ id: animal.id, name: label(animal), label: buy, enabled: true });
      if (animal.author.role === 'wild') return null;
      const use = sim.mayUse(animal, PLAYER_OWNER);
      if (use.ok && sim.capacityOf(animal) > 0 && !sim.canMount(animal).ok) return animalTarget({ id: animal.id, name: label(animal), label: 'Ouvrir le chargement', enabled: true });
      const mount = sim.canMount(animal);
      return animalTarget({ id: animal.id, name: label(animal), label: 'Monter', enabled: mount.ok, reason: mount.ok ? undefined : mount.reason });
    }
    if (vehicle) {
      const mine = !vehicle.ownerId || vehicle.ownerId === PLAYER_OWNER;
      return animalTarget({ id: vehicle.id, name: VEHICLE_NAMES[vehicle.kind], label: 'Ouvrir le chargement', enabled: mine, reason: mine ? undefined : 'Ce chargement ne vous appartient pas.' });
    }
    return null;
  }
  function cargo(title: string, capacity: number, lines: () => Record<string, number>, transfer: (itemId: string, quantity: number) => { ok: true } | { ok: false; reason: string }, valid: () => boolean): void {
    panel?.close();
    panel = openCargoPanel(options.panelHost, { title, capacity, cargo: lines, used: () => cargoUnits(lines()), bag: options.inventory, itemName: options.itemName, valid,
      transfer: (itemId, quantity) => { const r = transfer(itemId, quantity); if (!r.ok) options.showInfo(r.reason, 'warning'); return r.ok; }, onClose: () => { panel = null; } });
  }
  /** Primary action (E) on the current animal target. Returns a landing point after a dismount. */
  function act(player: Player): { dismounted: { x: number; y: number; z: number } } | null {
    if (sim.ridden) {
      const result = sim.dismount();
      if (!result.ok) { options.showInfo(result.reason, 'warning'); return null; }
      return { dismounted: result.position };
    }
    const { animal, vehicle } = sim.nearest(player.position.x, player.position.z, reach());
    const purse = options.purse;
    if (animal) {
      if (acquisitionLabel(animal)) {
        const r = purse ? sim.acquire(animal.id, purse) : { ok: false as const, reason: 'Indisponible ici.' };
        options.showInfo(r.ok ? `${label(animal)} vous accompagne désormais.` : r.reason, r.ok ? undefined : 'warning');
        return null;
      }
      if (sim.capacityOf(animal) > 0 && !sim.canMount(animal).ok && purse) {
        cargo(label(animal), sim.capacityOf(animal), () => sim.cargoOf(animal), (itemId, quantity) => sim.transfer(animal.id, itemId, quantity, purse),
          () => Math.hypot(animal.body.x - player.position.x, animal.body.z - player.position.z) < reach() + 1.5);
        return null;
      }
      const r = sim.mount(animal.id);
      if (!r.ok) options.showInfo(r.reason, 'warning');
      else options.showInfo(`${label(animal)} : Z/S/Q/D pour le diriger, Maj pour trotter, G ${animal.vehicleId ? 'dételer' : 'atteler'}, E descendre`);
      return null;
    }
    if (vehicle && purse) cargo(VEHICLE_NAMES[vehicle.kind], speciesOf('capybara').vehicles[vehicle.kind].cargoUnits, () => vehicle.cargo, (itemId, quantity) => sim.transferVehicle(vehicle.id, itemId, quantity, purse),
      () => !vehicle.hitchedTo && Math.hypot(vehicle.trailer.x - player.position.x, vehicle.trailer.z - player.position.z) < reach() + 3);
    return null;
  }
  /** Secondary keys: G hitches / unhitches the ridden or nearest animal, H calls or parks it. */
  function key(code: 'KeyG' | 'KeyH', player: Player): boolean {
    const a = sim.ridden ?? sim.nearest(player.position.x, player.position.z, code === 'KeyH' ? 60 : reach()).animal;
    if (!a || a.author.role === 'wild') return false;
    if (code === 'KeyG') {
      const v: VehicleState | null = a.vehicleId ? null : sim.hitchable(a);
      const r = a.vehicleId ? sim.unhitch(a.id) : v ? sim.hitch(a.id, v.id) : { ok: false as const, reason: 'Aucun véhicule devant le timon : placez l’animal dos au véhicule.' };
      options.showInfo(r.ok ? (a.vehicleId ? 'Attelé.' : 'Dételé : le véhicule reste stationné ici.') : r.reason, r.ok ? undefined : 'warning');
      return true;
    }
    if (sim.ridden) return false;
    if (a.mode === 'follow') { sim.stay(a.id); options.showInfo(`${label(a)} attend ici.`); return true; }
    const r = sim.call(a.id);
    options.showInfo(r.ok ? `${label(a)} arrive.` : r.reason, r.ok ? undefined : 'warning');
    return true;
  }
  return {
    sim, view, env, tick, target, act, key,
    get riding() { return sim.ridden !== null; },
    get panelOpen() { return panel !== null; },
    /** Render step: interpolated visuals; returns the rider's seat when the socket is visible. */
    present(dt: number, alpha: number, camera: THREE.Vector3, playerPosition: THREE.Vector3): THREE.Vector3 | null {
      view.update(dt, alpha, camera, playerPosition);
      return sim.ridden ? view.riderSocket(sim.ridden.id, seatWorld) : null;
    },
    /** The rider vanished (respawn, teleport, island change): the animal waits where it is. */
    abandon(): void { sim.abandon(); panel?.close(); panel = null; },
    save: (): AnimalsSaveV1 => sim.save(),
    restore(saved?: AnimalsSaveV1): void { sim.abandon(); sim.restore(saved); syncColliders(); },
    dispose(): void {
      panel?.close(); view.dispose();
      if (collision) { for (const a of sim.animals.values()) collision.remove(colliderId(a.id)); for (const v of sim.vehicles.values()) collision.remove(colliderId(v.id)); }
    },
  };
}
export type AnimalHost = ReturnType<typeof createAnimalHost>;
export const VEHICLE_NAMES = { cart: 'Charrette', wagon: 'Chariot', caravan: 'Roulotte' } as const;
