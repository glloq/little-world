import test from 'node:test';
import assert from 'node:assert/strict';
import {equipSlot,isEquipment,matchesInventoryFilter,planFoodConsumption,FAVORITE_COUNT} from '../src/ui/inventory/inventory-logic.ts';

test('inventory V3 keeps ten quick equipment slots and explicit target rules',()=>{
  assert.equal(FAVORITE_COUNT,10);
  assert.equal(equipSlot({id:'tool:miners-helmet',category:'outil'}),'head');
  assert.equal(equipSlot({id:'tool:pickaxe',category:'outil'}),'hands');
  assert.equal(equipSlot({id:'instrument:flute',category:'instrument'}),'hands');
  assert.equal(equipSlot({id:'forage:mushroom',category:'cueillette'}),null);
  assert.equal(isEquipment({id:'tool:axe',category:'outil'}),true);
  assert.equal(isEquipment({id:'food:apple',category:'cueillette'}),false);
});
test('filtering is based on capabilities, not item name or translation',()=>{
  assert.equal(matchesInventoryFilter({id:'food:apple',category:'cueillette'},'food'),true);
  assert.equal(matchesInventoryFilter({id:'forage:mushroom',category:'cueillette'},'food'),false);
  assert.equal(matchesInventoryFilter({id:'instrument:ocarina',category:'instrument'},'equipment'),true);
  assert.equal(matchesInventoryFilter({id:'tool:axe',category:'outil'},'resources'),false);
  assert.equal(matchesInventoryFilter({id:'mine:stone',category:'mine'},'resources'),true);
});
test('batch planner refills with the smallest possible waste',()=>{
  const plan=planFoodConsumption(['food:apple','food:hazelnut','food:cheese'],{
    'food:apple':2,'food:hazelnut':1,'food:cheese':1,
  },35);
  assert.equal(plan.totalGas,37); // 25 + 12, not a 45-point cheese
  assert.equal(plan.gain,35);
  assert.equal(plan.waste,2);
  assert.deepEqual(plan.lines.map(x=>x.itemId).sort(),['food:apple','food:hazelnut']);
});
test('food planner respects stack quantities and depleted/invalid foods',()=>{
  const inv={'food:apple':1,'food:pear':0,'forage:mushroom':9};
  const plan=planFoodConsumption(['food:apple','food:pear','forage:mushroom'],inv,80);
  assert.equal(plan.gain,25);assert.equal(plan.totalGas,25);
  assert.deepEqual(plan.lines,[{itemId:'food:apple',quantity:1,gas:25}]);
  assert.deepEqual(planFoodConsumption(['forage:mushroom'],inv,20).lines,[]);
  assert.deepEqual(planFoodConsumption(['food:apple'],inv,0).lines,[]);
});
test('food planner does not consume duplicate selected ids twice',()=>{
  const plan=planFoodConsumption(['food:apple','food:apple'],{'food:apple':2},50);
  assert.deepEqual(plan.lines,[{itemId:'food:apple',quantity:2,gas:50}]);
});
