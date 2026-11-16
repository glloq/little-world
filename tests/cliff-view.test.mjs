import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildCliffGeometry,createCliffView,CLIFF_BUDGET} from '../src/render/cliff-view.ts';

const ridge=(id='rl-cliff-test')=>({id,kind:'ridge',widthM:12,heightM:65,points:[{x:-60,z:0},{x:60,z:0}]});
const terrain={kind:'archipelago',version:1,archipelago:{features:[ridge()],landmasses:[],seabedDepthM:50,detailM:0}};
const height=(x,z)=>20+65*(Math.max(0,1-Math.abs(z)/12)**2);

test('rock faces are deterministic, faceted, finite and bounded per segment',()=>{
 const args={a:{x:-12,z:0},b:{x:12,z:0},widthM:12,seed:42};
 const first=buildCliffGeometry(args,height,0),second=buildCliffGeometry(args,height,0);
 const pos=first.getAttribute('position'),colors=first.getAttribute('color');
 assert.ok(pos.count>0&&pos.count<=240);
 assert.equal(first.index,null);
 assert.equal(pos.count,colors.count);
 assert.deepEqual([...pos.array],[...second.getAttribute('position').array]);
 assert.ok([...pos.array].every(Number.isFinite));
 assert.ok([...colors.array].every(v=>v>=0&&v<=1));
 assert.ok(first.boundingSphere.radius>0);
 first.dispose();second.dispose();
 const lod=buildCliffGeometry(args,height,1);
 assert.ok(lod.getAttribute('position').count<pos.count);lod.dispose();
});
test('cliff view streams nearest segments, rebuilds on edits and frees resources',()=>{
 const parent=new THREE.Group(),view=createCliffView(parent,height,42,terrain);
 assert.ok(view.stats.available>0);
 assert.equal(parent.children.length,1);
 for(let i=0;i<30;i++)view.update(0,0);
 assert.ok(view.stats.visible>0);
 assert.ok(view.stats.visible<=CLIFF_BUDGET.maxMeshes);
 assert.ok(view.stats.triangles>0);
 view.update(9999,9999);
 assert.equal(view.stats.visible,0);
 const previous=view.stats.disposed;
 view.refresh(terrain);view.update(0,0);
 assert.ok(view.stats.visible>0);
 view.invalidate();
 assert.equal(view.stats.visible,0); // statistics must reflect evicted meshes
 assert.ok(view.stats.disposed>previous);
 view.dispose();
 assert.equal(parent.children.length,0);
});
test('only rl-cliff ridges generate rock walls',()=>{
 const parent=new THREE.Group();
 const plain={...terrain,archipelago:{...terrain.archipelago,features:[{...ridge('rl-ridge-other')},{...ridge('rl-cliff-test')}] }};
 const view=createCliffView(parent,height,42,plain);
 assert.ok(view.stats.available>0);
 view.refresh({...terrain,archipelago:{...terrain.archipelago,features:[ridge('rl-ridge-not-cliff')]}});
 assert.equal(view.stats.available,0);
 view.dispose();
});

test('adjacent rock strips share boundary vertices without discontinuity',()=>{
 const a=buildCliffGeometry({a:{x:0,z:0},b:{x:12,z:0},widthM:12,seed:123,startM:0,endM:12},height,0);
 const b=buildCliffGeometry({a:{x:12,z:0},b:{x:24,z:0},widthM:12,seed:123,startM:12,endM:24},height,0);
 const seam=g=>{
  const positions=g.getAttribute('position'),out=new Set();
  for(let i=0;i<positions.count;i++)if(Math.abs(positions.getX(i)-12)<1e-5){
    out.add([positions.getY(i).toFixed(4),positions.getZ(i).toFixed(4)].join(':'));
  }
  return [...out].sort();
 };
 assert.ok(seam(a).length>=8);
 assert.deepEqual(seam(a),seam(b));
 a.dispose();b.dispose();
});
test('scree is integrated into the wall draw call and near LOD adds more detail',()=>{
 const args={a:{x:0,z:0},b:{x:15,z:0},widthM:10,seed:24};
 const fine=buildCliffGeometry(args,height,0),coarse=buildCliffGeometry(args,height,1);
 assert.ok(fine.getAttribute('position').count>coarse.getAttribute('position').count);
 assert.equal(fine.groups.length,0);
 assert.ok(fine.boundingBox.max.y>fine.boundingBox.min.y);
 fine.dispose();coarse.dispose();
});

