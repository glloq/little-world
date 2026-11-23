/** Authored animals (`libraries.animals`, optional) — strict validation, no Three.js.
 * An entry is either one animal or a wild herd expanded deterministically at runtime.
 * Unknown fields are rejected, like every other V3 library.
 */
import { ANIMAL_LOADOUTS, ANIMAL_SPECIES, isVehicleKind, speciesOf, type AnimalLoadout } from './species.ts';

export const ANIMAL_ROLES = ['wild', 'domestic', 'mount', 'draft'] as const;
export type AnimalRole = typeof ANIMAL_ROLES[number];
export const ANIMAL_INITIAL_STATES = ['idle', 'graze', 'rest', 'sleep'] as const;
export type AnimalInitialState = typeof ANIMAL_INITIAL_STATES[number];
/** Who may ride, lead, hitch or open the cargo of a domestic animal. */
export const ANIMAL_ACCESS = ['owner', 'anyone', 'nobody'] as const;
export type AnimalAccess = typeof ANIMAL_ACCESS[number];
export const ANIMAL_ACQUISITIONS = ['granted', 'purchase', 'quest', 'loan'] as const;
export type AnimalAcquisition = typeof ANIMAL_ACQUISITIONS[number];
export const PLAYER_OWNER = 'player';
export interface AnimalPoint { x: number; z: number }
export interface AnimalBounds { width: number; length: number }
export interface AnimalInstanceV1 {
  version: 1; kind: 'individual'; id: string; species: string; name: string; role: AnimalRole;
  x: number; z: number; heading: number;
  loadout: AnimalLoadout;
  initialState: AnimalInitialState;
  /** Entity id of the owning NPC, or `player`. Wild animals have no owner. */
  ownerId?: string;
  /** NPC entity that rides or drives this animal along `path`. */
  riderId?: string;
  access: AnimalAccess;
  /** Home / parking point and the radius the animal may roam around it. */
  home?: AnimalPoint; roamRadius: number;
  /** Route (delivery, trade, patrol): the team goes back and forth, pausing at both ends. */
  path?: AnimalPoint[]; pauseSeconds?: number;
  /** A free domestic animal follows its owner when true. */
  follows?: boolean;
  cargo?: { itemId: string; quantity: number }[];
  /** How the player obtains it (`purchase` needs `price` coins, `quest` a quest id). */
  acquisition?: { mode: AnimalAcquisition; price?: number; questId?: string };
  /** Parked caravans may become a dwelling later: reserved, validated, not simulated yet. */
  dwelling?: boolean;
  /** When false the runtime state (position, cargo) is not written to saves. */
  persistent: boolean;
}
export interface AnimalHerdV1 {
  version: 1; kind: 'herd'; id: string; species: string; name: string;
  x: number; z: number; radius: number; count: number; seed: number;
}
export type AnimalAuthorV1 = AnimalInstanceV1 | AnimalHerdV1;
export const MAX_ANIMAL_ENTRIES = 96;
export const MAX_HERD_COUNT = 12;
export const ANIMAL_ID = /^animal:[a-zA-Z0-9_-]{1,100}$/;
const ENTITY_ID = /^[a-zA-Z0-9_:.-]{1,160}$/;

