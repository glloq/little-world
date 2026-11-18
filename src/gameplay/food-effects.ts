/** Explicitly identified consumables: unknown gathered mushrooms must not be edible. */
export const FOOD_GAS:Readonly<Record<string,number>>={
  // Fruits & berries — quick snacks.
  'food:apple':25,'food:pear':25,'food:plum':15,'food:cherry':12,'food:berry':10,
  // Nuts — compact food for short trips.
  'food:hazelnut':12,'food:walnut':18,
  // Vegetables — including existing harvest items.
  'farm:carrot':20,'farm:pumpkin':55,'food:potato':35,
  // Identified edible mushrooms only; never forage:mushroom (unidentified).
  'food:chanterelle':25,'food:cepe':35,
  // Prepared food.
  'food:cheese':45,
  // Prepared products from workshop recipes (fixed gas units, never inferred by category).
  'food:bread':38,'food:jam':42,'food:soup':58,
};
export const foodGasValue=(itemId:string)=>FOOD_GAS[itemId]??0;
