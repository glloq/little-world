import type {ProjectDocument,WorldDefinitionV3} from '../studio-core/types.ts';
import type {WaterBody} from '../world-data.ts';
import {affectedChunkIds} from '../studio-core/schema.ts';
/** Conservative corridor, not the whole bounding rectangle of a winding river. */
export function waterChunkIds(world:WorldDefinitionV3,water:WaterBody):string[]{
 const ids=new Set<string>();
 for(let i=1;i<water.points.length;i++){
  const a=water.points[i-1],b=water.points[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/(world.chunkSizeM/2)));
  for(let j=0;j<=steps;j++)for(const id of affectedChunkIds(world,a.x+(b.x-a.x)*j/steps,a.z+(b.z-a.z)*j/steps,water.width/2+2+length/steps/2))ids.add(id);
 }
 return [...ids];
}
export function waterTerrainChunks(project:ProjectDocument,waterIds:string[]):string[]{
 const ids=new Set<string>();
 for(const id of waterIds){const water=project.libraries.water[id];if(water?.profile?.mode==='terrain')for(const chunk of waterChunkIds(project.world,water))if(project.chunkIndex[chunk])ids.add(chunk);}
 return [...ids];
}
export function waterTerrainIds(project:ProjectDocument,waterIds:string[]):string[]{
 const ids=new Set<string>();
 for(const id of waterTerrainChunks(project,waterIds)){
  const chunk=project.chunks[id];if(!chunk)throw Error(`Charger le secteur du profil d’eau : ${id}`);
  chunk.terrainRefs.forEach(id=>ids.add(id));chunk.terrainEdits.forEach(edit=>ids.add(edit.id));
 }
 return [...ids];
}
/** Includes old V2 bounding-circle references so converting a migrated line removes stale refs. */
export function waterEditChunkIds(project:ProjectDocument,before:WaterBody|undefined,after:WaterBody|undefined):string[]{
 const ids=new Set(after?waterChunkIds(project.world,after):[]);
 if(before){
  for(const id of waterChunkIds(project.world,before))if(project.chunkIndex[id])ids.add(id);
  const xs=before.points.map(p=>p.x),zs=before.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  for(const id of affectedChunkIds(project.world,(minX+maxX)/2,(minZ+maxZ)/2,Math.hypot(maxX-minX,maxZ-minZ)/2+before.width/2+2))if(project.chunkIndex[id])ids.add(id);
 }
 return [...ids];
}