const fail = (message: string): never => { throw new Error(`Animal invalide : ${message}`); };
function record(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} doit être un objet`);
  for (const key of Object.keys(value as object)) if (!allowed.includes(key)) fail(`champ inconnu ${label}.${key}`);
  return value as Record<string, unknown>;
}
const number = (v: unknown, label: string, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${label} hors limites [${min}, ${max}]`);
  return v as number;
};
const oneOf = <T extends string>(v: unknown, values: readonly T[], label: string): T => {
  if (!values.includes(v as T)) fail(`${label} inconnu : ${String(v)}`);
  return v as T;
};
const text = (v: unknown, label: string, max = 80): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${label} doit être un texte de 1 à ${max} caractères`);
  return v as string;
};
function point(v: unknown, label: string, bounds?: AnimalBounds): AnimalPoint {
  const p = record(v, ['x', 'z'], label);
  const hx = bounds ? bounds.width / 2 : 1e6, hz = bounds ? bounds.length / 2 : 1e6;
  return { x: number(p.x, `${label}.x`, -hx, hx), z: number(p.z, `${label}.z`, -hz, hz) };
}
const INSTANCE_KEYS = ['version', 'kind', 'id', 'species', 'name', 'role', 'x', 'z', 'heading', 'loadout', 'initialState', 'ownerId', 'riderId',
  'access', 'home', 'roamRadius', 'path', 'pauseSeconds', 'follows', 'cargo', 'acquisition', 'dwelling', 'persistent'];
const HERD_KEYS = ['version', 'kind', 'id', 'species', 'name', 'x', 'z', 'radius', 'count', 'seed'];

export function validateAnimal(raw: unknown, bounds?: AnimalBounds): AnimalAuthorV1 {
  const kind = oneOf((raw as { kind?: unknown } | null)?.kind, ['individual', 'herd'] as const, 'kind');
  const v = record(raw, kind === 'herd' ? HERD_KEYS : INSTANCE_KEYS, 'animal');
  if (v.version !== 1) fail('version non prise en charge');
  if (typeof v.id !== 'string' || !ANIMAL_ID.test(v.id)) fail('id attendu sous la forme animal:<nom>');
  const id = v.id as string, species = oneOf(v.species, Object.keys(ANIMAL_SPECIES), 'espèce'), name = text(v.name, 'name');
  const at = point({ x: v.x, z: v.z }, 'position', bounds);
  if (kind === 'herd') {
    return { version: 1, kind, id, species, name, ...at, radius: number(v.radius, 'radius', 4, 200),
      count: Math.round(number(v.count, 'count', 1, MAX_HERD_COUNT)), seed: Math.round(number(v.seed, 'seed', 0, 0xffffffff)) };
  }
  const role = oneOf(v.role, ANIMAL_ROLES, 'rôle'), loadout = oneOf(v.loadout, ANIMAL_LOADOUTS, 'équipement');
  const definition = speciesOf(species);
  if (!definition.loadouts.includes(loadout)) fail(`équipement ${loadout} incompatible avec ${species}`);
  const out: AnimalInstanceV1 = {
    version: 1, kind, id, species, name, role, ...at, heading: number(v.heading, 'heading', -Math.PI * 2, Math.PI * 2), loadout,
    initialState: oneOf(v.initialState, ANIMAL_INITIAL_STATES, 'état initial'), access: oneOf(v.access, ANIMAL_ACCESS, 'accès'),
    roamRadius: number(v.roamRadius, 'roamRadius', 0, 200), persistent: v.persistent === true,
  };
  if (typeof v.persistent !== 'boolean') fail('persistent doit être un booléen');
  for (const key of ['ownerId', 'riderId'] as const) if (v[key] !== undefined) {
    if (typeof v[key] !== 'string' || !ENTITY_ID.test(v[key] as string)) fail(`${key} invalide`);
    out[key] = v[key] as string;
  }
  if (v.home !== undefined) out.home = point(v.home, 'home', bounds);
  if (v.path !== undefined) {
    if (!Array.isArray(v.path) || v.path.length < 2 || v.path.length > 64) fail('path doit contenir 2 à 64 points');
    out.path = (v.path as unknown[]).map((p, i) => point(p, `path[${i}]`, bounds));
  }
  if (v.pauseSeconds !== undefined) out.pauseSeconds = number(v.pauseSeconds, 'pauseSeconds', 0, 3600);
  if (v.follows !== undefined) { if (typeof v.follows !== 'boolean') fail('follows doit être un booléen'); out.follows = v.follows as boolean; }
  if (v.dwelling !== undefined) { if (typeof v.dwelling !== 'boolean') fail('dwelling doit être un booléen'); out.dwelling = v.dwelling as boolean; }
  if (v.cargo !== undefined) {
    if (!Array.isArray(v.cargo) || v.cargo.length > 24) fail('cargo doit contenir au plus 24 lignes');
    out.cargo = (v.cargo as unknown[]).map((line, i) => {
      const c = record(line, ['itemId', 'quantity'], `cargo[${i}]`);
      return { itemId: text(c.itemId, 'itemId', 100), quantity: Math.round(number(c.quantity, 'quantity', 1, 9999)) };
    });
    if (new Set(out.cargo.map((c) => c.itemId)).size !== out.cargo.length) fail('cargo contient un objet en double');
  }
  if (v.acquisition !== undefined) {
    const a = record(v.acquisition, ['mode', 'price', 'questId'], 'acquisition');
    out.acquisition = { mode: oneOf(a.mode, ANIMAL_ACQUISITIONS, 'acquisition') };
    if (a.price !== undefined) out.acquisition.price = Math.round(number(a.price, 'price', 0, 99999));
    if (a.questId !== undefined) out.acquisition.questId = text(a.questId, 'questId', 160);
    if (out.acquisition.mode === 'purchase' && out.acquisition.price === undefined) fail('un achat exige un prix');
    if (out.acquisition.mode === 'quest' && !out.acquisition.questId) fail('une quête exige questId');
  }
  // Coherence rules shared by Studio and runtime (doc 110 §états).
  if (role === 'wild') {
    if (out.ownerId || out.riderId || loadout !== 'none' || out.acquisition) fail('un animal sauvage n’a ni propriétaire, ni équipement, ni acquisition');
  }
  if (isVehicleKind(loadout) && role !== 'draft') fail('un véhicule exige le rôle « transport »');
  if (isVehicleKind(loadout) && (out.initialState === 'rest' || out.initialState === 'sleep')) fail('un animal attelé ne peut pas dormir');
  if (out.riderId && !out.path) fail('un cavalier PNJ exige un trajet');
  if (out.riderId && loadout === 'pack') fail('des sacoches ne laissent pas de place à un cavalier');
  if (out.cargo && loadout !== 'pack' && !isVehicleKind(loadout)) fail('un chargement exige des sacoches ou un véhicule');
  if (out.dwelling && loadout !== 'caravan') fail('seule une roulotte peut devenir une habitation');
  if (out.path && role === 'wild') fail('un animal sauvage ne suit pas de trajet');
  return out;
}
export function validateAnimals(raw: unknown, bounds?: AnimalBounds): Record<string, AnimalAuthorV1> {
  const entries = Object.entries(record(raw, Object.keys((raw ?? {}) as object), 'animals'));
  if (entries.length > MAX_ANIMAL_ENTRIES) fail(`au plus ${MAX_ANIMAL_ENTRIES} entrées`);
  return Object.fromEntries(entries.map(([id, value]) => {
    const animal = validateAnimal(value, bounds);
    if (animal.id !== id) fail(`clé ${id} différente de l’id ${animal.id}`);
    return [id, animal];
  }));
}
