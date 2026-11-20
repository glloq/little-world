/** Geography Engine runtime state: one shared context for terrain colours, vegetation, the
 * Studio map and the game. Configured next to the terrain (same sources), never from meshes.
 * `revision` changes whenever a source changes, so derived caches can invalidate.
 * `createGeoContext` is the single implementation of the classification inputs: the runtime
 * binds it to the configured terrain, the Studio map binds it to a project document. */
import {terrainHeight,waterSurfaceWithHeight,geoSiteAt,pathDistance,getTerrainConfig,terrainSeaLevel,waterEdgeDistance} from '../terrain.ts';
import {classifyPoint,type GeoContext,type GeoSample,type Occupation} from './classify.ts';
import {createRaceCorridorIndex} from '../gameplay/race-corridors.ts';
import {maskCell,type MaskLayerId,type SectorGrid,type SectorLayers} from './layers.ts';
import {polygonSignedDistance,type PointXZ} from './archipelago.ts';
import {createLandscapeSampler,type LandscapeRegion} from '../world-production/biotopes.ts';

export interface GeoZone {kind:'farm-plot'|'mine';polygon:PointXZ[]}
export interface GeoBiomeStroke {x:number;z:number;radius:number;biome:string}
export interface GeographySources {
  seed:number;grid:SectorGrid;
  snowLineM?:number;
  ski?:{points:{x:number;z:number}[];widthM:number};
  /** Additional authored ski runs (same snow surface as `ski`). */
  skiRuns?:{points:{x:number;z:number}[];widthM:number}[];
  masks:Record<string,SectorLayers>;
  zones?:GeoZone[];
  biomeStrokes?:GeoBiomeStroke[];
  /** Building footprints (centre + radius) that exclude vegetation. */
  buildings?:{x:number;z:number;radius:number}[];
  /** Compiled/author-owned race roadbeds, only for vegetation and prop exclusion. */
  races?:import('../gameplay/race-track.ts').RaceTrack[];
  /** Landscape preset footprints (World Production V1). Optional. */
  landscapes?:LandscapeRegion[];
}
/** Relief and network inputs of a context (runtime terrain or a project preview). */
export interface GeoDeps {
  seaLevel:number;snowLineM?:number;
  height(x:number,z:number):number;
  water(x:number,z:number,height:number):number|null;
  site(x:number,z:number):{coast:number;cliff:number;volcanic:number};
  /** Distance to the nearest path edge, exact below `within`. */
  pathDistance(x:number,z:number,within:number):number;
  /** Distance to the nearest water body edge, exact below `within`. */
  waterDistance(x:number,z:number,within:number):number;
}
/** Moisture saturates beyond 45 m from a river: farther bodies are skipped by bounding box. */
const RIVER_INFLUENCE_M=60;
export function createGeoContext(src:GeographySources|null,deps:GeoDeps):GeoContext{
  const zones=(src?.zones??[]).map(zone=>{const xs=zone.polygon.map(p=>p.x),zs=zone.polygon.map(p=>p.z);return {zone,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};});
  const buildings=src?.buildings??[],strokes=src?.biomeStrokes??[],landscapes=src?.landscapes??[];
  const sampledLandscape=landscapes.length?createLandscapeSampler(landscapes):null;
  const raceCorridors=src?.races?.length?createRaceCorridorIndex(src.races):null;
  const runs=[...(src?.ski?[src.ski]:[]),...src?.skiRuns??[]];
  const ski=runs.length?createRaceCorridorIndex(runs.map(run=>({points:run.points,width:run.widthM,material:'dirt' as const,smooth:false,features:[]})),0):null;
  let cellX=NaN,cellZ=NaN,cellIndex=0,cellLayers:SectorLayers|undefined;
  return {
    seed:src?.seed??0,seaLevel:deps.seaLevel,snowLineM:src?.snowLineM??deps.snowLineM,height:deps.height,water:deps.water,site:deps.site,
    ...(ski?{skiSurface:(x:number,z:number)=>ski.contains(x,z)}:{}),
    riverDistance:(x,z)=>Math.max(0,deps.waterDistance(x,z,RIVER_INFLUENCE_M)),
    // The 5 mask layers of one point share its cell lookup (one-entry memo).
    mask(layer:MaskLayerId,x:number,z:number){
      if(!src)return undefined;
      if(x!==cellX||z!==cellZ){cellX=x;cellZ=z;const cell=maskCell(src.grid,x,z);cellLayers=cell?src.masks[cell.chunkId]:undefined;cellIndex=cell?cell.index:0;}
      const mask=cellLayers?.[layer];return mask?mask[cellIndex]:undefined;
    },
    biomeStroke(x,z){for(let i=strokes.length-1;i>=0;i--){const s=strokes[i];if((x-s.x)*(x-s.x)+(z-s.z)*(z-s.z)<s.radius*s.radius)return s.biome;}return undefined;},
    ...(sampledLandscape?{landscape:sampledLandscape}:{}),
    occupancy(x,z):Occupation{
      if(raceCorridors?.contains(x,z))return 'road';
      for(const {zone,minX,maxX,minZ,maxZ}of zones)if(x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ&&polygonSignedDistance(zone.polygon,x,z)>=0)return zone.kind==='farm-plot'?'farm':'reserved';
      if(deps.pathDistance(x,z,1)<.8)return 'road';
      for(const b of buildings)if((x-b.x)*(x-b.x)+(z-b.z)*(z-b.z)<b.radius*b.radius)return 'built';
      return 'none';
    },
  };
}
let sources:GeographySources|null=null,revision=0,cached:GeoContext|null=null;
let previewSnowline:number|null=null;
/** Local preview only: never persisted into authored map data. */
export function setPreviewSnowline(value:number|null){if(value!==null&&!Number.isFinite(value))throw Error('Snowline invalide');if(value!==previewSnowline){previewSnowline=value;if(sources)sources={...sources,snowLineM:value??undefined};cached=null;revision++;}}
const runtimeDeps=():GeoDeps=>({seaLevel:getTerrainConfig().seaLevel,snowLineM:previewSnowline??undefined,height:terrainHeight,water:waterSurfaceWithHeight,site:geoSiteAt,pathDistance,waterDistance:waterEdgeDistance});
let signature='';
/** Unchanged sources keep the revision: workers and derived caches are not invalidated. */
export function configureGeography(next:GeographySources){const s=JSON.stringify(next);sources={...next,masks:{...next.masks}};cached=null;if(s!==signature){signature=s;revision++;}}
/** Replace the masks of some sectors (Studio edits, streaming); other sectors are kept. */
export function updateGeographyMasks(masks:Record<string,SectorLayers|undefined>){
  if(!sources)return;for(const [id,layers]of Object.entries(masks)){if(layers)sources.masks[id]=layers;else delete sources.masks[id];}revision++;signature='';cached=null;
}
export function geographyRevision(){return revision;}
export function geographySources(){return sources;}
/** Context of the configured world, reused across samples (rebuilt after a configuration or
 * a sea-level change, never per sample). */
export function geoContext():GeoContext{
  const sea=terrainSeaLevel();
  if(!cached||cached.seaLevel!==sea)cached=createGeoContext(sources,runtimeDeps());
  return cached;
}
export function classifyAt(x:number,z:number,known?:{height?:number;slope?:number}):GeoSample{return classifyPoint(geoContext(),x,z,known);}
