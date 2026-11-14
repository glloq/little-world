/** Geography of a project document for authoring views (2D map, previews, validation).
 * Pure: it never configures the shared runtime terrain used by the 3D viewport. Built from the
 * loaded sectors only — callers hydrate the sectors they display. Same classification code as
 * the game (createGeoContext), so the map shows what the runtime will compute. */
import {exclusionRadius} from '../world-production/registry.ts';
import type {ProjectDocument,TerrainEdit,BiomeEdit} from './types.ts';
import type {TerrainStroke,WaterBody,PathDefinition,WorldConfig} from '../world-data.ts';
import {LEGACY_GENERATOR} from '../terrain-generator.ts';
import {ribbonDistance} from '../geography/lines.ts';
import type {GeographySources} from '../geography/engine.ts';
import {geographyFromInput,type ProjectGeography,type ProjectGeographyInput} from '../geography/input-geography.ts';
export {geographyFromInput,type ProjectGeography,type ProjectGeographyInput} from '../geography/input-geography.ts';
import type {SectorLayers} from '../geography/layers.ts';
import {resolveEntity} from './references.ts';
import {sectorGrid} from './geo-edits.ts';

/** Same ribbon distance as the runtime terrain (kept as an alias for existing callers). */
export const lineSet=ribbonDistance;
const strip=<T extends {order:number}>(e:T)=>{const {order:_,...rest}=e;return rest;};
export function projectGeographyInput(p:ProjectDocument):ProjectGeographyInput{
  const w=p.world,b=w.bounds,width=b.maxX-b.minX,length=b.maxZ-b.minZ,generator=w.terrain??LEGACY_GENERATOR;
  const chunks=Object.values(p.chunks);
  const terrain=new Map<string,TerrainEdit>(),biomes=new Map<string,BiomeEdit>();
  for(const c of chunks){for(const e of c.terrainEdits)terrain.set(e.id,e);for(const e of c.biomeEdits)biomes.set(e.id,e);}
  const edits=[...terrain.values()].sort((a,c)=>a.order-c.order).map(strip) as TerrainStroke[];
  const config={seed:w.seed,density:w.density,width,length,seaLevel:w.seaLevel,...(w.terrain?{terrain:w.terrain}:{})} as WorldConfig;
  const masks:Record<string,SectorLayers>={};for(const c of chunks)if(c.layers)masks[c.chunkId]=c.layers;
  const buildings:{x:number;z:number;radius:number}[]=[];
  for(const c of chunks)for(const id of c.entityIds){const e=c.entities[id];if(!e)continue;const r=resolveEntity(p,e),v=r.components.Visual,t=r.components.Transform;if(v&&t){const radius=exclusionRadius(v.assetId,Math.max(t.scale.x,t.scale.z));if(radius!==null)buildings.push({x:t.position.x,z:t.position.z,radius});}}
  const sources:GeographySources={seed:w.seed,grid:sectorGrid(p),masks,
    zones:Object.values(p.libraries.zones??{}).map(z=>({kind:z.kind,polygon:z.polygon})),
    biomeStrokes:[...biomes.values()].sort((a,c)=>a.order-c.order).map(e=>({x:e.x,z:e.z,radius:e.radius,biome:e.biome})),buildings};
  return {config,generator,edits,waters:Object.values(p.libraries.water) as unknown as WaterBody[],paths:Object.values(p.libraries.paths) as unknown as PathDefinition[],sources};
}
export function projectGeography(p:ProjectDocument):ProjectGeography{return geographyFromInput(projectGeographyInput(p));}
