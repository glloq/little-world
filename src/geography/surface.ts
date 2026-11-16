/** Terrain surface colour used by detail tiles and horizon blocks: the historical valley keeps
 * its palette; generated worlds use the Geography Engine material classification. */
import {terrainColor,isLegacyTerrain,terrainHeight} from '../terrain.ts';
import {geoContext} from './engine.ts';
import {slopeAt,classifyPoint} from './classify.ts';
import {materialColor} from './materials.ts';
/** `rise2m` = height difference over 2 m (historical convention of terrainColor). */
export function surfaceColor(x:number,z:number,h:number,rise2m:number,out:{setHex(hex:number):unknown;r:number;g:number;b:number}):void{
  if(isLegacyTerrain()){terrainColor(x,z,h,rise2m,out);return;}
  // A canonical 2 m gradient keeps classification identical at shared LOD/horizon vertices.
  const context=geoContext();
  materialColor(classifyPoint(context,x,z,{height:h,slope:slopeAt(terrainHeight,x,z)}),context.seaLevel,out,x,z,context.seed);
}
