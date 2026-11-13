/** Geography of a project document for authoring views (2D map, previews, validation).
 * Pure: it never configures the shared runtime terrain used by the 3D viewport. Built from the
 * loaded sectors only — callers hydrate the sectors they display. Same classification code as
 * the game (createGeoContext), so the map shows what the runtime will compute. */
import type {ProjectDocument,TerrainEdit,BiomeEdit} from './types.ts';
import type {TerrainStroke,WaterBody,PathDefinition} from '../world-data.ts';
import {createTerrainSource,carveWaterBeds} from '../terrain.ts';
import {generatorField,LEGACY_GENERATOR} from '../terrain-generator.ts';
import {WaterSpatialIndex} from '../water/profile.ts';
import {ribbonDistance} from '../geography/lines.ts';
import {createGeoContext,type GeographySources} from '../geography/engine.ts';
import type {GeoContext} from '../geography/classify.ts';
import type {SectorLayers} from '../geography/layers.ts';
import {resolveEntity} from './references.ts';
import {sectorGrid} from './geo-edits.ts';

/** Same ribbon distance as the runtime terrain (kept as an alias for existing callers). */
export const lineSet=ribbonDistance;
export interface ProjectGeography {ctx:GeoContext;sources:GeographySources;legacy:boolean}
const strip=<T extends {order:number}>(e:T)=>{const {order:_,...rest}=e;return rest;};
export function projectGeography(p:ProjectDocument):ProjectGeography{
  const w=p.world,b=w.bounds,width=b.maxX-b.minX,length=b.maxZ-b.minZ,generator=w.terrain??LEGACY_GENERATOR,legacy=generator.kind==='legacy-valley';
  const chunks=Object.values(p.chunks);
  const terrain=new Map<string,TerrainEdit>(),biomes=new Map<string,BiomeEdit>();
  for(const c of chunks){for(const e of c.terrainEdits)terrain.set(e.id,e);for(const e of c.biomeEdits)biomes.set(e.id,e);}
  const edits=[...terrain.values()].sort((a,c)=>a.order-c.order).map(strip) as TerrainStroke[];
  const config={seed:w.seed,density:w.density,width,length,seaLevel:w.seaLevel,...(w.terrain?{terrain:w.terrain}:{})};
  const source=createTerrainSource(config,edits),sea=w.seaLevel;
  const field=generatorField(generator,{seed:w.seed,seaLevel:sea,width,length},source);
  const waters=Object.values(p.libraries.water) as unknown as WaterBody[],paths=Object.values(p.libraries.paths) as unknown as PathDefinition[];
  const index=new WaterSpatialIndex(waters,source),waterDistance=lineSet(waters),pathDistance=lineSet(paths);
  const height=(x:number,z:number)=>carveWaterBeds(source,index,x,z);
  const masks:Record<string,SectorLayers>={};for(const c of chunks)if(c.layers)masks[c.chunkId]=c.layers;
  const buildings:{x:number;z:number;radius:number}[]=[];
  for(const c of chunks)for(const id of c.entityIds){const e=c.entities[id];if(!e)continue;const r=resolveEntity(p,e),v=r.components.Visual,t=r.components.Transform;if(v&&t&&v.assetId.startsWith('architecture.'))buildings.push({x:t.position.x,z:t.position.z,radius:6*Math.max(t.scale.x,t.scale.z)});}
  const sources:GeographySources={seed:w.seed,grid:sectorGrid(p),masks,
    zones:Object.values(p.libraries.zones??{}).map(z=>({kind:z.kind,polygon:z.polygon})),
    biomeStrokes:[...biomes.values()].sort((a,c)=>a.order-c.order).map(e=>({x:e.x,z:e.z,radius:e.radius,biome:e.biome})),buildings};
  const ctx=createGeoContext(sources,{seaLevel:sea,height,site:field.site,pathDistance,waterDistance,
    water:(x,z,h)=>{const hit=index.query(x,z)[0];if(hit)return hit.level;return !legacy&&h<sea?sea:null;}});
  return {ctx,sources,legacy};
}
