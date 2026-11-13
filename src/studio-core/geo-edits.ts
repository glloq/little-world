/** Authoring operations on geography corrections, run inside one StudioSession.change
 * (one undoable transaction per stroke/fill/regeneration). Masks live in their V3 sector. */
import type {ProjectDocument,TerrainEdit} from './types.ts';
import type {TerrainStroke} from '../world-data.ts';
import {ensureChunk,removeTerrainEdit,removeBiomeEdit} from './source.ts';
import {MASK_GRID,MASK_LAYERS,isEmptyMask,setMaskCell,cellCenter,type MaskLayerId,type SectorGrid} from '../geography/layers.ts';
import {polygonSignedDistance,featureBounds,landmassBounds,type PointXZ,type ReliefFeature,type Landmass,type ArchipelagoParams} from '../geography/archipelago.ts';
import type {EditPatch} from './commands.ts';

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
export interface Rect {minX:number;maxX:number;minZ:number;maxZ:number}
/** Areas whose relief changes with a transaction's `world.terrain` patches (explicit
 * dependency → local invalidation): changed features/land masses only, compared by id.
 * `global` when generator-wide parameters (kind, seabed, detail…) changed. */
export function terrainChangeRects(patches:readonly EditPatch[]):{changed:boolean;global:boolean;rects:Rect[]}{
  const out={changed:false,global:false,rects:[] as Rect[]};
  for(const patch of patches){
    if(patch.path[0]!=='world'||patch.path[1]!=='terrain')continue;out.changed=true;
    const list=patch.path.length===4&&patch.path[2]==='archipelago'?patch.path[3]:null;
    if(list!=='features'&&list!=='landmasses'){out.global=true;continue;}
    const before=(patch.before.value??[]) as {id:string}[],after=(patch.after.value??[]) as {id:string}[];
    const key=(v:unknown)=>JSON.stringify(v),old=new Map(before.map(v=>[v.id,key(v)])),now=new Map(after.map(v=>[v.id,key(v)]));
    const bounds=(v:unknown)=>list==='features'?featureBounds(v as ReliefFeature):landmassBounds(v as Landmass);
    for(const v of before)if(now.get(v.id)!==old.get(v.id))out.rects.push(bounds(v));
    for(const v of after)if(now.get(v.id)!==old.get(v.id))out.rects.push(bounds(v));
  }
  return out;
}
/** Replace the archipelago parameters (validated by the transaction validator). */
export function setArchipelago(draft:ProjectDocument,a:ArchipelagoParams){draft.world.terrain={kind:'archipelago',version:1,archipelago:structuredClone(a)};}
/** Paint only cells that still carry the generated value (protects earlier corrections). */
export function protectedCells(p:ProjectDocument,layer:MaskLayerId,cells:Map<string,number[]>):Map<string,number[]>{
  const out=new Map<string,number[]>();for(const [id,list]of cells){const mask=p.chunks[id]?.layers?.[layer];const free=list.filter(i=>!mask||mask[i]==='.');if(free.length)out.set(id,free);}return out;
}
export type RegionReliefMode='flatten'|'raise'|'lower';
/** Terrain retouches covering a region (hexagonal packing, bounded count): flatten to the mean
 * height, or raise/lower by `amount` metres. With `protect`, discs centred inside existing
 * retouches are skipped so earlier relief work is kept. Pure: the caller commits them. */
export function regionReliefStrokes(p:ProjectDocument,r:Region,mode:RegionReliefMode,amount:number,height:(x:number,z:number)=>number,protect:boolean,newId:()=>string=()=>crypto.randomUUID()):TerrainStroke[]{
  const box=regionBox(r),area=Math.max(1,(box.maxX-box.minX)*(box.maxZ-box.minZ)),radius=Math.max(6,Math.min(40,Math.sqrt(area/150)*1.25)),step=radius*.8;
  const existing=protect?Object.values(p.chunks).flatMap(c=>c.terrainEdits as TerrainEdit[]):[];
  const centres:{x:number;z:number}[]=[];
  for(let row=0,z=box.minZ;z<=box.maxZ;z+=step*.866,row++)for(let x=box.minX+(row%2)*step/2;x<=box.maxX;x+=step){
    if(!regionContains(r,x,z))continue;if(existing.some(e=>(e.x-x)**2+(e.z-z)**2<e.radius*e.radius))continue;centres.push({x,z});
  }
  if(centres.length>400)throw Error('Zone trop grande pour une retouche de relief en une fois (400 disques au plus)');
  const mean=centres.length?centres.reduce((s,c)=>s+height(c.x,c.z),0)/centres.length:0;
  // Overlapping discs at 0.8 r cover each point about 1.8 times: strengths are normalised.
  return centres.map(c=>({id:newId(),x:Math.round(c.x*100)/100,z:Math.round(c.z*100)/100,radius:Math.round(radius*100)/100,
    ...(mode==='flatten'?{mode:'flatten' as const,strength:4,height:Math.round(mean*100)/100}:{mode,strength:Math.max(.1,Math.abs(amount)/1.8),height:Math.abs(amount)})}));
}
/** Authoring elements lying in a region (entities by position, lines/zones by any vertex). */
export function regionElements(p:ProjectDocument,r:Region):{kind:'entity'|'path'|'water'|'zone';id:string}[]{
  const out:{kind:'entity'|'path'|'water'|'zone';id:string}[]=[];
  for(const e of Object.values(p.entityIndex))if(regionContains(r,e.position.x,e.position.z))out.push({kind:'entity',id:e.id});
  for(const v of Object.values(p.libraries.paths))if(v.points.some(q=>regionContains(r,q.x,q.z)))out.push({kind:'path',id:v.id});
  for(const v of Object.values(p.libraries.water))if(v.points.some(q=>regionContains(r,q.x,q.z)))out.push({kind:'water',id:v.id});
  for(const v of Object.values(p.libraries.zones??{}))if(v.polygon.some(q=>regionContains(r,q.x,q.z)))out.push({kind:'zone',id:v.id});
  return out;
}
