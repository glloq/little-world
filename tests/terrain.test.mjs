import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_WIDTH,WORLD_LENGTH,clamp,riverLevel,riverX,terrainHeight,
  waterSurface,waterDepth,insideWorld,mulberry32
} from '../src/terrain.ts';

test('map dimensions and world boundaries',()=>{
  assert.equal(WORLD_WIDTH,200);
  assert.equal(WORLD_LENGTH,600);
  assert.equal(insideWorld(0,0),true);
  assert.equal(insideWorld(101,0),false);
  assert.equal(insideWorld(0,-310),false);
  assert.equal(clamp(9,0,5),5);
});
test('river has a continuous descending water profile',()=>{
  let previous=Infinity;
  for(let z=-275;z<=185;z+=5){
    const h=riverLevel(z);
    assert.ok(Number.isFinite(h));
    assert.ok(h<=previous+1e-8);
    assert.equal(waterSurface(riverX(z),z),h);
    assert.ok(waterDepth(riverX(z),z)>1);
    previous=h;
  }
});
test('terrain rises toward mountain edges and stays finite',()=>{
  for(const z of [-240,-100,20,130]){
    const r=riverX(z);
    const center=terrainHeight(r,z);
    const slope=terrainHeight(85,z);
    assert.ok(Number.isFinite(center));
    assert.ok(Number.isFinite(slope));
    assert.ok(slope>center+10);
  }
});
test('ocean is at sea level and has a submerged floor',()=>{
  assert.equal(waterSurface(0,250),0);
  assert.ok(terrainHeight(0,250)<0);
  assert.equal(waterSurface(130,250),null);
});
test('seeded random is repeatable and independent',()=>{
  const sample=(seed)=>Array.from({length:20},mulberry32(seed));
  assert.deepEqual(sample(1284),sample(1284));
  assert.notDeepEqual(sample(1284),sample(1285));
  for(const value of sample(1284))assert.ok(value>=0&&value<1);
});
