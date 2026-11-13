/** Terrain surface colour used by detail tiles and horizon blocks: the historical valley keeps
 * its palette; generated worlds use the Geography Engine material classification. */
import {terrainColor,isLegacyTerrain,getTerrainConfig} from '../terrain.ts';
import {classifyAt} from './engine.ts';
import {materialColor} from './materials.ts';
/** `rise2m` = height difference over 2 m (historical convention of terrainColor). */
export function surfaceColor(x:number,z:number,h:number,rise2m:number,out:{setHex(hex:number):unknown;r:number;g:number;b:number}):void{
  if(isLegacyTerrain()){terrainColor(x,z,h,rise2m,out);return;}
  materialColor(classifyAt(x,z,{height:h,slope:rise2m/2}),getTerrainConfig().seaLevel,out);
}
