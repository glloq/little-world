import test from 'node:test';
import assert from 'node:assert/strict';
const {SlotAllocator}=await import('../src/render/slot-allocator.ts');

test('slot allocator: first fit, merge of free ranges and high-water mark', ()=>{
  const a=new SlotAllocator(100);
  assert.equal(a.allocate(10),0);assert.equal(a.allocate(20),10);assert.equal(a.allocate(5),30);
  assert.equal(a.end,35);
  a.release(10,20);assert.equal(a.end,35);assert.equal(a.holes,20);
  assert.equal(a.allocate(8),10);assert.equal(a.allocate(12),18);assert.equal(a.holes,0);
  a.release(30,5);assert.equal(a.end,30);
  a.release(10,8);a.release(18,12);assert.equal(a.end,10,'trailing merged ranges shrink the drawn count');
  assert.equal(a.allocate(95),-1);assert.equal(a.allocate(90),10);assert.equal(a.end,100);
});

test('slot allocator: random churn keeps ranges disjoint and accounting exact', ()=>{
  const a=new SlotAllocator(5000),live=new Map();let seed=3;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
  for(let step=0;step<4000;step++){
    if(live.size&&rnd()<.45){const keys=[...live.keys()],k=keys[Math.floor(rnd()*keys.length)],[s,n]=live.get(k);a.release(s,n);live.delete(k);}
    else{const n=1+Math.floor(rnd()*120),s=a.allocate(n);if(s>=0)live.set(step,[s,n]);}
    const used=[...live.values()].reduce((t,[,n])=>t+n,0);assert.equal(a.used,used);
    const sorted=[...live.values()].sort((x,y)=>x[0]-y[0]);
    for(let i=1;i<sorted.length;i++)assert.ok(sorted[i-1][0]+sorted[i-1][1]<=sorted[i][0],'overlap');
    if(sorted.length)assert.ok(a.end>=sorted.at(-1)[0]+sorted.at(-1)[1]);
    assert.ok(a.end<=5000);
  }
});
