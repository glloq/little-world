/** Dressing priorities (doc 22 consumer, doc 42 §G6): what the natural dressing keeps when the
 * shared budget lowers the detail level. Trees and forests first (they make the landscape and
 * their far silhouettes cost 4–8 triangles each), then the gatherable flora (flowers,
 * mushrooms, reeds: gameplay), then shrubs; small ground plants, deadwood, pebbles and scree go
 * first. Pure tables: the renderer reads them, the budget manager only sets the level.
 * Values are benchmark knobs, not truths. */
import type {DressingKind} from '../geography/dressing.ts';

export type DressingClass='tree'|'gather'|'shrub'|'ground'|'deadwood'|'rock'|'small';
/** Drawing order of the classes when filling the shared GLB batches. */
export const CLASS_ORDER:readonly DressingClass[]=['tree','gather','shrub','ground','deadwood','rock','small'];
/** Radius multiplier per class and detail level (0 full … 3 lowest). 0 = class not drawn. */
export const CLASS_SCALE:Record<DressingClass,readonly [number,number,number,number]>={
  tree:[1,.95,.85,.75],gather:[1,.9,.8,.7],shrub:[1,.8,.6,.45],ground:[1,.6,.4,0],deadwood:[1,.6,.4,0],rock:[1,.85,.7,.6],small:[1,.5,0,0],
};
/** Far tree silhouettes: never switched off (forests stay on screen at every level). */
export const FAR_SCALE:readonly [number,number,number,number]=[1,1,.9,.8];
/** Share of a GLB batch (per LOD) a class may fill; trees may use all of it. */
export const CLASS_SHARE:Record<DressingClass,number>={tree:1,gather:.25,shrub:.25,ground:.3,deadwood:.08,rock:1,small:1};
/** Species picked by the player (flowers, mushrooms, reeds): kept like a gameplay element. */
export const GATHERABLE=new Set(['nature.mushrooms_patch','nature.mushroom_tall','nature.wildflowers_patch','nature.flowers_tall','nature.reeds_patch']);
export function classOf(kind:DressingKind,speciesId?:string):DressingClass{
  switch(kind){
    case 'pine':case 'oak':return 'tree';
    case 'shrub':return 'shrub';
    case 'plant':return speciesId&&GATHERABLE.has(speciesId)?'gather':'ground';
    case 'deadwood':return 'deadwood';
    case 'rock':case 'basalt':return 'rock';
    default:return 'small';
  }
}
export const classScale=(c:DressingClass,detail:number)=>CLASS_SCALE[c][Math.max(0,Math.min(3,Math.round(detail)))];
export const farScale=(detail:number)=>FAR_SCALE[Math.max(0,Math.min(3,Math.round(detail)))];
