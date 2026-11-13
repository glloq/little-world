/** Geography Engine runtime state: one shared context for terrain colours, vegetation, the
 * Studio map and the game. Configured next to the terrain (same sources), never from meshes.
 * `revision` changes whenever a source changes, so derived caches can invalidate. */
import {terrainHeight,waterSurfaceWithHeight,geoSiteAt,pathDistance,getTerrainConfig,waterEdgeDistance} from '../terrain.ts';
import {classifyPoint,type GeoContext,type GeoSample,type Occupation} from './classify.ts';
import {maskCell,type MaskLayerId,type SectorGrid,type SectorLayers} from './layers.ts';
import {polygonSignedDistance,type PointXZ} from './archipelago.ts';

export interface GeoZone {kind:'farm-plot'|'mine';polygon:PointXZ[]}
export interface GeoBiomeStroke {x:number;z:number;radius:number;biome:string}
export interface GeographySources {
  seed:number;grid:SectorGrid;
  masks:Record<string,SectorLayers>;
  zones?:GeoZone[];
  biomeStrokes?:GeoBiomeStroke[];
  /** Building footprints (centre + radius) that exclude vegetation. */
  buildings?:{x:number;z:number;radius:number}[];
}
let sources:GeographySources|null=null,revision=0;
let zoneBoxes:{zone:GeoZone;minX:number;maxX:number;minZ:number;maxZ:number}[]=[];
export function configureGeography(next:GeographySources){
  sources={...next,masks:{...next.masks}};revision++;
  zoneBoxes=(next.zones??[]).map(zone=>{const xs=zone.polygon.map(p=>p.x),zs=zone.polygon.map(p=>p.z);return {zone,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};});
}
/** Replace the masks of some sectors (Studio edits, streaming); other sectors are kept. */
export function updateGeographyMasks(masks:Record<string,SectorLayers|undefined>){
  if(!sources)return;for(const [id,layers]of Object.entries(masks)){if(layers)sources.masks[id]=layers;else delete sources.masks[id];}revision++;
}
export function geographyRevision(){return revision;}
export function geographySources(){return sources;}
function maskAt(layer:MaskLayerId,x:number,z:number):string|undefined{
  if(!sources)return undefined;const cell=maskCell(sources.grid,x,z);if(!cell)return undefined;
  const mask=sources.masks[cell.chunkId]?.[layer];return mask?mask[cell.index]:undefined;
}
/** Moisture saturates beyond 45 m from a river: farther bodies are skipped by bounding box. */
const RIVER_INFLUENCE_M=60;
function riverDistance(x:number,z:number):number{return Math.max(0,waterEdgeDistance(x,z,RIVER_INFLUENCE_M));}
function occupancy(x:number,z:number):Occupation{
  if(!sources)return 'none';
  for(const {zone,minX,maxX,minZ,maxZ}of zoneBoxes)if(x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ&&polygonSignedDistance(zone.polygon,x,z)>=0)return zone.kind==='farm-plot'?'farm':'reserved';
  if(pathDistance(x,z,1)<.8)return 'road';
  for(const b of sources.buildings??[])if((x-b.x)*(x-b.x)+(z-b.z)*(z-b.z)<b.radius*b.radius)return 'built';
  return 'none';
}
function biomeStroke(x:number,z:number):string|undefined{
  const strokes=sources?.biomeStrokes??[];for(let i=strokes.length-1;i>=0;i--){const s=strokes[i];if((x-s.x)*(x-s.x)+(z-s.z)*(z-s.z)<s.radius*s.radius)return s.biome;}return undefined;
}
export function geoContext():GeoContext{
  return {seed:sources?.seed??0,seaLevel:getTerrainConfig().seaLevel,height:terrainHeight,water:waterSurfaceWithHeight,riverDistance,site:geoSiteAt,mask:maskAt,biomeStroke,occupancy};
}
export function classifyAt(x:number,z:number,known?:{height?:number;slope?:number}):GeoSample{return classifyPoint(geoContext(),x,z,known);}
