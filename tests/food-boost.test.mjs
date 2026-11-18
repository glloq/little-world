import test from 'node:test';
import assert from 'node:assert/strict';
import {FOOD_GAS,foodGasValue} from '../src/gameplay/food-effects.ts';
import {ECONOMY_ITEMS,STARTING_KIT,economyItems} from '../src/gameplay/economy.ts';
import {PRODUCTION_ITEMS} from '../src/economy/starter-catalog.ts';
import {FARM_ITEMS} from '../src/farm/farm-data.ts';
import {INSTRUMENT_ITEMS} from '../src/instruments/definitions.ts';
import {GAS,gasCapacity,gasShots,refillGas,upgradeGas} from '../src/physics/gas-propulsion.ts';

test('edible boost values have explicit IDs in the runtime item catalogue',()=>{
  const known=new Map([...economyItems(FARM_ITEMS),...PRODUCTION_ITEMS].map(item=>[item.id,item]));
  for(const [id,gas] of Object.entries(FOOD_GAS)){
    assert.ok(known.has(id),'missing food item '+id);
    assert.ok(Number.isInteger(gas)&&gas>0&&gas<=gasCapacity({}),'invalid gas '+id);
    assert.equal(foodGasValue(id),gas);
  }
  assert.equal(foodGasValue('forage:mushroom'),0,'unidentified mushroom is not food');
  assert.equal(foodGasValue('forage:flower'),0,'flowers must not be edible by category');
  assert.equal(foodGasValue('seed:carrot'),0,'seed packets must not be edible');
  assert.equal(foodGasValue('unknown'),0);
});

test('the new starter bag covers several foods without exceeding item limits',()=>{
  const known=new Map([...ECONOMY_ITEMS,...FARM_ITEMS,...INSTRUMENT_ITEMS].map(item=>[item.id,item]));
  const ids=new Set();
  const edibleCategories=new Set();
  for(const row of STARTING_KIT){
    assert.ok(!ids.has(row.itemId),'duplicate starter '+row.itemId);ids.add(row.itemId);
    const item=known.get(row.itemId);assert.ok(item,'unknown starter item '+row.itemId);
    assert.ok(Number.isInteger(row.quantity)&&row.quantity>0&&row.quantity<=item.maxQuantity);
    if(foodGasValue(row.itemId)>0)edibleCategories.add(item.category);
  }
  assert.ok(edibleCategories.has('cueillette')&&edibleCategories.has('farm'));
  assert.ok(ids.has('food:chanterelle')&&ids.has('food:cepe'));
  assert.ok(ids.has('farm:carrot')&&ids.has('farm:pumpkin'));
});

test('refilling is capped by the actual upgradeable gas capacity',()=>{
  const player={gasReserve:150,gasCapacityLevel:0};
  assert.equal(gasCapacity(player),200);
  assert.equal(refillGas(player,foodGasValue('food:apple')),25);
  assert.equal(player.gasReserve,175);
  assert.equal(refillGas(player,foodGasValue('food:cheese')),25);
  assert.equal(player.gasReserve,200);
  assert.equal(refillGas(player,foodGasValue('food:cherry')),0);
  assert.equal(upgradeGas(player,'capacity'),true);
  assert.equal(gasCapacity(player),224);
  assert.equal(refillGas(player,foodGasValue('food:pear')),24);
  assert.equal(player.gasReserve,224);
  assert.equal(refillGas(player,-100),0);
  assert.equal(refillGas(player,Infinity),0);
  assert.equal(gasShots({gasReserve:GAS.cost}),1);
});
