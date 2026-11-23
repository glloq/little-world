import test from 'node:test';
import assert from 'node:assert/strict';
const THREE=await import('three');
const {LinearColor}=await import('../src/render/linear-color.ts');
const {generateGrassCell}=await import('../src/render/grass-cell.ts');

test('worker-safe grass colours equal Three.js Color.set(hex) for every 8-bit channel', ()=>{
  const a=new THREE.Color(),b=new LinearColor();
  for(let v=0;v<256;v++){const hex=(v<<16)|((255-v)<<8)|((v*7)&255);a.set(hex);b.setHex(hex);assert.equal(b.r,a.r);assert.equal(b.g,a.g);assert.equal(b.b,a.b);}
});

test('grass cell generation is deterministic and exact-size', ()=>{
  const sampler=(x,z)=>({share:.5+.4*Math.sin(x*.1),tall:.3,color:0x6a9a4a+((Math.floor(x)&7)<<16)}),height=(x,z)=>x*.01+z*.02;
  const a=generateGrassCell(7,3,-2,1.9,sampler,height,true),b=generateGrassCell(7,3,-2,1.9,sampler,height,true);
  assert.ok(a.count>0);assert.equal(a.matrices.length,a.count*16);assert.equal(a.colors.length,a.count*3);
  assert.deepEqual(a.matrices,b.matrices);assert.deepEqual(a.colors,b.colors);
  assert.notEqual(a.matrices.buffer,b.matrices.buffer,'each cell owns its arrays (scratch reused)');
});
