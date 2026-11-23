/** Opt-in demonstration (`?animalDemo=1`): nothing here is written to a published island.
 * It lays out, around the player, one of each case to try: a wild herd, a resting animal,
 * a saddled mount, a pack animal, a wagon team to hitch/unhitch and two NPC teams on routes.
 */
import { DEFAULT_APPEARANCE } from '../character-style.ts';
import type { NPCDefinition } from '../npc.ts';
import type { AnimalAuthorV1, AnimalInstanceV1, AnimalPoint } from './schema.ts';
import { validateAnimal } from './schema.ts';

export interface DemoGround { ground(x: number, z: number): number; water(x: number, z: number): number | null; inside(x: number, z: number): boolean }
export const DEMO_CARTER = 'npc:animal-demo-carter';
export const DEMO_TRAVELLER = 'npc:animal-demo-traveller';

export function demoAnimals(origin: AnimalPoint, env: DemoGround): { animals: Record<string, AnimalAuthorV1>; npcs: NPCDefinition[] } {
  /** Nearest dry, gentle point to a wished offset (spiral search). */
  const dry = (dx: number, dz: number): AnimalPoint => {
    for (let r = 0; r < 60; r += 3) for (let k = 0; k < (r ? 8 : 1); k++) {
      const x = origin.x + dx + Math.cos(k * Math.PI / 4) * r, z = origin.z + dz + Math.sin(k * Math.PI / 4) * r;
      if (env.inside(x, z) && env.water(x, z) === null && Math.abs(env.ground(x + 1, z) - env.ground(x - 1, z)) < 0.5 && Math.abs(env.ground(x, z + 1) - env.ground(x, z - 1)) < 0.5) return { x, z };
    }
    return { x: origin.x + dx, z: origin.z + dz };
  };
  const base = { version: 1 as const, kind: 'individual' as const, species: 'capybara', heading: 0, initialState: 'idle' as const, access: 'anyone' as const, roamRadius: 0, persistent: true };
  const loop = (cx: number, cz: number, r: number): AnimalPoint[] => [dry(cx - r, cz), dry(cx, cz + r), dry(cx + r, cz)];
  const list: AnimalAuthorV1[] = [
    { version: 1, kind: 'herd', id: 'animal:demo-herd', species: 'capybara', name: 'Capybara sauvage', ...dry(22, 30), radius: 14, count: 5, seed: 20261123 },
    { ...base, id: 'animal:demo-rest', name: 'Praline', role: 'domestic', ...dry(-7, 9), loadout: 'none', initialState: 'rest', roamRadius: 4 },
    { ...base, id: 'animal:demo-mount', name: 'Caramel', role: 'mount', ...dry(4, 7), loadout: 'saddle' },
    { ...base, id: 'animal:demo-pack', name: 'Biscotte', role: 'domestic', ...dry(9, 4), loadout: 'pack', heading: 1.2 },
    { ...base, id: 'animal:demo-wagon', name: 'Noisette', role: 'draft', ...dry(-12, 16), loadout: 'wagon', heading: -0.6 },
    { ...base, id: 'animal:demo-shop', name: 'Châtaigne', role: 'mount', ...dry(-3, 16), loadout: 'saddle', access: 'owner', ownerId: DEMO_CARTER, acquisition: { mode: 'purchase', price: 25 } },
    { ...base, id: 'animal:demo-cart', name: 'Capybara du charretier', role: 'draft', ...dry(-22, 30), loadout: 'cart', access: 'owner', ownerId: DEMO_CARTER, riderId: DEMO_CARTER, path: loop(0, 36, 22), pauseSeconds: 10 },
    { ...base, id: 'animal:demo-caravan', name: 'Capybara de la roulotte', role: 'draft', ...dry(-30, 52), loadout: 'caravan', access: 'owner', ownerId: DEMO_TRAVELLER, riderId: DEMO_TRAVELLER, path: loop(0, 58, 30), pauseSeconds: 14, dwelling: true },
  ];
  for (const a of list) if (a.kind === 'individual' && a.path) Object.assign(a, a.path[0]);
  const npc = (id: string, name: string, at: AnimalPoint): NPCDefinition => ({ id, name, kind: 'hamster', x: at.x, z: at.z, behavior: 'idle', radius: 0, speed: 0, appearance: { ...DEFAULT_APPEARANCE } });
  const animals = Object.fromEntries(list.map((a) => [a.id, validateAnimal(a)]));
  const start = (id: string): AnimalPoint => { const a = animals[id] as AnimalInstanceV1; return { x: a.x + 1.4, z: a.z }; };
  return { animals, npcs: [npc(DEMO_CARTER, 'Charretier', start('animal:demo-cart')), npc(DEMO_TRAVELLER, 'Voyageuse', start('animal:demo-caravan'))] };
}
/** Benchmark layout (`?animalBench=N`): N active capybaras around the player, one in five
 * pulling a cart, so rigs, navigation, colliders and vehicles are all exercised. */
export function benchAnimals(origin: AnimalPoint, env: DemoGround, count: number): Record<string, AnimalAuthorV1> {
  const out: Record<string, AnimalAuthorV1> = {}, n = Math.max(0, Math.min(60, Math.round(count)));
  for (let i = 0; i < n; i++) {
    const ring = 7 + Math.floor(i / 8) * 5, angle = (i * 2.399963) % (Math.PI * 2) - Math.PI, x = origin.x + Math.cos(angle) * ring, z = origin.z + Math.sin(angle) * ring;
    if (!env.inside(x, z) || env.water(x, z) !== null) continue;
    const team = i % 5 === 4, id = `animal:bench-${i}`;
    out[id] = validateAnimal(team
      ? { version: 1, kind: 'individual', id, species: 'capybara', name: 'Attelage ' + i, role: 'draft', x, z, heading: angle, loadout: 'cart', initialState: 'idle', access: 'anyone', roamRadius: 0, persistent: false,
        path: [{ x, z }, { x: x + Math.cos(angle + 1.6) * 14, z: z + Math.sin(angle + 1.6) * 14 }], pauseSeconds: 2 }
      : { version: 1, kind: 'individual', id, species: 'capybara', name: 'Capybara ' + i, role: 'domestic', x, z, heading: angle, loadout: i % 3 === 0 ? 'saddle' : 'none', initialState: 'idle', access: 'anyone', home: { x, z }, roamRadius: 7, persistent: false });
  }
  return out;
}
