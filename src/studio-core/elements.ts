/** E7 — typed authoring elements shared by the 3D view, the 2D map, the inspector and the
 * author list. One selection reference `{kind,id}` per V3 source element; ids are the V3 ids
 * (never mesh ids). Edits run inside ONE StudioSession.change (one undoable transaction).
 * Mask cells and terrain triangles are deliberately not elements. */
import type {ProjectDocument,ActivityZoneV3,PointXZ,EntityDefinitionV3} from './types.ts';
import type {PathDefinition,WaterBody,TerrainStroke,BiomeStroke} from '../world-data.ts';
import {removePath,putPath,removeWater,putWater,removeTerrainEdit,removeBiomeEdit,putTerrainEdit,putBiomeEdit} from './source.ts';
import {putZone,removeZone} from './zones.ts';
import {deleteEntities,duplicateEntities,duplicateChunkIds,transformChunkIds,applyTransforms,entityTransform} from './transforms.ts';
import {lineChunkIds,waterEditChunkIds} from '../water/sectors.ts';
import {affectedChunkIds,chunkAt} from './schema.ts';
import {ReferenceIndex} from './references.ts';

export type ElementKind='entity'|'path'|'water'|'zone'|'terrainEdit'|'biomeEdit';
export interface ElementRef {kind:ElementKind;id:string}
export const ELEMENT_KINDS:Record<ElementKind,string>={entity:'Objet / PNJ / lumière',path:'Chemin',water:'Rivière',zone:'Zone',terrainEdit:'Retouche de relief',biomeEdit:'Retouche de biotope'};
const isKind=(k:string):k is ElementKind=>k in ELEMENT_KINDS;

