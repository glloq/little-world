import {WaterSpatialIndex} from './water/profile.ts';
import type {
  WorldConfig,
  TerrainStroke,
  WaterBody,
  PathDefinition,
} from './world-data.ts';
/** Geometry contract (meters): X = valley width, Z = sea direction, Y = up. */
export const WORLD_WIDTH = 200;
export const WORLD_LENGTH = 600;
export const SEA_LEVEL = 0;
let config = {
  width: 200,
  length: 600,
  seaLevel: 0,
  chunkSize: 64,
  viewDistance: 240,
};
let waterIndex=new WaterSpatialIndex([],()=>0);
let sourceHeight:(x:number,z:number)=>number=(x,z)=>baseHeight(x,z,0);
let paths: PathDefinition[] = [];
export function configureTerrain(
  c: WorldConfig,
  edits: TerrainStroke[] = [],
  water: WaterBody[] = [],
  roads: PathDefinition[] = [],
): void {
  config = {
    width: c.width ?? 200,
    length: c.length ?? 600,
    seaLevel: c.seaLevel ?? 0,
    chunkSize: c.chunkSize ?? 64,
    viewDistance: c.viewDistance ?? 240,
  };
  sourceHeight=createTerrainSource(c,edits);
  waterIndex=new WaterSpatialIndex(water,sourceHeight);
  paths = roads;
}
export function getTerrainConfig() {
  return { ...config };
}
function lineDistance(
  x: number,
  z: number,
  points: { x: number; z: number }[],
): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = clamp(
      ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
      0,
      1,
    );
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}
export function pathDistance(x: number, z: number): number {
  let d = Math.abs(x - (riverX(z) - 22)) - 1.8;
  for (const p of paths)
    d = Math.min(d, lineDistance(x, z, p.points) - p.width / 2);
  return d;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function riverX(z: number): number {
  return 9 * Math.sin(z * 0.018) + 3.5 * Math.sin(z * 0.046);
}
export function riverLevel(z: number): number {
  return config.seaLevel + Math.max(0, (190 - z) * 0.027);
}
function baseHeight(x: number, z: number, seaLevel:number): number {
  const level=seaLevel+Math.max(0,(190-z)*.027);
  const d = Math.abs(x - riverX(z));
  const ridge = Math.pow(Math.min(1.6, Math.max(0, (d - 13) / 78)), 1.7) * 54;
  const roughness =
    (1.0 + smoothstep(12, 60, d) * 3.0) *
    (Math.sin(x * 0.1 + z * 0.031) * Math.sin(z * 0.057 - x * 0.036) * 0.42 +
      Math.sin(z * 0.021 + x * 0.17) * 0.21);
  const shore = level + 1.15 + ridge + roughness;
  const channel = level - 2.45 + 0.03 * d;
  const inland = lerp(channel, shore, smoothstep(5.4, 13.8, d));
  // The flat sea floor gradually takes over at the open coast.
  const seabed =
    seaLevel - 1.9 - Math.max(0, z - 208) * 0.049 + 0.02 * Math.abs(x);
  return lerp(inland, seabed, smoothstep(175, 246, z));
}
export function createTerrainSource(c:WorldConfig,edits:TerrainStroke[]=[]):(x:number,z:number)=>number {
 return (x,z)=>{let h=baseHeight(x,z,c.seaLevel??0);
  for (const s of edits) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d >= s.radius) continue;
    const weight = 1 - smoothstep(0, s.radius, d);
    if (s.mode === 'raise' || s.mode === 'lower')
      h += (s.mode === 'raise' ? 1 : -1) * s.strength * weight;
    else h = lerp(h, s.height, weight * Math.min(1, s.strength / 4));
  }
  return h;
};
}
export function sourceTerrainHeight(x:number,z:number){return sourceHeight(x,z);}
export function compiledWaterBodies(){return waterIndex.bodies;}
export function terrainHeight(x:number,z:number):number {
 let h=sourceHeight(x,z);
 for(const {water,distance,level} of waterIndex.query(x,z,2)){
  const core=water.width*.25,edge=water.width*.5+2;
  // Extend a shallow bank beyond the surface so coarse terrain cannot cover the ribbon.
  const half=water.width*.5;
  const bed=distance<=half?level-.08-water.depth*(1-smoothstep(core,half,distance)):lerp(level-.08,h,smoothstep(half,edge,distance));
  h=Math.min(h,bed);
 }
 return h;
}

export function waterSurface(x: number, z: number): number | null {
  const hit=waterIndex.query(x,z)[0];
  if(hit)return hit.level;
  if (
    z >= 190 &&
    z <= config.length / 2 &&
    x >= -config.width / 2 - 5 &&
    x <= config.width / 2 + 5
  )
    return config.seaLevel;
  if (z < -config.length / 2 + 10 || z > 205) return null;
  return Math.abs(x - riverX(z)) <= 6.8 ? riverLevel(z) : null;
}
/** Underwater visuals depend on the CAMERA, never on the player's swim state. */
export function cameraSubmerged(x: number, y: number, z: number): boolean {
  const surface = waterSurface(x, z);
  return surface !== null && y < surface - 0.1;
}
export function waterDepth(x: number, z: number): number {
  const surface = waterSurface(x, z);
  return surface === null ? 0 : Math.max(0, surface - terrainHeight(x, z));
}
export function insideWorld(x: number, z: number): boolean {
  return (
    x >= -config.width / 2 + 3 &&
    x <= config.width / 2 - 3 &&
    z >= -config.length / 2 + 12 &&
    z <= config.length / 2 - 14
  );
}
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
