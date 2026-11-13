import {WaterSpatialIndex,polygonSignedDistance} from './water/profile.ts';
import {ribbonDistance} from './geography/lines.ts';
import {pathRibbon} from './paths/path-geometry.ts';
import {LEGACY_GENERATOR,generatorField,type TerrainGeneratorDefinition} from './terrain-generator.ts';
import type {GeneratorField} from './geography/archipelago.ts';
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
/** Generator outputs of the configured world (coast distance, coastal steepness, volcanism). */
let field:GeneratorField|null=null;
let waterIndex=new WaterSpatialIndex([],()=>0);
let sourceHeight:(x:number,z:number)=>number=(x,z)=>baseHeight(x,z,0);
let pathRibbons: ReturnType<typeof ribbonDistance> = () => Infinity;
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
  field=g.kind==='legacy-valley'?null:generatorField(g,{seed:c.seed,seaLevel:config.seaLevel,width:config.width,length:config.length},()=>0);
  sourceHeight=createTerrainSource(c,edits,field);
  waterIndex=new WaterSpatialIndex(water,sourceHeight,config.seaLevel);
  pathRibbons = ribbonDistance(roads.map(pathRibbon));
  // Revision of the terrain inputs: geography workers replay them, results computed with an
  // older revision are discarded. Unchanged inputs keep the revision (no needless rebuild).
  const signature = JSON.stringify([c, edits, water, roads]);
  if (signature !== inputSignature) { inputSignature = signature; inputRevision++; }
  inputs = { config: c, edits, water, roads };
}
let inputSignature = '', inputRevision = 0;
let inputs: { config: WorldConfig; edits: TerrainStroke[]; water: WaterBody[]; roads: PathDefinition[] } | null = null;
/** Inputs of the last configureTerrain call (structured-cloneable, for workers). */
export function terrainInputs() { return inputs; }
export function terrainRevision(): number { return inputRevision; }
export function getTerrainConfig() {
  return { ...config };
}
/** Sea level without copying the configuration (per-sample hot paths). */
export function terrainSeaLevel(): number {
  return config.seaLevel;
}
/** True for the historical demonstration valley (V1/V2 maps, projects without generator). */
export function isLegacyTerrain():boolean{return config.generator.kind==='legacy-valley';}
export function terrainGenerator():TerrainGeneratorDefinition{return config.generator;}
/** Distance to the nearest path edge. With `within`, paths farther than that are skipped
 * (the result is then only exact below `within`; Infinity means "farther"). */
export function pathDistance(x: number, z: number, within = Infinity): number {
  const legacy = isLegacyTerrain()?Math.abs(x - (riverX(z) - 22)) - 1.8:Infinity;
  return Math.min(legacy, pathRibbons(x, z, within));
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
export function createTerrainSource(c:WorldConfig,edits:TerrainStroke[]=[],shared?:GeneratorField|null):(x:number,z:number)=>number {
 const seaLevel=c.seaLevel??0,generator=c.terrain??LEGACY_GENERATOR;
 const base=shared?shared.height:generatorField(generator,{seed:c.seed,seaLevel,width:c.width??200,length:c.length??600},(x,z)=>baseHeight(x,z,seaLevel)).height;
 const buckets=new Map<number,TerrainStroke[]>(),key=(cx:number,cz:number)=>(cx+1048576)*2097152+(cz+1048576);
 for(const s of edits){
  const x0=Math.floor((s.x-s.radius)/EDIT_CELL),x1=Math.floor((s.x+s.radius)/EDIT_CELL),z0=Math.floor((s.z-s.radius)/EDIT_CELL),z1=Math.floor((s.z+s.radius)/EDIT_CELL);
  for(let cz=z0;cz<=z1;cz++)for(let cx=x0;cx<=x1;cx++){const k=key(cx,cz);let list=buckets.get(k);if(!list)buckets.set(k,list=[]);list.push(s);}
 }
 return (x,z)=>{let h=base(x,z);
  const list=buckets.size?buckets.get(key(Math.floor(x/EDIT_CELL),Math.floor(z/EDIT_CELL))):undefined;
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
/** Distance to the nearest water body edge, exact below `within`. */
let waterRibbons:{source:readonly unknown[];distance:ReturnType<typeof ribbonDistance>;lakes:boolean}={source:[],distance:()=>Infinity,lakes:false};
export function waterEdgeDistance(x:number,z:number,within:number):number{
  const bodies=waterIndex.bodies;if(waterRibbons.source!==bodies)waterRibbons={source:bodies,distance:ribbonDistance(bodies.filter(b=>b.kind!=='lake')),lakes:bodies.some(b=>b.kind==='lake')};
  let d=waterRibbons.distance(x,z,within);
  // Lakes: 0 inside, distance to the shore outside (hot path: only when the world has lakes).
  if(waterRibbons.lakes)for(const hit of waterIndex.query(x,z,within))if(hit.water.kind==='lake')d=Math.min(d,hit.distance);
  return d;
}
export function terrainHeight(x:number,z:number):number {return carveWaterBeds(sourceHeight,waterIndex,x,z);}
/** Relief with river/lake beds carved under their surface (shared by the runtime terrain and
 * authoring previews such as the Studio 2D map, so both see the same water and banks). */
export function carveWaterBeds(source:(x:number,z:number)=>number,index:WaterSpatialIndex,x:number,z:number):number {
 let h=source(x,z);
 for(const {water,distance,level} of index.query(x,z,3)){
  if(water.kind==='lake'){
   // Basin: deepens away from the shore; a 3 m bank outside meets the relief.
   const inward=polygonSignedDistance(water.polygon!,x,z);
   const bed=inward>=0?level-.08-water.depth*smoothstep(0,Math.max(3,water.depth*2.5),inward):lerp(level-.08,h,smoothstep(0,3,-inward));
   h=Math.min(h,bed);continue;
  }
  if(distance>water.width*.5+2)continue;
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
export function coastDistanceAt(x:number,z:number):number|null{return field?field.coast(x,z):null;}
/** 0..1 coastal steepness of generated worlds (0 for the valley). */
export function cliffAt(x:number,z:number):number{return field?field.cliff(x,z):0;}
/** 0..1 volcanic influence of generated worlds. */
export function volcanicAt(x:number,z:number):number{return field?field.volcanic(x,z):0;}
/** coast/cliff/volcanic in one evaluation. */
export function geoSiteAt(x:number,z:number){return field?field.site(x,z):{coast:Infinity,cliff:0,volcanic:0};}
/** Water surface when the terrain height is already known (avoids recomputing it). */
export function waterSurfaceWithHeight(x:number,z:number,height:number):number|null{
  const hit=waterIndex.query(x,z)[0];if(hit)return hit.level;
  if(!isLegacyTerrain())return height<config.seaLevel?config.seaLevel:null;
  return waterSurface(x,z);
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
