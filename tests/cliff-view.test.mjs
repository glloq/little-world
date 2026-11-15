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
 assert.ok(pos.count>0&&pos.count<150);
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
