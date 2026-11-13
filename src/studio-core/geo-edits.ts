/** Authoring operations on geography corrections, run inside one StudioSession.change
 * (one undoable transaction per stroke/fill/regeneration). Masks live in their V3 sector. */
import type {ProjectDocument,TerrainEdit} from './types.ts';
import {ensureChunk,removeTerrainEdit,removeBiomeEdit} from './source.ts';
import {MASK_GRID,MASK_LAYERS,isEmptyMask,setMaskCell,cellCenter,type MaskLayerId,type SectorGrid} from '../geography/layers.ts';
import {polygonSignedDistance,type PointXZ} from '../geography/archipelago.ts';

export function sectorGrid(p:ProjectDocument):SectorGrid{
  const b=p.world.bounds,s=p.world.chunkSizeM;return {minX:b.minX,minZ:b.minZ,chunkSizeM:s,columns:Math.ceil((b.maxX-b.minX)/s),rows:Math.ceil((b.maxZ-b.minZ)/s)};
}
export type Region={kind:'circle';x:number;z:number;radius:number}|{kind:'polygon';points:PointXZ[]};
export function regionContains(r:Region,x:number,z:number){return r.kind==='circle'?(x-r.x)**2+(z-r.z)**2<=r.radius*r.radius:polygonSignedDistance(r.points,x,z)>=0;}
function regionBox(r:Region){if(r.kind==='circle')return {minX:r.x-r.radius,maxX:r.x+r.radius,minZ:r.z-r.radius,maxZ:r.z+r.radius};const xs=r.points.map(p=>p.x),zs=r.points.map(p=>p.z);return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};}
/** Mask cells whose centre lies in the region, grouped by sector id. */
export function regionCells(p:ProjectDocument,r:Region):Map<string,number[]>{
  const g=sectorGrid(p),out=new Map<string,number[]>(),box=regionBox(r),b=p.world.bounds;
  const c0=Math.max(0,Math.floor((Math.max(b.minX,box.minX)-g.minX)/g.chunkSizeM)),c1=Math.min(g.columns-1,Math.floor((Math.min(b.maxX,box.maxX)-g.minX)/g.chunkSizeM));
  const r0=Math.max(0,Math.floor((Math.max(b.minZ,box.minZ)-g.minZ)/g.chunkSizeM)),r1=Math.min(g.rows-1,Math.floor((Math.min(b.maxZ,box.maxZ)-g.minZ)/g.chunkSizeM));
  for(let cz=r0;cz<=r1;cz++)for(let cx=c0;cx<=c1;cx++){
    const id=`${cx}:${cz}`,cells:number[]=[];
    for(let i=0;i<MASK_GRID*MASK_GRID;i++){const c=cellCenter(g,id,i);if(regionContains(r,c.x,c.z))cells.push(i);}
    if(cells.length)out.set(id,cells);
  }
  return out;
}
/** Paint (code) or erase ('.') a layer on the given cells. Empty masks are removed. */
export function paintMask(draft:ProjectDocument,layer:MaskLayerId,code:string,cells:Map<string,number[]>):number{
  let changed=0;
  for(const [id,indexes]of cells){
    const existing=draft.chunks[id];if(!existing&&code==='.')continue;
    const chunk=existing??ensureChunk(draft,id);let mask=chunk.layers?.[layer];
    for(const i of indexes){const before=mask?.[i]??'.';if(before!==code){mask=setMaskCell(mask,i,code);changed++;}}
    const layers={...(chunk.layers??{})};if(isEmptyMask(mask))delete layers[layer];else layers[layer]=mask!;
    if(Object.keys(layers).length)chunk.layers=layers;else delete chunk.layers;
  }
  return changed;
}
export interface RegionCorrections {terrainEdits:string[];biomeEdits:string[];cells:Partial<Record<MaskLayerId,number>>;chunks:string[]}
/** Preview of what "restore generation" would remove in a region (loaded sectors only). */
export function regionCorrections(p:ProjectDocument,r:Region,layers:MaskLayerId[]=MASK_LAYERS):RegionCorrections{
  const terrain=new Set<string>(),biome=new Set<string>(),cells:Partial<Record<MaskLayerId,number>>={},chunks=new Set<string>();
  for(const chunk of Object.values(p.chunks)){
    for(const e of chunk.terrainEdits as TerrainEdit[])if(regionContains(r,e.x,e.z)){terrain.add(e.id);chunks.add(chunk.chunkId);}
    for(const e of chunk.biomeEdits)if(regionContains(r,e.x,e.z)){biome.add(e.id);chunks.add(chunk.chunkId);}
  }
  for(const [id,indexes]of regionCells(p,r)){const layersOf=p.chunks[id]?.layers;if(!layersOf)continue;for(const layer of layers){const mask=layersOf[layer];if(!mask)continue;const n=indexes.filter(i=>mask[i]!=='.').length;if(n){cells[layer]=(cells[layer]??0)+n;chunks.add(id);}}}
  return {terrainEdits:[...terrain],biomeEdits:[...biome],cells,chunks:[...chunks]};
}
/** Remove authored corrections in a region so the generator applies again (non destructive
 * outside the region; the whole operation is one transaction, hence undoable). */
export function restoreGeneration(draft:ProjectDocument,r:Region,options:{terrain:boolean;layers:MaskLayerId[]}):RegionCorrections{
  const preview=regionCorrections(draft,r,options.layers);
  if(options.terrain){for(const id of preview.terrainEdits)removeTerrainEdit(draft,id);for(const id of preview.biomeEdits)removeBiomeEdit(draft,id);}
  const cells=regionCells(draft,r);for(const layer of options.layers)paintMask(draft,layer,'.',cells);
  return preview;
}
/** Sectors touched by a region (to hydrate before editing), including terrain edit owners/refs. */
export function regionChunkIds(p:ProjectDocument,r:Region):string[]{
  const ids=new Set(regionCells(p,r).keys());const box=regionBox(r),pad=100,g=sectorGrid(p);
  for(const meta of Object.values(p.chunkIndex)){const minX=g.minX+meta.cx*g.chunkSizeM,minZ=g.minZ+meta.cz*g.chunkSizeM;if(minX<=box.maxX+pad&&minX+g.chunkSizeM>=box.minX-pad&&minZ<=box.maxZ+pad&&minZ+g.chunkSizeM>=box.minZ-pad)ids.add(meta.chunkId);}
  return [...ids];
}
