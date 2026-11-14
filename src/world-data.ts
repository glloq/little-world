import {validateWaterProfile, validateWaterNetworkFields, type WaterProfile} from './water/profile.ts';
/** Versioned authoring data shared by the editor, game and static-map compiler. */
import catalogue from '../assets/catalog.json' with { type: 'json' };
import { placeableWorldAssets } from './world-production/registry.ts';
import { DEFAULT_NPCS, validateNPCs, type NPCDefinition } from './npc.ts';
/** Legacy catalogue ids + World Production registry ids (assets/world-assets.json). */
export type AssetId = string;
export interface WorldConfig {
  seed: number;
  density: number;
  width?: number;
  length?: number;
  seaLevel?: number;
  chunkSize?: number;
  viewDistance?: number;
  generatorVersion?: 1;
  /** Runtime-only base relief descriptor carried from V3 sources; V1/V2 files cannot set it. */
  terrain?: import('./terrain-generator.ts').TerrainGeneratorDefinition;
}
export interface Placement {
  id: string;
  assetId: AssetId;
  x: number;
  z: number;
  rotation: number;
  scale?: number;
  /** Runtime-only full transform carried from V3 sources (never read from V1/V2 files):
   * height offset above the terrain, rotation quaternion [x,y,z,w] and per-axis scale. */
  y?: number;
  quaternion?: [number, number, number, number];
  scale3?: [number, number, number];
}
export interface TerrainStroke {
  id: string;
  x: number;
  z: number;
  radius: number;
  strength: number;
  mode: 'raise' | 'lower' | 'flatten' | 'smooth';
  height: number;
}
export interface BiomeStroke {
  id: string;
  x: number;
  z: number;
  radius: number;
  biome:
    | 'forest'
    | 'meadow'
    | 'mountain'
    | 'river'
    | 'lake'
    | 'coast'
    | 'village';
  density: number;
}
/** Oriented link of a river to its source or outlet (lake, river junction, sea). */
export interface WaterLink { kind: 'lake' | 'river' | 'sea'; id?: string }
export interface WaterBody {
  profile?: WaterProfile;
  /** Lake = closed outline at a constant level; absent = river/stream (historical). */
  kind?: 'river' | 'lake';
  from?: WaterLink;
  to?: WaterLink;
  /** Explicit waterfalls at an intermediate point: high and low levels kept. */
  falls?: { at: number; top: number; bottom: number }[];
  id: string;
  points: { x: number; z: number }[];
  width: number;
  level: number;
  depth: number;
}
/** Path surface profiles: one drawing tool, several looks (E8). Absent = dirt (historical look). */
export type PathKind = 'trail' | 'dirt' | 'stone' | 'wood';
export const PATH_KINDS: PathKind[] = ['trail', 'dirt', 'stone', 'wood'];
export interface PathDefinition {
  id: string;
  points: { x: number; z: number }[];
  width: number;
  /** Surface profile; absent = dirt. */
  kind?: PathKind;
  /** Light curve interpolation between points; absent = straight segments (older maps). */
  smooth?: boolean;
}
export interface WorldDefinition {
  schemaVersion: 2;
  name: string;
  config: WorldConfig;
  placements: Placement[];
  terrain: TerrainStroke[];
  biomes: BiomeStroke[];
  water: WaterBody[];
  paths: PathDefinition[];
  npcs: NPCDefinition[];
  /** Runtime-only geography inputs carried from V3 (never read from V1/V2 files). */
  /** Runtime-only local lights projected from V3 Light components (never read from V1/V2 files). */
  lights?: import('./lighting/light-data.ts').RuntimeLight[];
  geography?: {sectorSizeM: number; masks: Record<string, import('./geography/layers.ts').SectorLayers>; zones: import('./geography/engine.ts').GeoZone[]; landscapes?: import('./world-production/biotopes.ts').LandscapeRegion[]};
}
export const DEFAULT_CONFIG = {
  seed: 1284,
  density: 1,
  width: 200,
  length: 600,
  seaLevel: 0,
  chunkSize: 64,
  viewDistance: 240,
  generatorVersion: 1,
} as const;
export function resolveConfig(c: WorldConfig) {
  return { ...DEFAULT_CONFIG, ...c };
}
export function defaultWorld(): WorldDefinition {
  return {
    schemaVersion: 2,
    name: 'Vallée côtière',
    config: { ...DEFAULT_CONFIG },
    placements: [],
    terrain: [],
    biomes: [],
    water: [],
    paths: [],
    npcs: structuredClone(DEFAULT_NPCS),
  };
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 100;
const assets = new Set([...catalogue.assets.map((a) => a.id), ...placeableWorldAssets().map((a) => a.id)]);
const biomes = new Set([
  'forest',
  'meadow',
  'mountain',
  'river',
  'lake',
  'coast',
  'village',
]);
function list(
  v: unknown,
  max: number,
  check: (v: Record<string, unknown>) => boolean,
): boolean {
  return (
    Array.isArray(v) &&
    v.length <= max &&
    v.every((x) => record(x) && check(x)) &&
    new Set(v.map((x) => x.id)).size === v.length
  );
}
/** Reject malformed values before allocation, including non-finite numbers and duplicate IDs. */
export function parseWorld(value: unknown): WorldDefinition {
  if (!record(value) || !record(value.config))
    throw Error('Carte : configuration absente');
  const c = value.config;
  if (
    !Number.isInteger(c.seed) ||
    !num(c.seed, 1, 9999999) ||
    !num(c.density, 0, 2)
  )
    throw Error('Graine ou densité invalide');
  for (const [key, min, max] of [
    ['width', 200, 2000],
    ['length', 600, 2000],
    ['seaLevel', -20, 20],
    ['chunkSize', 32, 128],
    ['viewDistance', 96, 400],
  ] as const)
    if (c[key] !== undefined && !num(c[key], min, max))
      throw Error('Configuration invalide : ' + key);
  if (c.terrain !== undefined)
    throw Error('Générateur de relief réservé aux sources V3');
  if (c.generatorVersion !== undefined && c.generatorVersion !== 1)
    throw Error('Version du générateur inconnue');
  const config = resolveConfig(c as unknown as WorldConfig);
  const point = (p: Record<string, unknown>) =>
    num(p.x, -config.width / 2 + 3, config.width / 2 - 3) &&
    num(p.z, -config.length / 2 + 12, config.length / 2 - 14);
  if (
    !list(
      value.placements,
      2000,
      (p) =>
        id(p.id) &&
        typeof p.assetId === 'string' &&
        assets.has(p.assetId) &&
        point(p) &&
        num(p.rotation, -1000, 1000) &&
        (p.scale === undefined || num(p.scale, 0.1, 10)),
    )
  )
    throw Error('Objets invalides ou identifiants dupliqués');
  // Legacy maps retain the original 200 × 600 geography and gain empty overrides.
  if (value.schemaVersion === 1)
    return {
      ...defaultWorld(),
      config,
      placements: (value.placements as Placement[]).map(({ id, assetId, x, z, rotation, scale }) => ({ id, assetId, x, z, rotation, ...(scale === undefined ? {} : { scale }) })),
    };
  if (
    value.schemaVersion !== 2 ||
    typeof value.name !== 'string' ||
    value.name.length > 100
  )
    throw Error('Version ou nom de carte invalide');
  if (
    !list(
      value.terrain,
      1000,
      (p) =>
        id(p.id) &&
        point(p) &&
        num(p.radius, 1, 80) &&
        num(p.strength, 0, 10) &&
        num(p.height, -50, 150) &&
        ['raise', 'lower', 'flatten', 'smooth'].includes(String(p.mode)),
    )
  )
    throw Error('Retouches terrain invalides');
  if (
    !list(
      value.biomes,
      500,
      (p) =>
        id(p.id) &&
        point(p) &&
        num(p.radius, 1, 100) &&
        typeof p.biome === 'string' &&
        biomes.has(p.biome) &&
        num(p.density, 0, 2),
    )
  )
    throw Error('Biotopes invalides');
  const line = (p: Record<string, unknown>, within=point) =>
    id(p.id) &&
    num(p.width, 1, 40) &&
    Array.isArray(p.points) &&
    p.points.length >= 2 &&
    p.points.length <= 100 &&
    p.points.every((x) => record(x) && within(x));
  if (
    !list(
      value.water,
      100,
      (p) => line(p,v=>num(v.x,-config.width/2,config.width/2)&&num(v.z,-config.length/2,config.length/2)) && num(p.level, -20, 100) && num(p.depth, 0.5, 20),
    )
  )
    throw Error('Volumes d’eau invalides');
  for(const w of value.water as WaterBody[]){validateWaterProfile(w.profile,w.points.length);validateWaterNetworkFields(w);}
  if (!list(value.paths, 100, (p) => line(p) && (p.kind === undefined || PATH_KINDS.includes(p.kind as PathKind)) && (p.smooth === undefined || typeof p.smooth === 'boolean'))) throw Error('Chemins invalides');
  if (!validateNPCs(value.npcs, config))
    throw Error('PNJ ou dialogues invalides');
  if (
    !(value.npcs as NPCDefinition[]).every((n) =>
      point(n as unknown as Record<string, unknown>),
    )
  )
    throw Error('PNJ hors carte');
  return structuredClone({
    schemaVersion: 2,
    name: value.name,
    config,
    placements: (value.placements as Placement[]).map(({ id, assetId, x, z, rotation, scale }) => ({ id, assetId, x, z, rotation, ...(scale === undefined ? {} : { scale }) })),
    terrain: value.terrain,
    biomes: value.biomes,
    water: value.water,
    paths: value.paths,
    npcs: value.npcs,
  }) as WorldDefinition;
}
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private limit: number;
  constructor(limit = 60) {
    this.limit = limit;
  }
  record(before: T) {
    this.past.push(structuredClone(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: T): T | undefined {
    const v = this.past.pop();
    if (v === undefined) return;
    this.future.push(structuredClone(current));
    return v;
  }
  redo(current: T): T | undefined {
    const v = this.future.pop();
    if (v === undefined) return;
    this.past.push(structuredClone(current));
    return v;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
export function segmentDistance(
  x: number,
  z: number,
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
