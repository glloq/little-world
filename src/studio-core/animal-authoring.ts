/** Studio authoring of animals (doc 110) — elements of the universal selection, like the
 * mini-games: data lives in the optional `libraries.animals`, every write is validated by the
 * runtime schema, and an empty library is removed so untouched projects stay identical.
 */
import type { ProjectDocument } from './types.ts';
import { ANIMAL_ID, MAX_ANIMAL_ENTRIES, validateAnimal, type AnimalAuthorV1, type AnimalInstanceV1, type AnimalPoint } from '../animals/schema.ts';
import { isVehicleKind, speciesOf } from '../animals/species.ts';
import { validateAnimalRoute, type AnimalEnvironment, type RouteDiagnostic } from '../animals/locomotion.ts';

export const ANIMAL_PRESETS = {
  herd: { label: 'Harde sauvage', hint: 'Population déterministe limitée par l’habitat de la zone.' },
  wild: { label: 'Capybara sauvage', hint: 'Un individu libre, non montable.' },
  domestic: { label: 'Capybara domestique', hint: 'Animal de ferme ou de village, sans équipement.' },
  mount: { label: 'Monture sellée', hint: 'Montable par le joueur ou un habitant.' },
  pack: { label: 'Porteur à sacoches', hint: 'Transporte un chargement, sans cavalier.' },
  cart: { label: 'Attelage : charrette', hint: 'Petit véhicule à deux roues, marche arrière possible.' },
  wagon: { label: 'Attelage : chariot', hint: 'Grande capacité, virages larges.' },
  caravan: { label: 'Attelage : roulotte', hint: 'Habitation itinérante, la plus encombrante.' },
} as const;
export type AnimalPreset = keyof typeof ANIMAL_PRESETS;
const bounds = (p: ProjectDocument) => ({ width: p.world.bounds.maxX - p.world.bounds.minX, length: p.world.bounds.maxZ - p.world.bounds.minZ });
const centred = (p: ProjectDocument, at: AnimalPoint): AnimalPoint => {
  // The runtime frame is centred on the map; projects are authored in the same frame.
  const b = p.world.bounds;
  if (at.x < b.minX || at.x > b.maxX || at.z < b.minZ || at.z > b.maxZ) throw Error('Animal hors de la carte');
  return at;
};
export function animalOf(p: ProjectDocument, id: string): AnimalAuthorV1 | undefined { return p.libraries.animals?.[id]; }
export function putAnimal(document: ProjectDocument, animal: AnimalAuthorV1): AnimalAuthorV1 {
  const valid = validateAnimal(animal, bounds(document));
  centred(document, valid);
  const current = document.libraries.animals ?? {};
  if (!current[valid.id] && Object.keys(current).length >= MAX_ANIMAL_ENTRIES) throw Error(`Au plus ${MAX_ANIMAL_ENTRIES} animaux ou hardes par projet`);
  if (valid.kind === 'individual') for (const key of ['ownerId', 'riderId'] as const) {
    const target = valid[key];
    if (target && target !== 'player' && !document.entityIndex[target]) throw Error(`${key === 'ownerId' ? 'Propriétaire' : 'Cavalier'} introuvable : ${target}`);
  }
  document.libraries = { ...document.libraries, animals: { ...current, [valid.id]: valid } };
  return valid;
}
export function removeAnimal(document: ProjectDocument, id: string): void {
  const current = document.libraries.animals;
  if (!current?.[id]) return;
  const { [id]: _removed, ...rest } = current;
  const libraries = { ...document.libraries };
  if (Object.keys(rest).length) libraries.animals = rest; else delete libraries.animals;
  document.libraries = libraries;
}
export function nextAnimalId(document: ProjectDocument, stem: string): string {
  for (let n = 1; ; n++) { const id = `animal:${stem}-${n}`; if (!document.libraries.animals?.[id] && !document.entityIndex[id]) return id; }
}
export function createAnimal(document: ProjectDocument, preset: AnimalPreset, at: AnimalPoint & { heading?: number }, name?: string): AnimalAuthorV1 {
  const id = nextAnimalId(document, preset === 'herd' ? 'harde' : 'capybara'), point = centred(document, { x: at.x, z: at.z });
  if (preset === 'herd') return { version: 1, kind: 'herd', id, species: 'capybara', name: name ?? 'Capybaras sauvages', ...point, radius: 18, count: 5, seed: hashSeed(id) };
  const base: AnimalInstanceV1 = { version: 1, kind: 'individual', id, species: 'capybara', name: name ?? ANIMAL_PRESETS[preset].label, role: 'domestic', ...point, heading: at.heading ?? 0,
    loadout: 'none', initialState: 'idle', access: 'anyone', roamRadius: 6, persistent: true };
  switch (preset) {
    case 'wild': return { ...base, role: 'wild', access: 'nobody', roamRadius: 20, initialState: 'graze', persistent: false, home: point };
    case 'domestic': return { ...base, home: point };
    case 'mount': return { ...base, role: 'mount', loadout: 'saddle', roamRadius: 0 };
    case 'pack': return { ...base, loadout: 'pack', roamRadius: 0 };
    default: return { ...base, role: 'draft', loadout: preset, roamRadius: 0 };
  }
}
const hashSeed = (text: string): number => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

