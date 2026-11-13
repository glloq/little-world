/** Geography of a project document for authoring views (2D map, previews, validation).
 * Pure: it never configures the shared runtime terrain used by the 3D viewport. Built from the
 * loaded sectors only — callers hydrate the sectors they display. Same classification code as
 * the game (createGeoContext), so the map shows what the runtime will compute. */
import type {ProjectDocument,TerrainEdit,BiomeEdit} from './types.ts';
import type {TerrainStroke,WaterBody,PathDefinition} from '../world-data.ts';
import {createTerrainSource} from '../terrain.ts';
import {generatorField,LEGACY_GENERATOR} from '../terrain-generator.ts';
import {WaterSpatialIndex} from '../water/profile.ts';
import {createGeoContext,type GeographySources} from '../geography/engine.ts';
import type {GeoContext} from '../geography/classify.ts';
import type {SectorLayers} from '../geography/layers.ts';
import {resolveEntity} from './references.ts';
import {sectorGrid} from './geo-edits.ts';

/** Bounding-box accelerated distance to a set of ribbons (paths, rivers). */
export function lineSet(lines:{points:{x:number;z:number}[];width:number}[]){
  const items=lines.filter(l=>l.points.length>1).map(l=>{let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const p of l.points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}const pad=l.width/2;return {l,minX:minX-pad,maxX:maxX+pad,minZ:minZ-pad,maxZ:maxZ+pad};});
  return (x:number,z:number,within:number):number=>{
    let best=Infinity;
    for(const {l,minX,maxX,minZ,maxZ}of items){
      if(x<minX-within||x>maxX+within||z<minZ-within||z>maxZ+within)continue;
      for(let i=1;i<l.points.length;i++){const a=l.points[i-1],b=l.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),ex=x-a.x-t*dx,ez=z-a.z-t*dz;best=Math.min(best,Math.sqrt(ex*ex+ez*ez)-l.width/2);}
    }
    return best;
  };
}
export interface ProjectGeography {ctx:GeoContext;sources:GeographySources;legacy:boolean}
const strip=<T extends {order:number}>(e:T)=>{const {order:_,...rest}=e;return rest;};
export function projectGeography(p:ProjectDocument):ProjectGeography{
  const w=p.world,b=w.bounds,width=b.maxX-b.minX,length=b.maxZ-b.minZ,generator=w.terrain??LEGACY_GENERATOR,legacy=generator.kind==='legacy-valley';
  const chunks=Object.values(p.chunks);
  const terrain=new Map<string,TerrainEdit>(),biomes=new Map<string,BiomeEdit>();
  for(const c of chunks){for(const e of c.terrainEdits)terrain.set(e.id,e);for(const e of c.biomeEdits)biomes.set(e.id,e);}
  const edits=[...terrain.values()].sort((a,c)=>a.order-c.order).map(strip) as TerrainStroke[];
  const config={seed:w.seed,density:w.density,width,length,seaLevel:w.seaLevel,...(w.terrain?{terrain:w.terrain}:{})};
  const height=createTerrainSource(config,edits),sea=w.seaLevel;
  const field=generatorField(generator,{seed:w.seed,seaLevel:sea,width,length},height);
  const waters=Object.values(p.libraries.water) as unknown as WaterBody[],paths=Object.values(p.libraries.paths) as unknown as PathDefinition[];
  const index=new WaterSpatialIndex(waters,height),waterDistance=lineSet(waters),pathDistance=lineSet(paths);
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