/** Canonical retouch of a loaded sector (edits of unloaded sectors are found through the index). */
function findEdit(p:ProjectDocument,kind:'terrainEdit'|'biomeEdit',id:string):(TerrainStroke|BiomeStroke)|undefined{
  for(const c of Object.values(p.chunks)){const list=kind==='terrainEdit'?c.terrainEdits:c.biomeEdits;const e=list.find(v=>v.id===id);if(e){const {order:_,...rest}=e as typeof e&{order:number};return rest;}}
  return undefined;
}
/** Sectors holding an edit (owner + affected sectors), from the global chunk index. */
export function editChunkIds(p:ProjectDocument,kind:'terrainEdit'|'biomeEdit',id:string):string[]{
  const out=new Set<string>();for(const [key,meta]of Object.entries(p.chunkIndex)){const owners=kind==='terrainEdit'?meta.terrainOwners:meta.biomeOwners;if(owners?.[id]){out.add(key);out.add(owners[id]);}}return [...out];
}
export function elementExists(p:ProjectDocument,ref:{kind:string;id:string}):boolean{
  switch(ref.kind){
    case 'entity':return !!p.entityIndex[ref.id];
    case 'path':return !!p.libraries.paths[ref.id];
    case 'water':return !!p.libraries.water[ref.id];
    case 'zone':return !!p.libraries.zones?.[ref.id];
    case 'terrainEdit':case 'biomeEdit':return editChunkIds(p,ref.kind,ref.id).length>0||!!findEdit(p,ref.kind,ref.id);
    default:return false;
  }
}
export function elementData(p:ProjectDocument,ref:ElementRef):PathDefinition|WaterBody|ActivityZoneV3|TerrainStroke|BiomeStroke|undefined{
  switch(ref.kind){
    case 'path':return p.libraries.paths[ref.id];case 'water':return p.libraries.water[ref.id];case 'zone':return p.libraries.zones?.[ref.id];
    case 'terrainEdit':case 'biomeEdit':return findEdit(p,ref.kind,ref.id);default:return undefined;
  }
}
const lengthOf=(pts:PointXZ[])=>pts.slice(1).reduce((s,q,i)=>s+Math.hypot(q.x-pts[i].x,q.z-pts[i].z),0);
const PATH_KINDS:Record<string,string>={trail:'Sentier',dirt:'Chemin de terre',stone:'Chemin pavé',wood:'Passage en bois'};
export function elementLabel(p:ProjectDocument,ref:ElementRef):string{
  const d=elementData(p,ref);
  switch(ref.kind){
    case 'entity':return p.entityIndex[ref.id]?.name??ref.id;
    case 'path':{const path=d as PathDefinition|undefined;return path?`${PATH_KINDS[path.kind??'dirt']} · ${Math.round(lengthOf(path.points))} m`:ref.id;}
    case 'water':return d?`Rivière · ${Math.round(lengthOf((d as WaterBody).points))} m`:ref.id;
    case 'zone':return (d as ActivityZoneV3|undefined)?.name??ref.id;
    case 'terrainEdit':{const e=d as TerrainStroke|undefined;return e?`Relief (${({raise:'élever',lower:'abaisser',flatten:'aplanir',smooth:'lisser'})[e.mode]}) · r ${e.radius.toFixed(0)} m`:'Retouche de relief';}
    case 'biomeEdit':{const e=d as BiomeStroke|undefined;return e?`Biotope ${e.biome} · r ${e.radius.toFixed(0)} m`:'Retouche de biotope';}
  }
}
/** Representative point (focus, map highlight, list). */
export function elementAnchor(p:ProjectDocument,ref:ElementRef):PointXZ|null{
  if(ref.kind==='entity'){const e=p.entityIndex[ref.id];return e?{x:e.position.x,z:e.position.z}:null;}
  const d=elementData(p,ref);if(!d)return null;
  if('points' in d){const pts=d.points,mid=pts[Math.floor(pts.length/2)];return {x:mid.x,z:mid.z};}
  if('polygon' in d){const n=d.polygon.length;return {x:d.polygon.reduce((s,v)=>s+v.x,0)/n,z:d.polygon.reduce((s,v)=>s+v.z,0)/n};}
  return {x:d.x,z:d.z};
}
/** Sectors to hydrate before editing/deleting/duplicating the given elements. */
export function elementChunkIds(p:ProjectDocument,refs:ElementRef[],offset={x:0,z:0}):string[]{
  const ids=new Set<string>();
  for(const ref of refs){
    const d=elementData(p,ref);
    if(ref.kind==='entity'){const e=p.entityIndex[ref.id];if(e){ids.add(e.ownerChunkId);for(const id of duplicateChunkIds(p,[ref.id],{x:offset.x,y:0,z:offset.z}))ids.add(id);}}
    else if(ref.kind==='path'&&d){for(const id of lineChunkIds(p.world,d as PathDefinition))ids.add(id);for(const id of lineChunkIds(p.world,shiftLine(d as PathDefinition,offset)))ids.add(id);}
    else if(ref.kind==='water'&&d){for(const id of waterEditChunkIds(p,d as WaterBody,shiftLine(d as WaterBody,offset)))ids.add(id);}
    else if(ref.kind==='terrainEdit'||ref.kind==='biomeEdit'){for(const id of editChunkIds(p,ref.kind,ref.id))ids.add(id);const e=d as TerrainStroke|undefined;if(e)for(const id of affectedChunkIds(p.world,e.x+offset.x,e.z+offset.z,e.radius))ids.add(id);}
  }
  return [...ids];
}
function shiftLine<T extends {points:PointXZ[]}>(line:T,o:{x:number;z:number}):T{return {...structuredClone(line),points:line.points.map(q=>({x:q.x+o.x,z:q.z+o.z}))};}
/** Clamp a translated point set inside the world (keeps validators satisfied). */
function inside(p:ProjectDocument,pts:PointXZ[]){const b=p.world.bounds;return pts.every(q=>q.x>=b.minX&&q.x<=b.maxX&&q.z>=b.minZ&&q.z<=b.maxZ);}

