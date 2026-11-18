/** Pure inventory V3 policies. DOM and rendering must never determine gameplay authority. */
import {foodGasValue} from '../../gameplay/food-effects.ts';
import type {ItemDefinition} from '../../gameplay/schema.ts';

export type InventoryFilter='all'|'food'|'resources'|'equipment';
export type EquipTarget='hands'|'head'|'back'|'feet';
export const FAVORITE_COUNT=10;

/** Explicit slots for known items; never infer equipment from translated item names. */
const KNOWN_SLOTS:Readonly<Record<string,EquipTarget>>={
  'tool:miners-helmet':'head',
};
export function equipSlot(item:Pick<ItemDefinition,'id'|'category'>):EquipTarget|null{
  const defined=KNOWN_SLOTS[item.id];
  if(defined)return defined;
  if(item.category==='tool'||item.category==='outil'||item.category==='instrument')return 'hands';
  return null; // cosmetics need an explicit declared capability before becoming usable
}
export function isEquipment(item:Pick<ItemDefinition,'id'|'category'>):boolean{
  return equipSlot(item)!==null||['equipment','accessory','cosmetic'].includes(item.category);
}
export function matchesInventoryFilter(item:Pick<ItemDefinition,'id'|'category'>,filter:InventoryFilter):boolean{
  if(filter==='all')return true;
  if(filter==='food')return foodGasValue(item.id)>0;
  if(filter==='equipment')return isEquipment(item);
  return !isEquipment(item)&&foodGasValue(item.id)<=0;
}
export type FoodLine={itemId:string;quantity:number;gas:number};
export interface FoodPlan {lines:FoodLine[];totalGas:number;gain:number;waste:number;remaining:number}
/** Bounded knapsack: prefer a complete refill with minimum waste, then fewest items.
 * If the selected food is insufficient, use as much as possible. Max gas is < 300.
 * The return value is only a preview; the gameplay command revalidates everything.
 */
export function planFoodConsumption(ids:readonly string[],inventory:Readonly<Record<string,number>>,missingGas:number):FoodPlan{
  const remaining=Math.max(0,Math.ceil(Number.isFinite(missingGas)?missingGas:0));
  const unique=[...new Set(ids)].filter(id=>foodGasValue(id)>0&&(inventory[id]??0)>0);
  if(!unique.length||remaining===0)return {lines:[],totalGas:0,gain:0,waste:0,remaining};
  const maxItem=Math.max(...unique.map(foodGasValue));
  const limit=remaining+maxItem-1;
  type Node={count:number;previous:Node|null;itemId:string|null};
  const dp=new Map<number,Node>([[0,{count:0,previous:null,itemId:null}]]);
  for(const id of unique){
    const value=foodGasValue(id),quantity=Math.min(Math.floor(inventory[id]??0),Math.ceil(remaining/value)+1);
    // Each copy must be applied once, not an unlimited number of times.
    for(let copy=0;copy<quantity;copy++){
      const snapshot=[...dp.entries()].sort((a,b)=>b[0]-a[0]);
      for(const [sum,node] of snapshot){
        const next=sum+value;if(next>limit)continue;
        const existing=dp.get(next);
        if(!existing||existing.count>node.count+1)dp.set(next,{count:node.count+1,previous:node,itemId:id});
      }
    }
  }
  const sums=[...dp.keys()].filter(v=>v>0);
  const covers=sums.filter(v=>v>=remaining);
  const target=covers.length?Math.min(...covers):Math.max(...sums);
  const counts=new Map<string,number>();
  for(let n=dp.get(target)!;n.itemId!==null;n=n.previous!)counts.set(n.itemId,(counts.get(n.itemId)??0)+1);
  const lines=[...counts].map(([itemId,quantity])=>({itemId,quantity,gas:quantity*foodGasValue(itemId)}));
  return {lines,totalGas:target,gain:Math.min(target,remaining),waste:Math.max(0,target-remaining),remaining};
}
