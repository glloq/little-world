import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNaturalView,NATURAL_DRAW_BUDGET} from '../src/structures/natural-view.ts';
import {NATURAL_ASSET_ID,naturalPlan} from '../src/structures/natural-structure.ts';
const spec=naturalPlan({x:-6,z:0},{x:6,z:0},'arch',{width:6,clearance:4,thickness:1,curvature:1,form:'round'},()=>0).spec;
const placement=(id,x,z)=>({id,x,z,rotation:0,assetId:NATURAL_ASSET_ID,y:0,scale:1,naturalStructure:spec});
test('natural meshes are not allocated at all until the player approaches',()=>{
 const root=new THREE.Group(),view=createNaturalView(root,()=>0);
 view.add(placement('near',10,0));view.add(placement('far',1600,0));
 assert.equal(view.stats.registered,2);assert.equal(view.stats.visible,0);
 view.update(0,0);assert.equal(view.stats.visible,1);
 assert.equal(view.stats.triangles,132);assert.equal(view.stats.drawCalls,1);
 view.update(1500,0);assert.equal(view.stats.visible,1);
 view.update(2500,0);assert.equal(view.stats.visible,0);
 view.dispose();assert.equal(root.children.length,0);
});
test('natural view caps GPU draw calls under dense authored areas, independent of collision sources',()=>{
 const root=new THREE.Group(),view=createNaturalView(root,()=>0);
 for(let i=0;i<90;i++)view.add(placement('n'+i,i%10,(i/10)|0));
 view.update(0,0);
 assert.equal(view.stats.registered,90);
 assert.equal(view.stats.visible,NATURAL_DRAW_BUDGET.maxVisible);
 assert.ok(view.stats.drawCalls<=48&&view.stats.triangles<=48*132);
 const rebuilds=view.stats.rebuilds;
 view.update(0.5,0.5);assert.equal(view.stats.rebuilds,rebuilds);
 view.dispose();assert.equal(view.stats.visible,0);
 assert.equal(root.children.length,0);
});