/* ---- Universal selection adapter (same contract as the mini-game elements). ---- */
export function animalElementData(p: ProjectDocument, id: string): { x: number; z: number; radius: number; name: string } | undefined {
  const a = animalOf(p, id);
  if (!a) return undefined;
  const species = speciesOf(a.species);
  const radius = a.kind === 'herd' ? a.radius : isVehicleKind(a.loadout) ? species.vehicles[a.loadout].length + species.hitchOffset : Math.max(1.2, species.halfLength);
  return { x: a.x, z: a.z, radius, name: a.name };
}
const ROLE_LABELS = { wild: 'sauvage', domestic: 'domestique', mount: 'monture', draft: 'transport' } as const;
export function animalElementLabel(p: ProjectDocument, id: string): string {
  const a = animalOf(p, id);
  if (!a) return id;
  return a.kind === 'herd' ? `${a.name} · harde de ${a.count}` : `${a.name} · ${ROLE_LABELS[a.role]}${a.loadout === 'none' ? '' : ' · ' + a.loadout}`;
}
export function animalElementsAt(p: ProjectDocument, x: number, z: number, tolerance: number): { ref: { kind: 'animal'; id: string }; d: number }[] {
  const out: { ref: { kind: 'animal'; id: string }; d: number }[] = [];
  for (const a of Object.values(p.libraries.animals ?? {})) {
    const d = Math.hypot(a.x - x, a.z - z), reach = a.kind === 'herd' ? a.radius : 1.6;
    // Individuals are picked before the herd zone that may surround them.
    if (d <= reach + tolerance) out.push({ ref: { kind: 'animal', id: a.id }, d: a.kind === 'herd' ? 90 : d - 2 });
  }
  return out;
}
export function moveAnimal(draft: ProjectDocument, id: string, offset: AnimalPoint): void {
  const a = animalOf(draft, id);
  if (!a) return;
  const shift = (q: AnimalPoint): AnimalPoint => ({ x: q.x + offset.x, z: q.z + offset.z });
  // The route and home follow the animal: a moved team keeps its whole itinerary.
  putAnimal(draft, a.kind === 'herd' ? { ...a, ...shift(a) } : { ...a, ...shift(a), ...(a.home ? { home: shift(a.home) } : {}), ...(a.path ? { path: a.path.map(shift) } : {}) });
}
export function duplicateAnimal(draft: ProjectDocument, id: string, offset: AnimalPoint): { kind: 'animal'; id: string } | null {
  const a = animalOf(draft, id);
  if (!a) return null;
  const copyId = nextAnimalId(draft, a.kind === 'herd' ? 'harde' : 'capybara');
  const copy = structuredClone(a) as AnimalAuthorV1;
  copy.id = copyId; copy.x += offset.x; copy.z += offset.z;
  if (copy.kind === 'herd') copy.seed = hashSeed(copyId);
  else {
    if (copy.home) copy.home = { x: copy.home.x + offset.x, z: copy.home.z + offset.z };
    if (copy.path) copy.path = copy.path.map((q) => ({ x: q.x + offset.x, z: q.z + offset.z }));
    // An NPC rides one animal at a time: the copy keeps the owner, not the rider.
    if (copy.riderId) { delete copy.riderId; delete copy.path; delete copy.pauseSeconds; }
  }
  putAnimal(draft, copy);
  return { kind: 'animal', id: copyId };
}
/** Whitelisted inspector patch; `null` removes an optional field. */
const PATCHABLE = ['name', 'role', 'heading', 'loadout', 'initialState', 'ownerId', 'riderId', 'access', 'home', 'roamRadius', 'path', 'pauseSeconds', 'follows', 'cargo', 'acquisition', 'dwelling', 'persistent',
  'radius', 'count', 'seed', 'x', 'z'] as const;
