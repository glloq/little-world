/** Animal simulation — the single authority for animals, mounts and towed vehicles.
 * Pure and deterministic: no Three.js, no timers, no RAF. The host calls `tick(dt)` from
 * its existing fixed step; views only read the state. Distance tiers reuse the NPC ones:
 * near animals move every step, mid-distance ones decide sparsely, far ones advance abstractly.
 */
import { mulberry32 } from '../terrain.ts';
import { npcActivity, type NPCActivity } from '../npc.ts';
import type { Purse } from '../gameplay/economy.ts';
import { cargoUnits, transferCargo, type Cargo, type CargoResult } from './cargo.ts';
import {
  followHitch, hitchPoint, steerToward, stepAnimal, trailerAxle, trailerBehind, wrapAngle,
  type AnimalBody, type AnimalEnvironment, type BlockReason, type DriveInput, type TeamLimits, type TrailerState,
} from './locomotion.ts';
import type { AnimalsSaveV1 } from './save.ts';
import { PLAYER_OWNER, type AnimalAuthorV1, type AnimalHerdV1, type AnimalInstanceV1 } from './schema.ts';
import { isVehicleKind, speciesOf, type AnimalGait, type AnimalLoadout, type AnimalSpeciesDefinition, type AnimalVehicleKind } from './species.ts';

export const ANIMAL_MODES = ['idle', 'graze', 'drink', 'rest', 'sleep', 'wander', 'flee', 'alert', 'follow', 'route', 'pause', 'ridden', 'stay'] as const;
export type AnimalMode = typeof ANIMAL_MODES[number];
/** Presentation hint consumed by the species view (names of `CAPYBARA_BEHAVIORS`). */
export type AnimalAnimation = 'idle' | 'look_around' | 'graze' | 'drink' | 'sniff' | 'sit' | 'lie_down' | 'sleep' | 'wake_up' | 'stand_up' | 'react' | 'afraid' | 'happy' | 'wait_loading' | 'shake';
export interface AnimalState {
  id: string; author: AnimalInstanceV1; species: AnimalSpeciesDefinition; herdId: string | null;
  body: AnimalBody; previous: { x: number; y: number; z: number; heading: number };
  mode: AnimalMode; timer: number; target: { x: number; z: number } | null; gait: AnimalGait;
  animation: AnimalAnimation; lookAtPlayer: boolean;
  needs: { hunger: number; thirst: number; fatigue: number };
  loadout: AnimalLoadout; vehicleId: string | null; rider: string | null; riderMounted: boolean;
  ownerId: string | null; borrowed: boolean; cargo: Cargo;
  tier: NPCActivity; pending: number; blocked: BlockReason | null;
  routeIndex: number; routeDirection: 1 | -1;
  /** Distance travelled this step (signed), for wheels and gait. */
  travelled: number;
  random: () => number;
}
export interface VehicleState {
  id: string; kind: AnimalVehicleKind; trailer: TrailerState; previous: { x: number; z: number; heading: number };
  hitchedTo: string | null; cargo: Cargo; ownerId: string | null; dwelling: boolean;
}
export type AnimalEvent =
  | { type: 'animal.mounted' | 'animal.dismounted' | 'animal.acquired' | 'animal.called'; animalId: string }
  | { type: 'animal.hitched' | 'animal.unhitched'; animalId: string; vehicleId: string };
export type RuleResult = { ok: true } | { ok: false; reason: string };
export interface AnimalTickContext { player: { x: number; y: number; z: number; speed: number }; night: boolean; hoursPerSecond: number }
export interface AnimalSimulationOptions {
  animals: Record<string, AnimalAuthorV1>; env: AnimalEnvironment; saved?: AnimalsSaveV1;
  onEvent?: (event: AnimalEvent) => void;
  /** Display name of an owner entity, for refusal messages. */
  ownerName?: (id: string) => string;
  questDone?: (questId: string) => boolean;
  /** Called before an animal moves (hosts ignore its own colliders meanwhile); null afterwards. */
  moving?: (animal: AnimalState | null) => void;
}
const no = (reason: string): RuleResult => ({ ok: false, reason });
const YES: RuleResult = { ok: true };
const COIN = 'coin';
const hash = (text: string): number => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
export const vehicleIdOf = (animalId: string): string => `${animalId}:vehicle`;

