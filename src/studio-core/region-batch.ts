/** Dry-run regional composition using the exact authoring algorithm, never the render scene.
 * Clone only affected chunks, region records and the generator; manual masks stay protected.
 * An ordered batch is committed by StudioSession as one undoable transaction. */
import type {ProjectDocument} from './types.ts';
import {applyRegion,regionAffectedChunks,type RegionRecipeV1,type RegionReport} from './region-recipes.ts';
import {MASK_LAYERS,MASK_GRID} from '../geography/layers.ts';
import {projectGeography} from './geo-context.ts';

export interface RegionBatchPreview {
 chunks:string[];
 reports:{id:string;name:string;report:RegionReport}[];
 totals:{painted:number;cleared:number;protected:number;preserved:number};
}
export const REGION_BATCH_LIMIT=16;
export const REGION_DIFF_LIMIT=16384;
export interface RegionDiffCell {chunkId:string;index:number;kind:'painted'|'cleared'|'replaced'}
export interface RegionReliefSample {x:number;z:number;deltaM:number}
export interface RegionVisualPreview extends RegionBatchPreview {
 diff:{cells:RegionDiffCell[];total:number;truncated:boolean};
 relief:{samples:RegionReliefSample[];tested:number;maxAbsDeltaM:number;skippedChunks:number};
}
export function regionBatchChunks(p:ProjectDocument,recipes:readonly RegionRecipeV1[]):string[]{
 const chunks=new Set<string>();
 for(const recipe of recipes)for(const id of regionAffectedChunks(p,recipe))chunks.add(id);
 return [...chunks].sort();
}
function checkBatch(recipes:readonly RegionRecipeV1[]):void{
 if(!recipes.length||recipes.length>REGION_BATCH_LIMIT)throw Error('Composer entre 1 et 16 régions à la fois');
 if(new Set(recipes.map(r=>r.id)).size!==recipes.length)throw Error('Région répétée dans la composition');
}
export function applyRegionBatch(p:ProjectDocument,recipes:readonly RegionRecipeV1[]):RegionBatchPreview{
 checkBatch(recipes);
 const chunks=regionBatchChunks(p,recipes);
 for(const id of chunks)if(p.chunkIndex[id]&&!p.chunks[id])throw Error('Charger le secteur avant composition : '+id);
 const reports=recipes.map(r=>({id:r.id,name:r.name,report:applyRegion(p,r)}));
 const totals={painted:0,cleared:0,protected:0,preserved:0};
 for(const {report} of reports)for(const key of Object.keys(totals) as (keyof typeof totals)[])totals[key]+=report[key];
 return {chunks,reports,totals};
}
/** Exact non-mutating preview, including overlapping recipes and previous ownership.
 * Only the affected chunks are copied; entity data and other chunks remain shared. */
function previewDraft(p:ProjectDocument,recipes:readonly RegionRecipeV1[]):ProjectDocument{
 const chunks=regionBatchChunks(p,recipes);
 const scratch:ProjectDocument={...p,
  chunks:{...p.chunks},
  // paintMask/ensureChunk may create chunkIndex metadata; isolate it from the
  // original document so dry-run previews cannot leak sector registrations.
  chunkIndex:{...p.chunkIndex},
  libraries:{...p.libraries,regions:structuredClone(p.libraries.regions??{})},
  world:{...p.world,terrain:p.world.terrain?structuredClone(p.world.terrain):undefined}
 };
 for(const id of chunks){
  if(p.chunks[id])scratch.chunks[id]=structuredClone(p.chunks[id]);
  if(p.chunkIndex[id])scratch.chunkIndex[id]=structuredClone(p.chunkIndex[id]);
 }
 return scratch;
}
export function previewRegionBatch(p:ProjectDocument,recipes:readonly RegionRecipeV1[]):RegionBatchPreview{
 checkBatch(recipes);
 return applyRegionBatch(previewDraft(p,recipes),recipes);
}
/** Exact visual change map, computed from the same simulation as applyRegionBatch.
 * One point per changed cell (not per layer), bounded to avoid large UI allocations. */
export function previewRegionBatchWithDiff(p:ProjectDocument,recipes:readonly RegionRecipeV1[]):RegionVisualPreview{
 checkBatch(recipes);
 const scratch=previewDraft(p,recipes),summary=applyRegionBatch(scratch,recipes);
 const cells:RegionDiffCell[]=[];let total=0;
 for(const id of summary.chunks){
  const before=p.chunks[id]?.layers,after=scratch.chunks[id]?.layers;
  if(before===after)continue;
  for(let index=0;index<MASK_GRID*MASK_GRID;index++){
   let painted=false,cleared=false,replaced=false;
   for(const layer of MASK_LAYERS){
    const oldCode=before?.[layer]?.[index]??'.',newCode=after?.[layer]?.[index]??'.';
    if(oldCode===newCode)continue;
    if(oldCode==='.')painted=true;
    else if(newCode==='.')cleared=true;
    else replaced=true;
   }
   if(!(painted||cleared||replaced))continue;
   total++;
   if(cells.length<REGION_DIFF_LIMIT)
    cells.push({chunkId:id,index,kind:replaced||painted&&cleared?'replaced':painted?'painted':'cleared'});
  }
 }
 const relief:{samples:RegionReliefSample[];tested:number;maxAbsDeltaM:number;skippedChunks:number}={
   samples:[],tested:0,maxAbsDeltaM:0,skippedChunks:0
 };
 // Only inspect relief when the exact authoring simulation changed a generator
 // feature. Mask-only compositions need no terrain evaluations at all.
 if(summary.reports.some(r=>r.report.feature==='added'||r.report.feature==='updated')){
   const old=projectGeography(p).ctx,next=projectGeography(scratch).ctx;
   const cap=4096,perChunk=16,stride=Math.max(1,Math.ceil(summary.chunks.length*perChunk/cap)),
     bounds=p.world.bounds,size=p.world.chunkSizeM,quad=4;
   relief.skippedChunks=summary.chunks.length-Math.ceil(summary.chunks.length/stride);
   for(let k=0;k<summary.chunks.length;k+=stride){
     const [cx,cz]=summary.chunks[k].split(':').map(Number);
     for(let iz=0;iz<quad;iz++)for(let ix=0;ix<quad;ix++){
       const x=Math.min(bounds.maxX-.01,bounds.minX+(cx+(ix+.5)/quad)*size),
         z=Math.min(bounds.maxZ-.01,bounds.minZ+(cz+(iz+.5)/quad)*size);
       relief.tested++;
       const delta=next.height(x,z)-old.height(x,z);
       if(!Number.isFinite(delta))throw Error('Variation de relief non finie pendant la prévisualisation');
       relief.maxAbsDeltaM=Math.max(relief.maxAbsDeltaM,Math.abs(delta));
       if(Math.abs(delta)>.25)relief.samples.push({x,z,deltaM:Math.round(delta*100)/100});
     }
   }
 }
 return {...summary,diff:{cells,total,truncated:total>cells.length},relief};
}
