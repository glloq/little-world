/** Geography context from plain inputs (Studio map previews, geography worker). No Studio or
 * Three.js dependency: the same code runs on the main thread and in a worker. */
import type {TerrainStroke,WaterBody,PathDefinition,WorldConfig} from '../world-data.ts';
import type {TerrainGeneratorDefinition} from '../terrain-generator.ts';
import {createTerrainSource,carveWaterBeds} from '../terrain.ts';
import {generatorField} from '../terrain-generator.ts';
import {WaterSpatialIndex} from '../water/profile.ts';
import {ribbonDistance} from './lines.ts';
import {pathRibbon} from '../paths/path-geometry.ts';
import {createGeoContext,type GeographySources} from './engine.ts';
import type {GeoContext} from './classify.ts';
const lineSet=ribbonDistance;
export interface ProjectGeography {ctx:GeoContext;sources:GeographySources;legacy:boolean}
/** Plain, structured-cloneable inputs of a project's geography (extracted on the main thread,
 * replayed identically by a geography worker). */
export interface ProjectGeographyInput {
  config:WorldConfig;generator:TerrainGeneratorDefinition;edits:TerrainStroke[];
  waters:WaterBody[];paths:PathDefinition[];sources:GeographySources;
}
export function geographyFromInput(input:ProjectGeographyInput):ProjectGeography{
  const {config,generator,edits,waters,paths,sources}=input,legacy=generator.kind==='legacy-valley',sea=config.seaLevel??0;
  const source=createTerrainSource(config,edits);
  const field=generatorField(generator,{seed:config.seed,seaLevel:sea,width:config.width??200,length:config.length??600},source);
  const index=new WaterSpatialIndex(waters,source),waterDistance=lineSet(waters),pathDistance=lineSet(paths.map(pathRibbon));
  const height=(x:number,z:number)=>carveWaterBeds(source,index,x,z);
  const ctx=createGeoContext(sources,{seaLevel:sea,height,site:field.site,pathDistance,waterDistance,
    water:(x,z,h)=>{const hit=index.query(x,z)[0];if(hit)return hit.level;return !legacy&&h<sea?sea:null;}});
  return {ctx,sources,legacy};
}