/** Expands a herd into stable individuals placed on suitable habitat (capacity-bounded). */
export function expandHerd(herd: AnimalHerdV1, env: AnimalEnvironment): AnimalInstanceV1[] {
  const species = speciesOf(herd.species), random = mulberry32(herd.seed ^ hash(herd.id));
  const spots: { x: number; z: number; heading: number }[] = [];
  let suitable = 0;
  const samples = 48;
  for (let i = 0; i < samples; i++) {
    const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * herd.radius, heading = random() * Math.PI * 2 - Math.PI;
    const x = herd.x + Math.cos(angle) * r, z = herd.z + Math.sin(angle) * r;
    if (!env.inside(x, z)) continue;
    const level = env.water(x, z);
    if (level !== null && level - env.ground(x, z) > species.maxWade) continue;
    if ((env.habitat?.(x, z, species) ?? 1) < 0.25 || env.blocked?.(x, z, species.radius)) continue;
    suitable++;
    if (spots.every((s) => Math.hypot(s.x - x, s.z - z) > species.radius * 3)) spots.push({ x, z, heading });
  }
  // The zone's capacity follows how much of it is real habitat.
  const capacity = Math.min(herd.count, species.herd.max, Math.ceil(herd.count * Math.min(1, suitable / (samples * 0.5))));
  return spots.slice(0, capacity).map((spot, i) => ({
    version: 1, kind: 'individual', id: `${herd.id}#${i}`, species: herd.species, name: herd.name, role: 'wild', ...spot,
    loadout: 'none', initialState: 'graze', access: 'nobody', home: { x: herd.x, z: herd.z }, roamRadius: herd.radius, persistent: false,
  }));
}