export function updateAnimal(draft: ProjectDocument, id: string, patch: Record<string, unknown>): void {
  const a = animalOf(draft, id);
  if (!a) throw Error('Animal introuvable');
  const next = structuredClone(a) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (!(PATCHABLE as readonly string[]).includes(key)) throw Error(`Champ non modifiable : ${key}`);
    if (value === null || value === undefined) delete next[key]; else next[key] = structuredClone(value);
  }
  putAnimal(draft, next as unknown as AnimalAuthorV1);
}
export function listAnimalElements(p: ProjectDocument): { kind: 'animal'; id: string }[] {
  return Object.keys(p.libraries.animals ?? {}).map((id) => ({ kind: 'animal' as const, id }));
}
/** NPC entities that may own or ride an animal (Character component), from the loaded sectors and the index. */
export function animalKeeperChoices(p: ProjectDocument): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const entry of Object.values(p.entityIndex)) {
    const source = p.chunks[entry.ownerChunkId]?.entities[entry.id];
    if (entry.kind === 'character' || source?.components.Character) out.push({ id: entry.id, name: entry.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
/** Route diagnostics for the inspector (terrain, water, width, corners, turn-round room). */
export function inspectAnimalRoute(p: ProjectDocument, id: string, env: AnimalEnvironment): RouteDiagnostic[] {
  const a = animalOf(p, id);
  if (!a || a.kind !== 'individual' || !a.path) return [];
  return validateAnimalRoute(a.path, speciesOf(a.species), isVehicleKind(a.loadout) ? a.loadout : null, env);
}
/** Other animals already ridden by the same NPC (an NPC drives one team). */
export function animalConflicts(p: ProjectDocument, id: string): string[] {
  const a = animalOf(p, id), out: string[] = [];
  if (!a || a.kind !== 'individual') return out;
  if (a.riderId) for (const other of Object.values(p.libraries.animals ?? {}))
    if (other.id !== id && other.kind === 'individual' && other.riderId === a.riderId) out.push(`${other.name} est déjà conduit par le même habitant.`);
  return out;
}
export { ANIMAL_ID };
/** Patch that keeps an animal coherent when its role changes (the schema rejects mixed states). */
export function animalRolePatch(a: AnimalInstanceV1, role: AnimalInstanceV1['role']): Record<string, unknown> {
  if (role === 'wild') return { role, loadout: 'none', access: 'nobody', ownerId: null, riderId: null, path: null, pauseSeconds: null, cargo: null, acquisition: null, dwelling: null, follows: null, persistent: false, roamRadius: Math.max(a.roamRadius, 12), initialState: 'graze' };
  const patch: Record<string, unknown> = { role, access: a.access === 'nobody' ? 'anyone' : a.access, persistent: true };
  if (role === 'draft') Object.assign(patch, { loadout: isVehicleKind(a.loadout) ? a.loadout : 'cart', initialState: 'idle', roamRadius: 0 }, a.loadout === 'pack' ? {} : { cargo: a.cargo ?? null });
  else if (isVehicleKind(a.loadout)) Object.assign(patch, { loadout: role === 'mount' ? 'saddle' : 'none', cargo: null, dwelling: null });
  return patch;
}
/** Patch for an equipment change (cargo needs a container, a caravan may be a dwelling, a team never sleeps). */
export function animalLoadoutPatch(a: AnimalInstanceV1, loadout: AnimalInstanceV1['loadout']): Record<string, unknown> {
  const patch: Record<string, unknown> = { loadout };
  if (isVehicleKind(loadout)) Object.assign(patch, { role: 'draft', initialState: a.initialState === 'rest' || a.initialState === 'sleep' ? 'idle' : a.initialState });
  else if (a.role === 'draft') patch.role = 'domestic';
  if (loadout !== 'pack' && !isVehicleKind(loadout)) patch.cargo = null;
  if (loadout !== 'caravan') patch.dwelling = null;
  if (loadout === 'pack' && a.riderId) Object.assign(patch, { riderId: null });
  return patch;
}
