/** Messages between the main thread and geography workers (structured-cloneable only).
 * Configuration messages are replayed in order before jobs, so a job always runs on the
 * configuration revision it was posted with. */
import type {WorldConfig,TerrainStroke,WaterBody,PathDefinition} from '../world-data.ts';
import type {GeographySources} from './engine.ts';
import type {ProjectGeographyInput} from './input-geography.ts';
import type {TerrainLOD} from '../chunks.ts';
import type {HorizonBounds,HorizonGrid} from '../horizon-data.ts';

export type GeoJob=
  |{kind:'tile';chunk:{minX:number;maxX:number;minZ:number;maxZ:number};lod:TerrainLOD}
  |{kind:'horizon';bounds:HorizonBounds;grid:HorizonGrid;column:number;row:number}
  |{kind:'dressing';seed:number;cx:number;cz:number}
  |{kind:'map';bounds:{minX:number;minZ:number};level:number;tx:number;tz:number};
export type GeoMessage=
  |{type:'terrain';config:WorldConfig;edits:TerrainStroke[];water:WaterBody[];roads:PathDefinition[]}
  |{type:'geography';sources:GeographySources}
  |{type:'project';input:ProjectGeographyInput}
  |{type:'job';id:number;job:GeoJob};
export type GeoReply={id:number;ok:true;result:unknown;ms:number}|{id:number;ok:false;error:string};