export function deleteElements(draft:ProjectDocument,refs:ElementRef[]):void{
  deleteEntities(draft,refs.filter(r=>r.kind==='entity').map(r=>r.id));
  for(const r of refs){
    if(r.kind==='path')removePath(draft,r.id);else if(r.kind==='water')removeWater(draft,r.id);else if(r.kind==='zone')removeZone(draft,r.id);
    else if(r.kind==='terrainEdit')removeTerrainEdit(draft,r.id);else if(r.kind==='biomeEdit')removeBiomeEdit(draft,r.id);
  }
}
/** Copies with new stable ids, shifted by `offset`; returns the new references. */
export function duplicateElements(draft:ProjectDocument,refs:ElementRef[],offset:{x:number;z:number},newId:()=>string=()=>crypto.randomUUID()):ElementRef[]{
  const out:ElementRef[]=duplicateEntities(draft,refs.filter(r=>r.kind==='entity').map(r=>r.id),{x:offset.x,y:0,z:offset.z},newId).map(id=>({kind:'entity',id}));
  for(const r of refs){
    const d=elementData(draft,r);if(!d||r.kind==='entity')continue;
    if(r.kind==='path'){const copy={...shiftLine(d as PathDefinition,offset),id:'path:'+newId()};if(!inside(draft,copy.points))throw Error('La copie sortirait de la carte');putPath(draft,copy);out.push({kind:'path',id:copy.id});}
    else if(r.kind==='water'){const copy={...shiftLine(d as WaterBody,offset),id:newId()};if(!inside(draft,copy.points))throw Error('La copie sortirait de la carte');putWater(draft,copy);out.push({kind:'water',id:copy.id});}
    else if(r.kind==='zone'){const z=d as ActivityZoneV3,copy={...structuredClone(z),id:'zone:'+newId(),name:z.name+' (copie)',polygon:z.polygon.map(q=>({x:q.x+offset.x,z:q.z+offset.z}))};if(!inside(draft,copy.polygon))throw Error('La copie sortirait de la carte');putZone(draft,copy);out.push({kind:'zone',id:copy.id});}
    else{const e=d as TerrainStroke&BiomeStroke,copy={...structuredClone(e),id:newId(),x:e.x+offset.x,z:e.z+offset.z};if(r.kind==='terrainEdit')putTerrainEdit(draft,copy);else putBiomeEdit(draft,copy);out.push({kind:r.kind,id:copy.id});}
  }
  return out;
}
/** Horizontal move of whole elements (entities keep their height offset above ground). */
export function moveElements(draft:ProjectDocument,refs:ElementRef[],offset:{x:number;z:number}):void{
  const entities=refs.filter(r=>r.kind==='entity').map(r=>{const t=entityTransform(draft,r.id);return {id:r.id,transform:{...t,position:{...t.position,x:t.position.x+offset.x,z:t.position.z+offset.z}}};});
  if(entities.length)applyTransforms(draft,entities);
  for(const r of refs){
    const d=elementData(draft,r);if(!d||r.kind==='entity')continue;
    if(r.kind==='path'){const next=shiftLine(d as PathDefinition,offset);if(!inside(draft,next.points))throw Error('Hors de la carte');putPath(draft,next);}
    else if(r.kind==='water'){const next=shiftLine(d as WaterBody,offset);if(!inside(draft,next.points))throw Error('Hors de la carte');putWater(draft,next);}
    else if(r.kind==='zone'){const z=d as ActivityZoneV3,next={...z,polygon:z.polygon.map(q=>({x:q.x+offset.x,z:q.z+offset.z}))};if(!inside(draft,next.polygon))throw Error('Hors de la carte');putZone(draft,next);}
    else{const e=d as TerrainStroke&BiomeStroke,next={...e,x:e.x+offset.x,z:e.z+offset.z};if(r.kind==='terrainEdit')putTerrainEdit(draft,next);else putBiomeEdit(draft,next);}
  }
}
export function moveChunkIds(p:ProjectDocument,refs:ElementRef[],offset:{x:number;z:number}):string[]{
  const entities=refs.filter(r=>r.kind==='entity').map(r=>{const t=entityTransform(p,r.id);return {id:r.id,transform:{...t,position:{...t.position,x:t.position.x+offset.x,z:t.position.z+offset.z}}};});
  return [...new Set([...(entities.length?transformChunkIds(p,entities):[]),...elementChunkIds(p,refs.filter(r=>r.kind!=='entity'),offset)])];
}
/** Human-readable references that a deletion would break (checked before destructive edits). */
export function elementDependents(p:ProjectDocument,refs:ElementRef[]):string[]{
  const out:string[]=[],index=new ReferenceIndex(p),ids=new Set(refs.map(r=>r.id));
  for(const r of refs)if(r.kind==='entity')for(const d of index.dependents(r.id))if(!ids.has(d))out.push(d);
  // Lights in entities of other sectors never point to paths/zones; NPC routes are inline points.
  return [...new Set(out)];
}
/** Author list: every authoring element of the project (entities from the global index, other
 * kinds from the libraries and the loaded sectors), filtered by text and kind. */
