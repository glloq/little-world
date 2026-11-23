/** Persistent animal state (`GameSaveV2.animals`, optional) — strict parse and repair.
 * Authored data stays in the project; the save only holds what a session changed.
 */
import { ANIMAL_LOADOUTS, ANIMAL_VEHICLES, type AnimalLoadout, type AnimalVehicleKind } from './species.ts';
import type { Cargo } from './cargo.ts';

export interface AnimalSaveEntry { x: number; z: number; heading: number; loadout: AnimalLoadout; ownerId: string | null; rider: string | null;
  vehicleId: string | null; cargo: Cargo; needs: [number, number, number]; resting: boolean; borrowed: boolean; routeIndex: number; routeDirection: 1 | -1 }
export interface VehicleSaveEntry { kind: AnimalVehicleKind; x: number; z: number; heading: number; hitchedTo: string | null; cargo: Cargo; ownerId: string | null }
export interface AnimalsSaveV1 { version: 1; animals: Record<string, AnimalSaveEntry>; vehicles: Record<string, VehicleSaveEntry> }

const fail = (message: string): never => { throw new Error(`Sauvegarde des animaux invalide : ${message}`); };
const obj = (v: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(label);
  for (const key of Object.keys(v as object)) if (!keys.includes(key)) fail(`champ inconnu ${label}.${key}`);
  for (const key of keys) if (!(key in (v as object))) fail(`champ manquant ${label}.${key}`);
  return v as Record<string, unknown>;
};
const num = (v: unknown, label: string, min = -1e6, max = 1e6): number => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(label); return v as number; };
const ref = (v: unknown, label: string): string | null => { if (v !== null && (typeof v !== 'string' || !v || v.length > 200)) fail(label); return v as string | null; };
function cargo(v: unknown): Cargo {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('cargo');
  const out: Cargo = {};
  for (const [itemId, n] of Object.entries(v as object)) {
    if (!itemId || itemId.length > 100 || !Number.isInteger(n) || (n as number) < 1 || (n as number) > 9999) fail('cargo');
    out[itemId] = n as number;
  }
  if (Object.keys(out).length > 64) fail('cargo');
  return out;
}
export function parseAnimalsSave(value: unknown): AnimalsSaveV1 {
  const root = obj(value, ['version', 'animals', 'vehicles'], 'animals');
  if (root.version !== 1) fail('version');
  const animals: AnimalsSaveV1['animals'] = {}, vehicles: AnimalsSaveV1['vehicles'] = {};
  const dict = (v: unknown, label: string): [string, unknown][] => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(label);
    const entries = Object.entries(v as object);
    if (entries.length > 512 || entries.some(([id]) => !id || id.length > 200)) fail(label);
    return entries;
  };
  for (const [id, raw] of dict(root.animals, 'animals')) {
    const a = obj(raw, ['x', 'z', 'heading', 'loadout', 'ownerId', 'rider', 'vehicleId', 'cargo', 'needs', 'resting', 'borrowed', 'routeIndex', 'routeDirection'], id);
    if (!ANIMAL_LOADOUTS.includes(a.loadout as AnimalLoadout)) fail('loadout');
    if (!Array.isArray(a.needs) || a.needs.length !== 3) fail('needs');
    if (typeof a.resting !== 'boolean' || typeof a.borrowed !== 'boolean') fail('resting');
    if (a.routeDirection !== 1 && a.routeDirection !== -1) fail('routeDirection');
    animals[id] = { x: num(a.x, 'x'), z: num(a.z, 'z'), heading: num(a.heading, 'heading', -7, 7), loadout: a.loadout as AnimalLoadout,
      ownerId: ref(a.ownerId, 'ownerId'), rider: ref(a.rider, 'rider'), vehicleId: ref(a.vehicleId, 'vehicleId'), cargo: cargo(a.cargo),
      needs: (a.needs as unknown[]).map((n) => num(n, 'needs', 0, 1)) as [number, number, number], resting: a.resting as boolean, borrowed: a.borrowed as boolean,
      routeIndex: Math.round(num(a.routeIndex, 'routeIndex', 0, 64)), routeDirection: a.routeDirection as 1 | -1 };
  }
  for (const [id, raw] of dict(root.vehicles, 'vehicles')) {
    const v = obj(raw, ['kind', 'x', 'z', 'heading', 'hitchedTo', 'cargo', 'ownerId'], id);
    if (!ANIMAL_VEHICLES.includes(v.kind as AnimalVehicleKind)) fail('kind');
    vehicles[id] = { kind: v.kind as AnimalVehicleKind, x: num(v.x, 'x'), z: num(v.z, 'z'), heading: num(v.heading, 'heading', -7, 7),
      hitchedTo: ref(v.hitchedTo, 'hitchedTo'), cargo: cargo(v.cargo), ownerId: ref(v.ownerId, 'ownerId') };
  }
  // Repair pairings: a vehicle and its animal must name each other, one to one.
  for (const [id, v] of Object.entries(vehicles)) {
    const animal = v.hitchedTo ? animals[v.hitchedTo] : undefined;
    if (v.hitchedTo && animal?.vehicleId !== id) v.hitchedTo = null;
  }
  for (const a of Object.values(animals)) {
    const vehicle = a.vehicleId ? vehicles[a.vehicleId] : undefined;
    if (a.vehicleId && (!vehicle || vehicle.hitchedTo === null)) { a.vehicleId = null; if (ANIMAL_VEHICLES.includes(a.loadout as AnimalVehicleKind)) a.loadout = 'none'; }
  }
  return { version: 1, animals, vehicles };
}
