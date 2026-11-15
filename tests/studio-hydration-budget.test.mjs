import test from 'node:test';
import assert from 'node:assert/strict';
import {planHydrationEviction} from '../src/studio-core/hydration-budget.ts';
test('hydration policy evicts only unpinned sources to meet budget',()=>{
  const loaded=Array.from({length:15},(_,i)=>'chunk-'+i),pinned=new Set(['chunk-0','chunk-1','chunk-13']);
  const evicted=planHydrationEviction(loaded,pinned,4);
  assert.equal(evicted.length,11);
  assert.ok(evicted.every(id=>!pinned.has(id)));
  const survivors=loaded.filter(id=>!evicted.includes(id));
  assert.equal(survivors.length,4);
  assert.ok([...pinned].every(id=>survivors.includes(id)));
  assert.deepEqual(planHydrationEviction(survivors,pinned,4),[]);
});
test('soft budget permits more protected sources than requested budget',()=>{
  assert.deepEqual(planHydrationEviction(['a','b','c'],new Set(['a','b','c']),1),[]);
  assert.throws(()=>planHydrationEviction(['a'],new Set(),0));
});
