import {
  coastDistanceAt,
  getTerrainConfig,
  insideWorld,
  isLegacyTerrain,
  mulberry32,
  pathDistance,
  riverX,
  terrainHeight,
  waterSurface,
} from './terrain.ts';

export const BIOMES = {
  forest: {
    name: 'Forêt',
    color: 0x547952,
    plants: ['fern', 'mushroom', 'flower'],
  },
  meadow: { name: 'Prairie', color: 0x94b878, plants: ['grass', 'flower'] },
  mountain: { name: 'Montagne', color: 0x99a394, plants: ['grass', 'flower'] },
  river: { name: 'Rivière', color: 0x6faaa5, plants: ['reed', 'kelp'] },
  lake: { name: 'Eau calme', color: 0x85b8ad, plants: ['reed', 'lily'] },
  coast: { name: 'Littoral', color: 0xb9c19d, plants: ['grass', 'kelp'] },
  village: { name: 'Village', color: 0xb49d7b, plants: ['flower', 'grass'] },
} as const;
export type BiomeId = keyof typeof BIOMES;
export type PlantKind =
  | 'grass'
  | 'flower'
  | 'fern'
  | 'mushroom'
  | 'reed'
  | 'kelp'
  | 'lily';
export type CreatureKind = 'bird' | 'butterfly' | 'fish';
export interface EcologyItem {
  kind: PlantKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  phase: number;
}
export interface CreatureSite {
  kind: CreatureKind;
  x: number;
  y: number;
  z: number;
  phase: number;
}
export interface EcologySector {
  id: string;
  cx: number;
  cz: number;
  plants: EcologyItem[];
  creatures: CreatureSite[];
}
export type BiomeSampler = (x: number, z: number) => BiomeId;
export const ECOLOGY_SECTOR_SIZE = 48;

/** Classify from the same height/water queries as collisions; authored biomes may override this. */
export function sampleBiome(x: number, z: number): BiomeId {
  const level = waterSurface(x, z),
    height = terrainHeight(x, z);
  if (!isLegacyTerrain()) {
    // Generated relief: coast/altitude bands only; authored biome edits override them.
    const coast = coastDistanceAt(x, z) ?? Infinity, sea = getTerrainConfig().seaLevel;
    if (level !== null && level > height + 0.15) return level > sea + 0.05 ? 'river' : 'coast';
    if (coast < 90 || height < sea + 3) return 'coast';
    if (height > sea + 170) return 'mountain';
    return 'meadow';
  }
  if (level !== null && level > height + 0.15)
    return z > 190 ? 'coast' : 'river';
  if (Math.abs(z - 95) < 40 && Math.abs(x - (riverX(95) - 30)) < 32)
    return 'village';
  if (z > 175) return 'coast';
  if (height > 35) return 'mountain';
  return Math.abs(x - riverX(z)) > 35 ? 'forest' : 'meadow';
}

/** Keep generated decoration clear of the existing trail, mill, homes and dock. */
export function ecologyExcluded(x: number, z: number): boolean {
  if (pathDistance(x, z) < 1.4) return true;
  if (!isLegacyTerrain()) return false;
  if (Math.abs(z + 57) < 15 && Math.abs(x - (riverX(-57) - 24)) < 12)
    return true;
  for (const homeZ of [70, 94, 118]) {
    if (Math.abs(z - homeZ) < 7 && Math.abs(x - (riverX(homeZ) - 30)) < 8)
      return true;
  }
  return Math.abs(x + 25) < 6 && z > 202 && z < 229;
}

export function habitatAllows(
  kind: PlantKind | CreatureKind,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!insideWorld(x, z) || !Number.isFinite(y)) return false;
  const floor = terrainHeight(x, z),
    surface = waterSurface(x, z);
  const depth = surface === null ? 0 : surface - floor;
  if (kind === 'fish')
    return (
      surface !== null && depth > 0.6 && y > floor + 0.12 && y < surface - 0.12
    );
  if (kind === 'kelp') return surface !== null && depth > 0.65;
  if (kind === 'lily') return surface !== null && depth > 0.3 && depth < 3.5;
  if (kind === 'reed') return surface !== null && depth >= -0.2 && depth < 0.7;
  if (kind === 'bird') return y > Math.max(floor, surface ?? floor) + 2;
  return (surface === null || depth < 0.05) && !ecologyExcluded(x, z);
}

/** Stable sector seed means movement order and eviction never alter generated placements. */
export function generateEcologySector(
  seed: number,
  cx: number,
  cz: number,
  density = 1,
  sampler: BiomeSampler = sampleBiome,
): EcologySector {
  const random = mulberry32(
    (seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0,
  );
  const plants: EcologyItem[] = [],
    creatures: CreatureSite[] = [];
  const total = Math.round(90 * Math.max(0, Math.min(2, density)));
  const occupied = new Set<string>();
  for (let i = 0; i < total; i++) {
    const x = (cx + random()) * ECOLOGY_SECTOR_SIZE,
      z = (cz + random()) * ECOLOGY_SECTOR_SIZE;
    if (!insideWorld(x, z)) continue;
    const biome = sampler(x, z),
      options = BIOMES[biome].plants;
    const kind = options[Math.floor(random() * options.length)];
    const floor = terrainHeight(x, z),
      surface = waterSurface(x, z);
    const y = kind === 'lily' && surface !== null ? surface + 0.025 : floor;
    const cell = `${Math.floor(x / 1.4)}:${Math.floor(z / 1.4)}`;
    if (occupied.has(cell) || !habitatAllows(kind, x, y, z)) continue;
    if (Math.abs(terrainHeight(x + 1, z) - floor) > 1.6) continue;
    occupied.add(cell);
    plants.push({
      kind,
      x,
      y,
      z,
      scale: 0.65 + random() * 0.8,
      phase: random() * Math.PI * 2,
    });
  }
  // A small, fixed population per sector; no full NPC simulation per creature.
  if (density > 0)
    for (let i = 0; i < 8; i++) {
      const x = (cx + random()) * ECOLOGY_SECTOR_SIZE,
        z = (cz + random()) * ECOLOGY_SECTOR_SIZE;
      if (!insideWorld(x, z)) continue;
      const floor = terrainHeight(x, z),
        surface = waterSurface(x, z);
      const underwater = surface !== null && surface - floor > 0.8;
      const kind: CreatureKind = underwater
        ? 'fish'
        : i < 2
          ? 'bird'
          : 'butterfly';
      const y =
        kind === 'fish'
          ? (floor + surface!) / 2
          : floor + (kind === 'bird' ? 9 : 1.3);
      if (habitatAllows(kind, x, y, z))
        creatures.push({ kind, x, y, z, phase: random() * Math.PI * 2 });
    }
  return { id: `${cx}:${cz}`, cx, cz, plants, creatures };
}

/** Parametric water motion is accepted only inside the actual water volume, otherwise stay at the anchor. */
export function creaturePosition(
  site: CreatureSite,
  time: number,
): { x: number; y: number; z: number } {
  const phase = site.phase + time * (site.kind === 'bird' ? 0.35 : 0.75);
  const radius = site.kind === 'bird' ? 6 : site.kind === 'fish' ? 1.2 : 1.8;
  const candidate = {
    x: site.x + Math.cos(phase) * radius,
    y: site.y + Math.sin(phase * 1.7) * (site.kind === 'fish' ? 0.12 : 0.45),
    z: site.z + Math.sin(phase) * radius,
  };
  if (habitatAllows(site.kind, candidate.x, candidate.y, candidate.z))
    return candidate;
  return { x: site.x, y: site.y, z: site.z };
}