export function createAnimalSimulation(options: AnimalSimulationOptions) {
  const { env } = options;
  const animals = new Map<string, AnimalState>(), vehicles = new Map<string, VehicleState>();
  const herds = new Map<string, { x: number; z: number; members: AnimalState[] }>();
  let ridden: AnimalState | null = null, drive: DriveInput = { throttle: 0, steer: 0, gait: 'walk' }, clock = 0;
  const emit = (event: AnimalEvent): void => options.onEvent?.(event);

  function spawn(author: AnimalInstanceV1, herdId: string | null): void {
    if (animals.has(author.id)) return; // stable ids: a reload can never duplicate an animal
    const species = speciesOf(author.species);
    const body: AnimalBody = { x: author.x, y: env.ground(author.x, author.z), z: author.z, heading: author.heading, speed: 0, turnRate: 0 };
    const random = mulberry32(hash(author.id));
    const state: AnimalState = {
      id: author.id, author, species, herdId, body, previous: { x: body.x, y: body.y, z: body.z, heading: body.heading },
      mode: author.path ? 'route' : author.initialState === 'graze' ? 'graze' : author.initialState, timer: 2 + random() * 6, target: null, gait: 'walk',
      animation: 'idle', lookAtPlayer: false,
      needs: { hunger: random() * 0.4, thirst: random() * 0.4, fatigue: random() * 0.3 },
      loadout: author.loadout, vehicleId: null, rider: author.riderId ?? null, riderMounted: Boolean(author.riderId),
      ownerId: author.ownerId ?? null, borrowed: false, cargo: {},
      tier: 'dormant', pending: random(), blocked: null, routeIndex: author.path ? 1 : 0, routeDirection: 1, travelled: 0, random,
    };
    const initialCargo = Object.fromEntries((author.cargo ?? []).map((c) => [c.itemId, c.quantity]));
    if (isVehicleKind(author.loadout)) {
      const id = vehicleIdOf(author.id), trailer = trailerBehind(body, species);
      vehicles.set(id, { id, kind: author.loadout, trailer, previous: { x: trailer.x, z: trailer.z, heading: trailer.heading },
        hitchedTo: author.id, cargo: initialCargo, ownerId: state.ownerId, dwelling: author.dwelling === true });
      state.vehicleId = id;
    } else state.cargo = initialCargo;
    animals.set(author.id, state);
    if (herdId) herds.get(herdId)!.members.push(state);
  }
  for (const author of Object.values(options.animals)) {
    if (author.kind === 'herd') { herds.set(author.id, { x: author.x, z: author.z, members: [] }); for (const member of expandHerd(author, env)) spawn(member, author.id); }
    else spawn(author, null);
  }
  const vehicleOf = (a: AnimalState): VehicleState | null => (a.vehicleId ? vehicles.get(a.vehicleId) ?? null : null);
  const capacityOf = (a: AnimalState): number => { const v = vehicleOf(a); return v ? a.species.vehicles[v.kind].cargoUnits : a.loadout === 'pack' ? a.species.packUnits : 0; };
  const cargoOf = (a: AnimalState): Cargo => vehicleOf(a)?.cargo ?? a.cargo;
  const loadOf = (a: AnimalState): number => { const capacity = capacityOf(a); return capacity ? Math.min(1, cargoUnits(cargoOf(a)) / capacity) : 0; };
  const limitsOf = (a: AnimalState): TeamLimits => ({ vehicle: vehicleOf(a)?.kind ?? null, load: loadOf(a), rider: a.rider !== null && a.riderMounted });
  const lying = (a: AnimalState): boolean => a.mode === 'rest' || a.mode === 'sleep';

  /** May `actor` use this animal (ride, lead, hitch, open its cargo)? */
  function mayUse(a: AnimalState, actor: string): RuleResult {
    if (a.author.role === 'wild') return no('Cet animal est sauvage.');
    if (a.author.access === 'anyone' || a.ownerId === actor || (a.borrowed && actor === PLAYER_OWNER)) return YES;
    if (a.author.access === 'nobody') return no('Cet animal n’est pas disponible.');
    return no(a.ownerId ? `Il appartient à ${options.ownerName?.(a.ownerId) ?? 'quelqu’un d’autre'}.` : 'Il n’appartient à personne pour l’instant.');
  }
  function canMount(a: AnimalState, actor = PLAYER_OWNER): RuleResult {
    const use = mayUse(a, actor);
    if (!use.ok) return use;
    if (!a.species.rideable) return no('Cette espèce ne se monte pas.');
    if (a.rider && a.rider !== actor) return no('Il est déjà monté.');
    if (a.loadout === 'pack') return no('Ses sacoches ne laissent pas de place.');
    if (a.mode === 'sleep') return no('Il dort.');
    return YES;
  }
  function mount(id: string): RuleResult {
    const a = animals.get(id);
    if (!a) return no('Animal introuvable.');
    if (ridden) return no('Vous êtes déjà en selle.');
    const allowed = canMount(a);
    if (!allowed.ok) return allowed;
    a.rider = PLAYER_OWNER; a.riderMounted = true; a.mode = 'ridden'; a.target = null; a.animation = lying(a) ? 'stand_up' : 'idle';
    ridden = a; drive = { throttle: 0, steer: 0, gait: 'walk' };
    emit({ type: 'animal.mounted', animalId: id });
    return YES;
  }
  /** Free standing point beside the animal (left, right, then behind the team), or null. */
  function landing(a: AnimalState): { x: number; y: number; z: number } | null {
    const s = Math.sin(a.body.heading), c = Math.cos(a.body.heading), side = a.species.radius + 0.75;
    const behind = a.species.halfLength + (vehicleOf(a) ? a.species.vehicles[vehicleOf(a)!.kind].length + a.species.hitchOffset : 0.9);
    for (const [forward, lateral] of [[0, side], [0, -side], [a.species.halfLength + 0.9, 0], [-behind, 0]]) {
      const x = a.body.x + s * forward + c * lateral, z = a.body.z + c * forward - s * lateral;
      if (!env.inside(x, z) || env.water(x, z) !== null && env.water(x, z)! - env.ground(x, z) > 0.3) continue;
      if (env.blocked?.(x, z, 0.35)) continue;
      const y = env.ground(x, z);
      if (Math.abs(y - a.body.y) > 1.2) continue;
      return { x, y, z };
    }
    return null;
  }
  function dismount(): { ok: true; position: { x: number; y: number; z: number } } | { ok: false; reason: string } {
    const a = ridden;
    if (!a) return no('Vous n’êtes pas en selle.') as { ok: false; reason: string };
    if (Math.abs(a.body.speed) > 0.6) return { ok: false, reason: 'Arrêtez-vous avant de descendre.' };
    const position = landing(a);
    if (!position) return { ok: false, reason: 'Pas de place pour descendre ici.' };
    release(a);
    emit({ type: 'animal.dismounted', animalId: a.id });
    return { ok: true, position };
  }
  function release(a: AnimalState): void {
    if (a.rider === PLAYER_OWNER) { a.rider = a.author.riderId ?? null; a.riderMounted = false; }
    a.mode = a.author.path && a.author.riderId ? 'pause' : 'stay'; a.timer = 4; a.body.speed = 0; a.animation = 'idle';
    if (ridden === a) ridden = null;
  }
  /** Controlled recovery when the rider vanishes (teleport, respawn, island change). */
  function abandon(): void { if (ridden) release(ridden); }

  function canHitch(a: AnimalState, v: VehicleState, actor = PLAYER_OWNER): RuleResult {
    const use = mayUse(a, actor);
    if (!use.ok) return use;
    if (v.ownerId && v.ownerId !== actor && v.ownerId !== a.ownerId) return no('Ce véhicule ne vous appartient pas.');
    if (a.vehicleId) return no('Il tire déjà un véhicule.');
    if (v.hitchedTo) return no('Ce véhicule est déjà attelé.');
    if (a.loadout === 'pack') return no('Retirez d’abord ses sacoches.');
    if (lying(a)) return no('Il doit d’abord se lever.');
    const pin = hitchPoint(a.body, a.species);
    if (Math.hypot(pin.x - v.trailer.x, pin.z - v.trailer.z) > 1.6) return no('Amenez-le devant le timon.');
    if (Math.abs(wrapAngle(a.body.heading - v.trailer.heading)) > a.species.vehicles[v.kind].maxArticulation) return no('Alignez-le avec le véhicule.');
    return YES;
  }
  function hitch(animalId: string, vehicleId: string): RuleResult {
    const a = animals.get(animalId), v = vehicles.get(vehicleId);
    if (!a || !v) return no('Attelage introuvable.');
    const allowed = canHitch(a, v);
    if (!allowed.ok) return allowed;
    followHitch(v.trailer, hitchPoint(a.body, a.species), a.species.vehicles[v.kind]);
    v.hitchedTo = a.id; a.vehicleId = v.id; a.loadout = v.kind; a.body.speed = 0;
    emit({ type: 'animal.hitched', animalId, vehicleId });
    return YES;
  }
  function canUnhitch(a: AnimalState, actor = PLAYER_OWNER): RuleResult {
    const use = mayUse(a, actor);
    if (!use.ok) return use;
    if (!a.vehicleId) return no('Il ne tire aucun véhicule.');
    if (Math.abs(a.body.speed) > 0.2) return no('Arrêtez l’attelage avant de dételer.');
    return YES;
  }
  function unhitch(animalId: string): RuleResult {
    const a = animals.get(animalId);
    if (!a) return no('Animal introuvable.');
    const allowed = canUnhitch(a);
    if (!allowed.ok) return allowed;
    const v = vehicleOf(a)!;
    v.hitchedTo = null; a.vehicleId = null; a.loadout = 'none';
    emit({ type: 'animal.unhitched', animalId, vehicleId: v.id });
    return YES;
  }
  /** Swaps worn equipment (none / saddle / pack); goods are never lost or duplicated. */
  function equip(animalId: string, loadout: AnimalLoadout): RuleResult {
    const a = animals.get(animalId);
    if (!a) return no('Animal introuvable.');
    const use = mayUse(a, PLAYER_OWNER);
    if (!use.ok) return use;
    if (isVehicleKind(loadout)) return no('Un véhicule s’attelle, il ne s’enfile pas.');
    if (a.vehicleId) return no('Dételez-le d’abord.');
    if (a.rider && loadout === 'pack') return no('Descendez avant de poser des sacoches.');
    if (a.loadout === 'pack' && loadout !== 'pack' && cargoUnits(a.cargo) > 0) return no('Videz d’abord ses sacoches.');
    a.loadout = loadout;
    return YES;
  }
  function transfer(animalId: string, itemId: string, quantity: number, purse: Purse): CargoResult {
    const a = animals.get(animalId);
    if (!a) return { ok: false, reason: 'Animal introuvable.' };
    const use = mayUse(a, PLAYER_OWNER);
    if (!use.ok) return use;
    const capacity = capacityOf(a);
    if (!capacity) return { ok: false, reason: 'Il ne porte ni sacoches ni véhicule.' };
    return transferCargo(cargoOf(a), capacity, itemId, quantity, purse);
  }
  function transferVehicle(vehicleId: string, itemId: string, quantity: number, purse: Purse): CargoResult {
    const v = vehicles.get(vehicleId);
    if (!v) return { ok: false, reason: 'Véhicule introuvable.' };
    if (v.ownerId && v.ownerId !== PLAYER_OWNER) return { ok: false, reason: 'Ce chargement ne vous appartient pas.' };
    return transferCargo(v.cargo, speciesOf('capybara').vehicles[v.kind].cargoUnits, itemId, quantity, purse);
  }
  /** Obtains an animal according to its authored acquisition rule. */
  function acquire(animalId: string, purse: Purse): RuleResult {
    const a = animals.get(animalId), rule = a?.author.acquisition;
    if (!a || !rule) return no('Cet animal n’est pas à céder.');
    if (a.ownerId === PLAYER_OWNER || a.borrowed) return no('Il est déjà à vous.');
    if (a.rider) return no('Il est occupé.');
    if (rule.mode === 'quest' && !options.questDone?.(rule.questId!)) return no('Terminez d’abord la quête liée à cet animal.');
    if (rule.mode === 'purchase') {
      if (purse.count(COIN) < rule.price!) return no(`Il coûte ${rule.price} pièces.`);
      if (!purse.apply([{ itemId: COIN, quantity: -rule.price! }])) return no('Paiement refusé.');
    }
    if (rule.mode === 'loan') a.borrowed = true;
    else { a.ownerId = PLAYER_OWNER; const v = vehicleOf(a); if (v) v.ownerId = PLAYER_OWNER; }
    emit({ type: 'animal.acquired', animalId });
    return YES;
  }
  function call(animalId: string): RuleResult {
    const a = animals.get(animalId);
    if (!a) return no('Animal introuvable.');
    const use = mayUse(a, PLAYER_OWNER);
    if (!use.ok) return use;
    if (a.rider) return no('Il est monté.');
    if (a.author.path && a.author.riderId) return no('Il travaille.');
    a.mode = 'follow'; a.timer = 60; a.animation = lying(a) ? 'stand_up' : 'idle';
    emit({ type: 'animal.called', animalId });
    return YES;
  }
  function stay(animalId: string): void { const a = animals.get(animalId); if (a && a.mode === 'follow') { a.mode = 'stay'; a.target = null; } }

  function move(a: AnimalState, input: DriveInput, dt: number): void {
    options.moving?.(a);
    const result = stepAnimal(a.body, input, a.species, limitsOf(a), env, dt, vehicleOf(a)?.trailer ?? null);
    options.moving?.(null);
    a.blocked = result.blocked; a.travelled = result.travelled;
  }
  function still(a: AnimalState, dt: number): void { if (a.body.speed !== 0 || a.body.turnRate !== 0) move(a, { throttle: 0, steer: 0, gait: 'walk' }, dt); else a.travelled = 0; }
  /** Walks toward the current target; returns true on arrival. A blocked team gives up. */
  function approach(a: AnimalState, dt: number, arrive: number): boolean {
    if (!a.target) return true;
    const command = steerToward(a.body, a.target, a.gait, arrive, vehicleOf(a)?.kind ?? null);
    if (command.arrived) { still(a, dt); return a.body.speed === 0; }
    move(a, command, dt);
    return false;
  }
  function roamTarget(a: AnimalState, around: { x: number; z: number }, radius: number): { x: number; z: number } | null {
    for (let i = 0; i < 6; i++) {
      const angle = a.random() * Math.PI * 2, r = (0.3 + a.random() * 0.7) * radius;
      const x = around.x + Math.cos(angle) * r, z = around.z + Math.sin(angle) * r;
      if (!env.inside(x, z)) continue;
      const level = env.water(x, z);
      if (level !== null && level - env.ground(x, z) > a.species.maxWade * 0.6) continue;
      if ((env.habitat?.(x, z, a.species) ?? 1) < 0.2) continue;
      return { x, z };
    }
    return null;
  }
  function waterEdge(a: AnimalState): { x: number; z: number } | null {
    for (const r of [4, 8, 14, 22, 32]) for (let k = 0; k < 8; k++) {
      const angle = k * Math.PI / 4 + r, x = a.body.x + Math.cos(angle) * r, z = a.body.z + Math.sin(angle) * r;
      const level = env.inside(x, z) ? env.water(x, z) : null;
      if (level === null) continue;
      // Stop on the bank: step back toward the animal until the water is shallow.
      for (let t = 1; t > 0.2; t -= 0.1) {
        const bx = a.body.x + (x - a.body.x) * t, bz = a.body.z + (z - a.body.z) * t, bank = env.water(bx, bz);
        if (bank === null || bank - env.ground(bx, bz) < a.species.maxWade * 0.4) return { x: bx, z: bz };
      }
    }
    return null;
  }
  const home = (a: AnimalState): { x: number; z: number } => a.author.home ?? { x: a.author.x, z: a.author.z };
  function settle(a: AnimalState, mode: AnimalMode, seconds: number, animation: AnimalAnimation): void {
    a.mode = mode; a.timer = seconds; a.target = null; a.animation = animation; a.gait = 'walk';
  }
  /** Chooses the next free activity from needs, time of day and the herd. */
  function choose(a: AnimalState, ctx: AnimalTickContext): void {
    const n = a.needs, herd = a.herdId ? herds.get(a.herdId)! : null, anchor = home(a), radius = Math.max(3, a.author.roamRadius);
    if (isVehicleKind(a.loadout) || a.mode === 'stay') { settle(a, a.mode === 'stay' ? 'stay' : 'idle', 6 + a.random() * 6, a.random() < 0.3 ? 'look_around' : 'idle'); return; }
    if ((ctx.night && n.fatigue > 0.25) || n.fatigue > 0.85) { settle(a, ctx.night ? 'sleep' : 'rest', 40 + a.random() * 40, ctx.night ? 'sleep' : 'lie_down'); return; }
    if (n.thirst > 0.65) { const edge = waterEdge(a); if (edge) { a.mode = 'drink'; a.target = edge; a.timer = 40; a.animation = 'idle'; return; } }
    if (Math.hypot(a.body.x - anchor.x, a.body.z - anchor.z) > radius) { a.mode = 'wander'; a.target = roamTarget(a, anchor, radius * 0.5) ?? anchor; a.timer = 40; a.animation = 'idle'; return; }
    if (herd && Math.hypot(a.body.x - herd.x, a.body.z - herd.z) > a.species.herd.cohesion) { a.mode = 'wander'; a.target = roamTarget(a, herd, a.species.herd.cohesion * 0.5) ?? herd; a.timer = 30; a.animation = 'idle'; return; }
    if (n.hunger > 0.45) { settle(a, 'graze', 8 + a.random() * 8, 'graze'); return; }
    const roll = a.random();
    if (roll < 0.4 && radius > 3) { const target = roamTarget(a, anchor, radius); if (target) { a.mode = 'wander'; a.target = target; a.timer = 30; a.animation = 'idle'; return; } }
    settle(a, 'idle', 4 + a.random() * 6, roll < 0.55 ? 'look_around' : roll < 0.7 ? 'sniff' : roll < 0.8 ? 'sit' : roll < 0.85 ? 'shake' : 'idle');
  }
  function free(a: AnimalState, dt: number, ctx: AnimalTickContext): void {
    const dx = ctx.player.x - a.body.x, dz = ctx.player.z - a.body.z, distance = Math.hypot(dx, dz), wild = a.author.role === 'wild';
    a.timer -= dt;
    a.lookAtPlayer = distance < a.species.perception.notice && a.mode !== 'sleep' && a.mode !== 'flee';
    if (wild && a.mode !== 'flee' && (distance < a.species.perception.flee || (distance < a.species.perception.notice * 0.6 && ctx.player.speed > 6))) {
      const away = Math.atan2(-dx, -dz) + (a.random() - 0.5) * 0.8;
      a.mode = 'flee'; a.gait = 'trot'; a.timer = 3 + a.random() * 2; a.animation = 'afraid';
      a.target = { x: a.body.x + Math.sin(away) * 14, z: a.body.z + Math.cos(away) * 14 };
    }
    switch (a.mode) {
      case 'flee':
        if (approach(a, dt, 1) || a.timer <= 0 || a.blocked) { a.gait = 'walk'; settle(a, 'alert', 3, 'react'); }
        return;
      case 'alert':
        still(a, dt);
        if (a.timer <= 0 && distance > a.species.perception.calm) choose(a, ctx); else if (a.timer <= 0) a.timer = 1.5;
        return;
      case 'wander':
        if (approach(a, dt, 0.8) || a.timer <= 0 || a.blocked) choose(a, ctx);
        return;
      case 'drink':
        if (a.target) { if (approach(a, dt, 0.7) || a.blocked) { a.target = null; a.timer = 6; a.animation = 'drink'; } else if (a.timer <= 0) choose(a, ctx); return; }
        still(a, dt); a.needs.thirst = Math.max(0, a.needs.thirst - dt * 0.2);
        if (a.timer <= 0) choose(a, ctx);
        return;
      case 'follow': {
        if (!a.author.follows && a.timer <= 0) { a.mode = 'stay'; return; }
        a.target = { x: ctx.player.x, z: ctx.player.z }; a.gait = distance > 9 ? 'trot' : distance > 5 ? 'fast' : 'walk';
        if (distance < 3) still(a, dt); else { approach(a, dt, 2.6); a.animation = 'idle'; }
        return;
      }
      case 'graze':
        still(a, dt); a.needs.hunger = Math.max(0, a.needs.hunger - dt * 0.06);
        if (a.timer <= 0) choose(a, ctx);
        return;
      case 'rest': case 'sleep':
        still(a, dt); a.needs.fatigue = Math.max(0, a.needs.fatigue - dt * (a.mode === 'sleep' ? 0.02 : 0.012));
        if (wild && distance < a.species.perception.flee * 1.6) { settle(a, 'alert', 2.5, 'stand_up'); return; }
        if (a.timer <= 0 || (a.needs.fatigue <= 0 && !ctx.night)) { a.mode = 'idle'; a.timer = 2.5; a.animation = 'stand_up'; }
        return;
      default:
        still(a, dt);
        if (a.author.follows && a.ownerId === PLAYER_OWNER && a.mode !== 'stay' && distance > 5) { a.mode = 'follow'; a.timer = 0; return; }
        if (a.timer <= 0) choose(a, ctx);
    }
  }
  /** Authored route: back and forth between the ends, pausing (rider on foot) at each. */
  function route(a: AnimalState, dt: number): void {
    const path = a.author.path!;
    if (a.mode === 'pause') {
      still(a, dt); a.timer -= dt; a.riderMounted = false; a.animation = 'wait_loading';
      if (a.timer <= 0) { a.mode = 'route'; a.riderMounted = a.rider !== null; a.animation = 'idle'; }
      return;
    }
    a.target = path[a.routeIndex]; a.gait = 'walk';
    const arrived = approach(a, dt, vehicleOf(a) ? 1.4 : 0.9);
    if (a.blocked) { a.timer += dt; if (a.timer > 6) { a.timer = 0; a.routeDirection = a.routeDirection === 1 ? -1 : 1; } } else if (!arrived) a.timer = 0;
    if (!arrived) return;
    const next = a.routeIndex + a.routeDirection;
    if (next < 0 || next >= path.length) { a.routeDirection = a.routeDirection === 1 ? -1 : 1; a.routeIndex += a.routeDirection; a.mode = 'pause'; a.riderMounted = false; a.timer = a.author.pauseSeconds ?? 20; }
    else a.routeIndex = next;
  }
  /** Far animals: needs and position evolve without navigation, at walking pace. */
  function abstract(a: AnimalState, seconds: number, ctx: AnimalTickContext): void {
    a.travelled = 0; a.body.speed = 0; a.body.turnRate = 0;
    if (a.mode === 'ridden') return;
    if (a.mode === 'pause') { a.timer -= seconds; if (a.timer <= 0) { a.mode = 'route'; a.riderMounted = a.rider !== null; } return; }
    const target = a.mode === 'route' ? a.author.path![a.routeIndex] : a.target;
    if (target && a.mode !== 'follow') {
      const dx = target.x - a.body.x, dz = target.z - a.body.z, distance = Math.hypot(dx, dz), reach = a.species.speeds.walk * 0.7 * seconds;
      const t = distance > 1e-3 ? Math.min(1, reach / distance) : 1, x = a.body.x + dx * t, z = a.body.z + dz * t;
      a.body.x = x; a.body.z = z; a.body.y = env.ground(x, z); if (distance > 0.5) a.body.heading = Math.atan2(dx, dz);
      const v = vehicleOf(a); if (v) followHitch(v.trailer, hitchPoint(a.body, a.species), a.species.vehicles[v.kind]);
      if (t >= 1) {
        if (a.mode === 'route') { a.target = null; const path = a.author.path!, next = a.routeIndex + a.routeDirection;
          if (next < 0 || next >= path.length) { a.routeDirection = a.routeDirection === 1 ? -1 : 1; a.routeIndex += a.routeDirection; a.mode = 'pause'; a.riderMounted = false; a.timer = a.author.pauseSeconds ?? 20; } else a.routeIndex = next; }
        else { a.target = null; a.timer = 0; }
      }
      return;
    }
    a.timer -= seconds;
    if (a.mode === 'graze') a.needs.hunger = Math.max(0, a.needs.hunger - seconds * 0.06);
    if (lying(a)) a.needs.fatigue = Math.max(0, a.needs.fatigue - seconds * 0.015);
    if (a.timer <= 0 && a.mode !== 'stay') choose(a, ctx);
  }

  function tick(dt: number, ctx: AnimalTickContext): void {
    clock += dt;
    const needRate = ctx.hoursPerSecond * dt;
    for (const herd of herds.values()) {
      if (!herd.members.length) continue;
      let x = 0, z = 0; for (const m of herd.members) { x += m.body.x; z += m.body.z; }
      herd.x = x / herd.members.length; herd.z = z / herd.members.length;
    }
    for (const a of animals.values()) {
      const p = a.previous; p.x = a.body.x; p.y = a.body.y; p.z = a.body.z; p.heading = a.body.heading;
      const v = vehicleOf(a); if (v) { v.previous.x = v.trailer.x; v.previous.z = v.trailer.z; v.previous.heading = v.trailer.heading; }
      a.needs.hunger = Math.min(1, a.needs.hunger + a.species.needs.hunger * needRate);
      a.needs.thirst = Math.min(1, a.needs.thirst + a.species.needs.thirst * needRate);
      if (!lying(a)) a.needs.fatigue = Math.min(1, a.needs.fatigue + a.species.needs.fatigue * needRate * (a.vehicleId || a.rider ? 1.5 : 1));
      if (a === ridden) { a.tier = 'full'; a.gait = drive.gait; move(a, drive, dt); a.animation = 'idle'; continue; }
      const distance = Math.hypot(ctx.player.x - a.body.x, ctx.player.z - a.body.z);
      // Hysteresis keeps an animal from flickering between tiers at a boundary.
      const tier = npcActivity(a.tier === 'full' ? distance - 6 : a.tier === 'dormant' ? distance + 6 : distance);
      a.tier = tier;
      if (tier === 'full') { if (a.author.path) route(a, dt); else free(a, dt, ctx); continue; }
      a.pending += dt;
      const interval = tier === 'reduced' ? 0.5 : 6;
      if (a.pending < interval) { a.travelled = 0; continue; }
      const elapsed = a.pending; a.pending = 0;
      if (tier === 'dormant') { abstract(a, elapsed, ctx); continue; }
      // Mid distance: same rules, coarse steps (two 0.25 s steps per decision).
      for (let left = elapsed; left > 1e-3; left -= 0.25) { const step = Math.min(0.25, left); if (a.author.path) route(a, step); else free(a, step, ctx); }
    }
  }
  function setDrive(input: DriveInput): void { drive = input; }
  /** World position of the rider's seat (rider socket), interpolated by the view if needed. */
  function seat(a: AnimalState): { x: number; y: number; z: number; heading: number } {
    const s = Math.sin(a.body.heading), c = Math.cos(a.body.heading), back = a.species.riderSeat.back;
    return { x: a.body.x - s * back, y: a.body.y + a.species.riderSeat.height, z: a.body.z - c * back, heading: a.body.heading };
  }
  /** Nearest animal or parked vehicle within reach of a point. */
  function nearest(x: number, z: number, reach = 3.2): { animal: AnimalState | null; vehicle: VehicleState | null } {
    let animal: AnimalState | null = null, vehicle: VehicleState | null = null, best = reach, bestVehicle = reach;
    for (const a of animals.values()) {
      if (a.tier !== 'full' || a === ridden) continue;
      const d = Math.hypot(a.body.x - x, a.body.z - z) - a.species.radius;
      if (d < best) { best = d; animal = a; }
    }
    for (const v of vehicles.values()) {
      if (v.hitchedTo) continue;
      const axle = trailerAxle(v.trailer, speciesOf('capybara').vehicles[v.kind]), d = Math.hypot(axle.x - x, axle.z - z) - 0.6;
      if (d < bestVehicle) { bestVehicle = d; vehicle = v; }
    }
    return { animal, vehicle };
  }
  /** Parked vehicle whose shafts the animal could take right now. */
  function hitchable(a: AnimalState): VehicleState | null {
    for (const v of vehicles.values()) if (!v.hitchedTo && canHitch(a, v).ok) return v;
    return null;
  }
  function save(): AnimalsSaveV1 {
    const out: AnimalsSaveV1 = { version: 1, animals: {}, vehicles: {} };
    for (const a of animals.values()) {
      if (!a.author.persistent) continue;
      out.animals[a.id] = { x: a.body.x, z: a.body.z, heading: a.body.heading, loadout: a.loadout, ownerId: a.ownerId, rider: a.rider === PLAYER_OWNER ? PLAYER_OWNER : null,
        vehicleId: a.vehicleId, cargo: { ...a.cargo }, needs: [a.needs.hunger, a.needs.thirst, a.needs.fatigue], resting: lying(a), borrowed: a.borrowed,
        routeIndex: a.routeIndex, routeDirection: a.routeDirection };
    }
    for (const v of vehicles.values()) {
      const owner = animals.get(v.id.replace(/:vehicle$/, ''));
      if (owner && !owner.author.persistent) continue;
      out.vehicles[v.id] = { kind: v.kind, x: v.trailer.x, z: v.trailer.z, heading: v.trailer.heading, hitchedTo: v.hitchedTo, cargo: { ...v.cargo }, ownerId: v.ownerId };
    }
    return out;
  }
  /** Applies a save on top of the authored state; unknown ids are ignored, pairings re-checked. */
  function restore(saved?: AnimalsSaveV1): void {
    if (!saved) return;
    for (const [id, s] of Object.entries(saved.vehicles)) {
      const v = vehicles.get(id);
      if (!v || v.kind !== s.kind) continue;
      Object.assign(v.trailer, { x: s.x, z: s.z, heading: s.heading }); Object.assign(v.previous, { x: s.x, z: s.z, heading: s.heading });
      v.cargo = { ...s.cargo }; v.ownerId = s.ownerId; v.hitchedTo = null;
    }
    for (const a of animals.values()) if (saved.animals[a.id]) { const v = vehicleOf(a); if (v) v.hitchedTo = null; a.vehicleId = null; if (isVehicleKind(a.loadout)) a.loadout = 'none'; }
    for (const [id, s] of Object.entries(saved.animals)) {
      const a = animals.get(id);
      if (!a || !a.author.persistent) continue;
      Object.assign(a.body, { x: s.x, z: s.z, heading: s.heading, y: env.ground(s.x, s.z), speed: 0, turnRate: 0 });
      Object.assign(a.previous, { x: a.body.x, y: a.body.y, z: a.body.z, heading: a.body.heading });
      a.ownerId = s.ownerId; a.borrowed = s.borrowed; a.cargo = { ...s.cargo }; a.routeIndex = Math.min(s.routeIndex, (a.author.path?.length ?? 1) - 1); a.routeDirection = s.routeDirection;
      [a.needs.hunger, a.needs.thirst, a.needs.fatigue] = s.needs;
      a.loadout = isVehicleKind(s.loadout) ? 'none' : s.loadout;
      const v = s.vehicleId ? vehicles.get(s.vehicleId) : undefined;
      if (v && !v.hitchedTo && saved.vehicles[v.id]?.hitchedTo === id) { v.hitchedTo = id; a.vehicleId = v.id; a.loadout = v.kind; }
      if (s.resting && !a.vehicleId) { a.mode = 'rest'; a.timer = 30; a.animation = 'lie_down'; }
      if (s.rider === PLAYER_OWNER && !ridden && canMount(a).ok) { a.rider = PLAYER_OWNER; a.riderMounted = true; a.mode = 'ridden'; ridden = a; }
    }
  }
  restore(options.saved);
  return {
    animals, vehicles, tick, setDrive, seat, nearest, hitchable, mayUse, canMount, mount, dismount, abandon, canHitch, hitch, canUnhitch, unhitch,
    equip, transfer, transferVehicle, acquire, call, stay, save, restore, vehicleOf, capacityOf, cargoOf, loadOf, limitsOf,
    get ridden() { return ridden; },
    get clock() { return clock; },
    get stats() { let full = 0, reduced = 0, dormant = 0; for (const a of animals.values()) { if (a.tier === 'full') full++; else if (a.tier === 'reduced') reduced++; else dormant++; } return { animals: animals.size, vehicles: vehicles.size, full, reduced, dormant }; },
  };
}
export type AnimalSimulation = ReturnType<typeof createAnimalSimulation>;
