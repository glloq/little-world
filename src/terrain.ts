import {WaterSpatialIndex} from './water/profile.ts';
import {LEGACY_GENERATOR,generatorHeight,islandCoastDistance,type TerrainGeneratorDefinition} from './terrain-generator.ts';
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
  generator: LEGACY_GENERATOR as TerrainGeneratorDefinition,
};
let coastDistance:((x:number,z:number)=>number)|null=null;
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
    generator: c.terrain ?? LEGACY_GENERATOR,
  };
  const g=config.generator;
  coastDistance=g.kind==='island'?islandCoastDistance({seed:c.seed,seaLevel:config.seaLevel,width:config.width,length:config.length},g.island):null;
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
/** True for the historical demonstration valley (V1/V2 maps, projects without generator). */
export function isLegacyTerrain():boolean{return config.generator.kind==='legacy-valley';}
export function terrainGenerator():TerrainGeneratorDefinition{return config.generator;}
export function pathDistance(x: number, z: number): number {
  let d = isLegacyTerrain()?Math.abs(x - (riverX(z) - 22)) - 1.8:Infinity;
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
const EDIT_CELL=64;
/** Base generator + ordered authored edits. Edits are bucketed so a sample only visits
 * edits whose disc can reach it; bucket order preserves application order. */
export function createTerrainSource(c:WorldConfig,edits:TerrainStroke[]=[]):(x:number,z:number)=>number {
 const seaLevel=c.seaLevel??0,generator=c.terrain??LEGACY_GENERATOR;
 const base=generatorHeight(generator,{seed:c.seed,seaLevel,width:c.width??200,length:c.length??600},(x,z)=>baseHeight(x,z,seaLevel));
 const buckets=new Map<string,TerrainStroke[]>();
 for(const s of edits){
  const x0=Math.floor((s.x-s.radius)/EDIT_CELL),x1=Math.floor((s.x+s.radius)/EDIT_CELL),z0=Math.floor((s.z-s.radius)/EDIT_CELL),z1=Math.floor((s.z+s.radius)/EDIT_CELL);
  for(let cz=z0;cz<=z1;cz++)for(let cx=x0;cx<=x1;cx++){const key=cx+':'+cz;let list=buckets.get(key);if(!list)buckets.set(key,list=[]);list.push(s);}
 }
 return (x,z)=>{let h=base(x,z);
  const list=buckets.get(Math.floor(x/EDIT_CELL)+':'+Math.floor(z/EDIT_CELL));
  if(list)for (const s of list) {
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
  if(!isLegacyTerrain())return terrainHeight(x,z)<config.seaLevel?config.seaLevel:null;
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
/** Signed inland distance for generated islands (negative offshore), null for the valley. */
export function coastDistanceAt(x:number,z:number):number|null{return coastDistance?coastDistance(x,z):null;}
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
  const [near,far]=isLegacyTerrain()?[12,14]:[3,3];
  return (
    x >= -config.width / 2 + 3 &&
    x <= config.width / 2 - 3 &&
    z >= -config.length / 2 + near &&
    z <= config.length / 2 - far
  );
}
/** Shared vertex colour for detail tiles and horizon proxies (same palette at every LOD). */
export function terrainColor(x:number,z:number,h:number,slope:number,out:{setHex(hex:number):unknown}):void{
  const sea=config.seaLevel;
  if(isLegacyTerrain()){
    if (smoothstep(165, 236, z) > 0.65 && h < 2) out.setHex(0xa5b7a0);
    else if (Math.abs(x - riverX(z)) < 17) out.setHex(0xb9c997);
    else if (h > 37 && slope > 1.6) out.setHex(0x9baca1);
    else if (h > 58) out.setHex(0xb6bbae);
    else if (h > 30) out.setHex(0x8fa78a);
    else out.setHex(0x89ad7b);
    return;
  }
  if(h<sea-0.6)out.setHex(0x9fb7a8);
  else if(h<sea+2.4)out.setHex(0xd8cba0);
  else if(slope>1.9)out.setHex(0x8f8f86);
  else if(h>sea+330)out.setHex(0x7d756f);
  else if(h>sea+170)out.setHex(0x9a9a86);
  else if(h>sea+70)out.setHex(0x7f9f78);
  else out.setHex(0x89ad7b);
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
