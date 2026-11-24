/** Geography worker: same modules as the main thread (identical results), no Three.js and no
 * DOM. Holds a replica of the terrain/geography configuration and of the Studio map project. */
import {configureTerrain,insideWorld,isLegacyTerrain} from '../terrain.ts';
import {ecologySectorData,biomeSamplerWith,generatedCover,generatedGrass,type BiomeEditCircle} from '../biomes.ts';
import {generateGrassCell} from '../render/grass-cell.ts';
import {terrainHeight} from '../terrain.ts';
import {configureGeography,geoContext} from './engine.ts';
import {createChunkData} from '../terrain-data.ts';
import {packedHorizonBlock} from '../horizon-data.ts';
import {generateDressingCell,generateCanopyCell} from './dressing.ts';
import {geographyFromInput,type ProjectGeography} from './input-geography.ts';
import {sampleTile} from '../studio/geo-map/raster.ts';
import type {GeoJob,GeoMessage,GeoReply} from './geo-protocol.ts';

let project:ProjectGeography|null=null;
function run(job:GeoJob):{result:unknown;transfer:ArrayBuffer[]}{
  const buffers=(...arrays:ArrayBufferView[])=>arrays.map(a=>a.buffer as ArrayBuffer);
  switch(job.kind){
    case 'tile':{const d=createChunkData(job.chunk,job.lod,job.horizon);return {result:d,transfer:buffers(d.positions,d.colors,d.normals,d.index,...[d.morphY,d.morphColors,d.morphNormals,d.upSource,d.upHorizon].filter((a):a is NonNullable<typeof a>=>!!a))};}
    case 'horizon':{const d=packedHorizonBlock(job.bounds,job.grid,job.column,job.row);return {result:d,transfer:buffers(d.positions,d.normals,d.colors,d.index)};}
    case 'dressing':{const c=generateDressingCell(geoContext(),job.seed,job.cx,job.cz,insideWorld);return {result:c,transfer:buffers(...Object.values(c.items))};}
    case 'canopy':{const a=generateCanopyCell(geoContext(),job.seed,job.cx,job.cz,insideWorld);return {result:a,transfer:buffers(a)};}
    case 'grass':{const c=generateGrassCell(job.seed,job.cx,job.cz,job.density,generatedGrass,terrainHeight,true);return {result:c,transfer:buffers(c.matrices,c.colors)};}
    case 'ecology':{const d=ecologySectorData(job.seed,job.cx,job.cz,job.density,biomeSamplerWith(job.edits as BiomeEditCircle[]),isLegacyTerrain()?undefined:generatedCover);return {result:d,transfer:d.paths.flatMap(p=>[p.floor.buffer as ArrayBuffer,p.surface.buffer as ArrayBuffer,p.ok.buffer as ArrayBuffer])};}
    case 'map':{if(!project)throw Error('Projet non configuré');const t=sampleTile(project.ctx,job.bounds,job.level,job.tx,job.tz);return {result:t,transfer:buffers(t.heights,t.slope,t.moisture,t.authored,t.underwater,...Object.values(t.codes))};}
  }
}
/** Handles one message (exported for tests; the worker binds it to onmessage). */
export function handleGeoMessage(m:GeoMessage):{reply:GeoReply;transfer:ArrayBuffer[]}|null{
  if(m.type==='terrain'){configureTerrain(m.config,m.edits,m.water,m.roads);return null;}
  if(m.type==='geography'){configureGeography(m.sources);return null;}
  if(m.type==='project'){project=geographyFromInput(m.input);return null;}
  const begin=performance.now();
  try{const {result,transfer}=run(m.job);return {reply:{id:m.id,ok:true,result,ms:performance.now()-begin},transfer};}
  catch(error){return {reply:{id:m.id,ok:false,error:error instanceof Error?error.message:String(error)},transfer:[]};}
}
const scope=globalThis as unknown as {onmessage?:((e:MessageEvent<GeoMessage>)=>void)|null;postMessage?(m:GeoReply,transfer?:Transferable[]):void;WorkerGlobalScope?:unknown};
if(typeof scope.WorkerGlobalScope!=='undefined')scope.onmessage=e=>{const out=handleGeoMessage(e.data);if(out)scope.postMessage!(out.reply,out.transfer);};
