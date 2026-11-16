/** A4 — Headwater proposals from bounded D8 catchments.
 * Reuses the validated guided-river planner and WATER compiler, not a second water
 * persistence model. This is an authoring-only preview, with no document mutation. */
import type {WaterBody} from '../world-data.ts';
import type {WatershedHeadwater} from './watershed-analysis.ts';
import {planGuidedRiver,type GuidedRiverContext,type GuidedRiverResult} from './guided-river.ts';

export interface ProposedHeadwater {source:WatershedHeadwater;plan:GuidedRiverResult}
export interface WatershedRiverPreview {proposals:ProposedHeadwater[];rejected:{source:WatershedHeadwater;reason:string}[]}
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
function nearExisting(source:WatershedHeadwater,waters:readonly WaterBody[],distanceM:number):boolean{
 return waters.some(w=>w.points.some(p=>distance(source.source,p)<distanceM));
}
/** Bound CPU work and avoid duplicating a currently authored source. Each suggestion
 * is validated in the context of the preceding accepted suggestions as well. */
export function proposeWatershedRivers(
 candidates:readonly WatershedHeadwater[],context:GuidedRiverContext,
 options:{width?:number;depth?:number;maxLengthM?:number;maxRivers?:number;idPrefix?:string}={}
):WatershedRiverPreview{
 const limit=Math.min(6,Math.max(1,Math.floor(options.maxRivers??3)));
 const width=options.width??6,depth=options.depth??2,maxLengthM=options.maxLengthM??1200;
 const proposals:ProposedHeadwater[]=[],rejected:WatershedRiverPreview['rejected']=[];
 const existing=[...context.existing];
 for(const [index,source] of candidates.slice(0,12).entries()){
  if(proposals.length>=limit)break;
  if(nearExisting(source,existing,Math.max(20,width*3))){rejected.push({source,reason:'Source déjà proche d’un cours d’eau'});continue;}
  try{
   const plan=planGuidedRiver(source.source,source.toward,{...context,existing},
     {id:(options.idPrefix??'watershed-')+index,width,depth,maxLengthM});
   if(plan.trace.lengthM<40||plan.trace.drop<1)throw Error('Parcours trop court ou dénivelé insuffisant');
   if(plan.water.points.some(p=>existing.some(w=>w.points.some(q=>distance(q,p)<width*2)))){
    // A single connection at an outlet is legitimate; crossing a previously
    // authored channel before the outlet needs a manual check.
    const intermediates=plan.water.points.slice(0,-1);
    if(intermediates.some(p=>existing.some(w=>w.points.some(q=>distance(q,p)<width*2))))
      throw Error('Chevauchement avec un cours d’eau existant');
   }
   proposals.push({source,plan});existing.push(plan.water);
  }catch(error){rejected.push({source,reason:error instanceof Error?error.message:String(error)});}
 }
 return {proposals,rejected};
}
