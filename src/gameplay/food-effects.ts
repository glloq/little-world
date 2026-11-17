/** Whitelisted edible rewards: never infer safety from an item's category/name. */
export const FOOD_GAS:Readonly<Record<string,number>>={
 'food:apple':25,'food:pear':25,'food:plum':15,'food:cherry':12
};
export const foodGasValue=(itemId:string)=>FOOD_GAS[itemId]??0;
