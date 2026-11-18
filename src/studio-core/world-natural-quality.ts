import {projectGeography} from './geo-context.ts';
/** Bounded measurements of final terrain and actual painted masks. */
import {generatorField} from '../terrain-generator.ts';
import {maskCell} from '../geography/layers.ts';
import {compilePolygon} from '../geography/archipelago.ts';
import {LANDSCAPE_CODES} from './world-biomes-v4.ts';
import type {Landscape} from './map-requirements.ts';
import type {ProjectDocument} from './types.ts';
export interface NaturalQuality {maxAltitudeM:number;p50AltitudeM:number;p90AltitudeM:number;lowlandShare:number;gentleSlopeShare:number;steepSlopeShare:number;landSamples:number;landmasses:number;biomeShare:Partial<Record<Landscape,number>>}
export function naturalQuality(p:ProjectDocument):NaturalQuality{
 const b=p.world.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ,field=generatorField(p.world.terrain!,{width:w,length:d,seed:p.world.seed,seaLevel:p.world.seaLevel},()=>0),grid={minX:b.minX,minZ:b.minZ,chunkSizeM:p.world.chunkSizeM,columns:Math.ceil(w/p.world.chunkSizeM),rows:Math.ceil(d/p.world.chunkSizeM)},
  features=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features:[],shelves=features.filter(f=>f.kind==='plateau').map(f=>compilePolygon(f.kind==='plateau'?f.polygon:[]));
 const height=Object.values(p.chunks).some(c=>c.terrainEdits.length)?projectGeography(p).source:field.height;
 const values:number[]=[],counts:Partial<Record<Landscape,number>>={};let max=0,low=0,gentle=0,steep=0;
 for(let z=0;z<80;z++)for(let x=0;x<80;x++){
  const wx=b.minX+(x+.5)/80*w,wz=b.minZ+(z+.5)/80*d,h=height(wx,wz)-p.world.seaLevel;
  if(h<=0||field.coast(wx,wz)<0)continue;
  const step=Math.max(2,Math.min(w,d)/400),slope=Math.hypot(height(wx+step,wz)-height(wx-step,wz),height(wx,wz+step)-height(wx,wz-step))/(2*step);
  values.push(h);max=Math.max(max,h);if(h<40)low++;if(slope<.12)gentle++;if(slope>.7)steep++;
  const c=maskCell(grid,wx,wz),code=c?p.chunks[c.chunkId]?.layers?.biome?.[c.index]:'.';
  for(const [kind,value]of Object.entries(LANDSCAPE_CODES) as [Landscape,string][]){
   if(code!==value)continue;if(kind==='plain'&&slope>=.12)continue;if(kind==='plateau'&&!shelves.some(f=>f(wx,wz)>0))continue;
   counts[kind]=(counts[kind]??0)+1;
  }
 }
 for(const f of features)if('x'in f)max=Math.max(max,height(f.x,f.z)-p.world.seaLevel);
 for(const chunk of Object.values(p.chunks))for(const edit of chunk.terrainEdits)max=Math.max(max,height(edit.x,edit.z)-p.world.seaLevel);
 values.sort((a,b)=>a-b);const n=values.length||1;
 return {maxAltitudeM:Math.round(max),p50AltitudeM:Math.round(values[Math.floor(values.length*.5)]??0),p90AltitudeM:Math.round(values[Math.floor(values.length*.9)]??0),lowlandShare:low/n,gentleSlopeShare:gentle/n,steepSlopeShare:steep/n,landSamples:values.length,
  landmasses:p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.landmasses.length:0,biomeShare:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/n]))};
}