test('geological colours agree at shared vertices across segment boundaries and LODs',()=>{
 const h=(x,z)=>6+24*Math.max(0,1-Math.abs(z)/9)**2;
 const args={widthM:9,seed:123};
 const a=buildCliffGeometry({...args,a:{x:0,z:0},b:{x:18,z:0},startM:0,endM:18},h,0);
 const b=buildCliffGeometry({...args,a:{x:18,z:0},b:{x:36,z:0},startM:18,endM:36},h,1);
 const seam=g=>{
  const p=g.getAttribute('position'),c=g.getAttribute('color'),out=new Map();
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-18)<1e-5){
   const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(4)).join(':');
   const value=[c.getX(i),c.getY(i),c.getZ(i)].map(v=>v.toFixed(6)).join(':');
   if(out.has(key))assert.equal(out.get(key),value,'one colour per shared point, not one random colour per triangle');
   out.set(key,value);
  }
  return [...out].sort(([a],[b])=>a.localeCompare(b));
 };
 assert.equal(seam(a).length,14);
 assert.deepEqual(seam(a),seam(b));
 for(const g of [a,b]){
  const c=g.getAttribute('color');assert.ok([...c.array].every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.equal(g.groups.length,0);assert.equal(g.getAttribute('uv'),undefined);
  g.dispose();
 }
});

test('vertical fractures retain the same column direction across geological bands',()=>{
 const h=(x,z)=>6+24*Math.max(0,1-Math.abs(z)/9)**2;
 const s={a:{x:0,z:0},b:{x:18,z:0},widthM:9,seed:52};
 const g=buildCliffGeometry(s,h,0),p=g.getAttribute('position');
 // At the middle station, the same column offset must keep its sign through the wall.
 // Stations still have seven bands; no added detail mesh or vertices.
 const z=[...new Set(Array.from({length:144},(_,i)=>i).filter(i=>Math.abs(p.getX(i)-9)<1e-5&&p.getZ(i)>0).map(i=>p.getZ(i)))].sort((a,b)=>a-b);
 assert.equal(z.length,7);
 const offsets=z.slice(1,-1).map((value,j)=>value-9*(.11+1.14*(j+1)/6));
 assert.ok(offsets.every(v=>v>0)||offsets.every(v=>v<0),'a coherent vertical rib, not alternating random bumps');
 assert.equal(p.count/3,66);
 assert.equal(Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0),7128);
 g.dispose();
});

test('vertex cavity shading darkens the foot without a light, texture or extra attribute',()=>{
 const g=buildCliffGeometry({a:{x:0,z:0},b:{x:18,z:0},widthM:9,seed:52},()=>6,0);
 const p=g.getAttribute('position'),c=g.getAttribute('color');
 const intensity=z=>{
  const i=Array.from({length:p.count},(_,i)=>i).find(i=>Math.abs(p.getX(i)-9)<1e-5&&Math.abs(p.getZ(i)-z)<1e-4);
  assert.notEqual(i,undefined);return c.getX(i)+c.getY(i)+c.getZ(i);
 };
 assert.ok(intensity(11.25)<intensity(.99)*.97,'subtle intrinsic foot shading on otherwise flat ground');
 assert.deepEqual(Object.keys(g.attributes).sort(),['color','normal','position']);
 g.dispose();
});
