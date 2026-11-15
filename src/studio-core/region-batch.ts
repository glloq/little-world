/** Dry-run regional composition using the exact authoring algorithm, never the render scene.
 * Clone only affected chunks, region records and the generator; manual masks stay protected.
 * An ordered batch is committed by StudioSession as one undoable transaction. */
import type {ProjectDocument} from './types.ts';
import {applyRegion,regionAffectedChunks,type RegionRecipeV1,type RegionReport} from './region-recipes.ts';

export interface RegionBatchPreview {
 chunks:string[];
 reports:{id:string;name:string;report:RegionReport}[];
 totals:{painted:number;cleared:number;protected:number;preserved:number};
}
export const REGION_BATCH_LIMIT=16;
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
export function previewRegionBatch(p:ProjectDocument,recipes:readonly RegionRecipeV1[]):RegionBatchPreview{
 checkBatch(recipes);
 const chunks=regionBatchChunks(p,recipes);
 const scratch:ProjectDocument={...p,
  chunks:{...p.chunks},
  libraries:{...p.libraries,regions:structuredClone(p.libraries.regions??{})},
  world:{...p.world,terrain:p.world.terrain?structuredClone(p.world.terrain):undefined}
 };
 for(const id of chunks)if(p.chunks[id])scratch.chunks[id]=structuredClone(p.chunks[id]);
 return applyRegionBatch(scratch,recipes);
}
