/** Small default surf inventory item, shared across the archipelago and old maps. */
import type {ItemDefinition} from '../gameplay/schema.ts';
export const SURFBOARD_ID='tool:surfboard';
export const SURF_ITEMS:readonly ItemDefinition[]=[{
 id:SURFBOARD_ID,name:'Planche de surf',category:'tool',maxQuantity:1,
 description:'Planche légère pour ramer, prendre les vagues et effectuer des sauts.'
}];
