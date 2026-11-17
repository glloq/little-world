/** Bounded, observable coverage of the real V3 terrain and masks (not polygon counts). */
import type {ProjectDocument} from './types.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {compilePolygon,polylineDistance} from '../geography/archipelago.ts';
import {generatorField} from '../terrain-generator.ts';
import {maskCell} from '../geography/layers.ts';
export interface CompositionCoverage {sampled:number;landSamples:number;biomeCoverage:number;offRiverBiomeCoverage:number;terracedLandShare:number;interiorSubseaSamples:number}
export function compositionCoverage(p:ProjectDocument,axis:PointXZ[]):CompositionCoverage {
 const b=p.world.bounds,width=b.maxX-b.minX,length=b.maxZ-b.minZ,
  field=generatorField(p.world.terrain!,{width,length,seed:p.world.seed,seaLevel:p.world.seaLevel},()=>0),
  grid={minX:b.minX,minZ:b.minZ,chunkSizeM:p.world.chunkSizeM,columns:Math.ceil(width/p.world.chunkSizeM),rows:Math.ceil(length/p.world.chunkSizeM)},
  floors=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.filter(f=>f.kind==='plateau'&&f.id.startsWith('composition-terrace-')).map(f=>compilePolygon(f.kind==='plateau'?f.polygon:[])):[];
 let land=0,painted=0,far=0,farPainted=0,terraced=0,interiorSubseaSamples=0;
 const n=48;
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){
  const wx=b.minX+(x+.5)/n*width,wz=b.minZ+(z+.5)/n*length;
  if(field.coast(wx,wz)>80&&field.height(wx,wz)<p.world.seaLevel)interiorSubseaSamples++;
  if(field.coast(wx,wz)<20||field.height(wx,wz)<=p.world.seaLevel)continue;
  land++;if(floors.some(inside=>inside(wx,wz)>=0))terraced++;
  const cell=maskCell(grid,wx,wz),code=cell?p.chunks[cell.chunkId]?.layers?.biome?.[cell.index]:undefined,
   covered=code!==undefined&&code!=='.';if(covered)painted++;
  if(polylineDistance(axis,wx,wz)>Math.min(width,length)*.08){far++;if(covered)farPainted++;}
 }
 return {sampled:n*n,landSamples:land,biomeCoverage:land?painted/land:0,offRiverBiomeCoverage:far?farPainted/far:0,terracedLandShare:land?terraced/land:0,interiorSubseaSamples};
}