export function listElements(p:ProjectDocument,query='',kind:ElementKind|'all'|'light'='all',limit=120):{ref:ElementRef;label:string}[]{
  const q=query.trim().toLowerCase(),out:{ref:ElementRef;label:string}[]=[];
  const add=(ref:ElementRef)=>{if(kind!=='all'&&kind!=='light'&&ref.kind!==kind)return;const label=elementLabel(p,ref);if(q&&!(label+' '+ref.id).toLowerCase().includes(q))return;out.push({ref,label});};
  for(const e of Object.values(p.entityIndex)){if(kind==='light'&&!isLightEntity(p,e.id))continue;add({kind:'entity',id:e.id});}
  if(kind!=='light'){
    for(const id of Object.keys(p.libraries.paths))add({kind:'path',id});for(const id of Object.keys(p.libraries.water))add({kind:'water',id});
    for(const id of Object.keys(p.libraries.zones??{}))add({kind:'zone',id});
    for(const c of Object.values(p.chunks)){for(const e of c.terrainEdits)add({kind:'terrainEdit',id:e.id});for(const e of c.biomeEdits)add({kind:'biomeEdit',id:e.id});}
  }
  return out.sort((a,b)=>a.label.localeCompare(b.label,'fr')).slice(0,limit);
}
/** Entity carrying a Light component (loaded sectors; the index has no component data). */
export function isLightEntity(p:ProjectDocument,id:string):boolean{
  const e=p.entityIndex[id];if(!e)return false;const source:EntityDefinitionV3|undefined=p.chunks[e.ownerChunkId]?.entities[id];
  return !!(source?.components as Record<string,unknown>|undefined)?.Light;
}
/** Elements whose geometry contains a ground point (2D map / 3D clicks outside meshes),
 * most specific first: paths and rivers (within their width), then zones. */
export function elementsAt(p:ProjectDocument,x:number,z:number,tolerance=1.5):ElementRef[]{
  const out:{ref:ElementRef;d:number}[]=[];
  const lineDistance=(pts:PointXZ[])=>{let best=Infinity;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}return best;};
  for(const path of Object.values(p.libraries.paths)){const d=lineDistance(path.points)-path.width/2;if(d<=tolerance)out.push({ref:{kind:'path',id:path.id},d});}
  for(const water of Object.values(p.libraries.water)){const d=lineDistance(water.points)-water.width/2;if(d<=tolerance)out.push({ref:{kind:'water',id:water.id},d:d+.5});}
  for(const zone of Object.values(p.libraries.zones??{})){let inside=false;const poly=zone.polygon;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a.z>z)!==(b.z>z)&&x<a.x+(z-a.z)/(b.z-a.z)*(b.x-a.x))inside=!inside;}if(inside)out.push({ref:{kind:'zone',id:zone.id},d:100});}
  return out.sort((a,b)=>a.d-b.d).map(v=>v.ref);
}
export function toElementRefs(values:{kind:string;id:string}[]):ElementRef[]{return values.filter(v=>isKind(v.kind)).map(v=>({kind:v.kind as ElementKind,id:v.id}));}
export {chunkAt};
/** Field changes of a non-entity element (validated by the regular V3 writers). */
export type ElementPatch=Record<string,unknown>;
export function updateElement(draft:ProjectDocument,ref:ElementRef,patch:ElementPatch):void{
  const d=elementData(draft,ref);if(!d||ref.kind==='entity')throw Error('Élément introuvable');
  const next={...structuredClone(d),...structuredClone(patch)} as never;
  if(ref.kind==='path')putPath(draft,next);else if(ref.kind==='water')putWater(draft,next);else if(ref.kind==='zone')putZone(draft,next);
  else if(ref.kind==='terrainEdit')putTerrainEdit(draft,next);else putBiomeEdit(draft,next);
}
export function updateChunkIds(p:ProjectDocument,ref:ElementRef,patch:ElementPatch):string[]{
  const d=elementData(p,ref);if(!d)return [];const next={...d,...patch} as Record<string,unknown>;
  if(ref.kind==='path')return [...new Set([...lineChunkIds(p.world,d as PathDefinition),...lineChunkIds(p.world,next as unknown as PathDefinition)])];
  if(ref.kind==='water')return waterEditChunkIds(p,d as WaterBody,next as unknown as WaterBody);
  if(ref.kind==='terrainEdit'||ref.kind==='biomeEdit')return [...new Set([...editChunkIds(p,ref.kind,ref.id),...affectedChunkIds(p.world,next.x as number,next.z as number,next.radius as number)])];
  return [];
}
