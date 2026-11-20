/** Terrain surface colour used by detail tiles and horizon blocks: the historical valley keeps
 * its palette; generated worlds use the Geography Engine material classification. */
import {terrainColor,isLegacyTerrain,terrainHeight} from '../terrain.ts';
import {geoContext} from './engine.ts';
import {classifyPoint} from './classify.ts';
import {materialColor} from './materials.ts';
/** `rise2m` = height difference over 2 m (historical convention of terrainColor). */
export function surfaceColor(x:number,z:number,h:number,rise2m:number,out:{setHex(hex:number):unknown;r:number;g:number;b:number},normal?:{x:number;y:number;z:number}):void{
  if(isLegacyTerrain()){terrainColor(x,z,h,rise2m,out);return;}
  // A canonical 2 m gradient keeps classification identical at shared LOD/horizon vertices.
  const context=geoContext(),dx=terrainHeight(x+2,z)-terrainHeight(x-2,z),dz=terrainHeight(x,z+2)-terrainHeight(x,z-2);
  if(normal){const length=Math.hypot(dx,4,dz);normal.x=-dx/length;normal.y=4/length;normal.z=-dz/length;}
  materialColor(classifyPoint(context,x,z,{height:h,slope:Math.hypot(dx,dz)/4}),context.seaLevel,out,x,z,context.seed);
  // Groomed runs read as packed, slightly blue snow next to the powder.
  if(context.skiSurface?.(x,z)){out.r*=.84;out.g*=.9;out.b*=.97;}
}
