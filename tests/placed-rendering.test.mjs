import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlacedInstances,eligibleForInstancing,placedCullRadius} from '../src/world-production/placed-instances.ts';
import {worldAsset,lodDistances} from '../src/world-production/registry.ts';
const place=(id,x=0)=>({id,assetId:'architecture.house_blue',x,z:0,rotation:0});
const settle=async v=>{await new Promise(r=>setTimeout(r,0));for(let i=0;i<3&&v.stats.state==='loading';i++)v.update(0,0,{x:0,y:0,z:0});};
test('static houses share three existing LODs; animated buildings remain individual',async()=>{
 assert.ok(eligibleForInstancing('architecture.house_blue'));assert.equal(eligibleForInstancing('architecture.windmill_stone'),false);assert.equal(eligibleForInstancing('architecture.lighthouse'),false);assert.equal(placedCullRadius('architecture.house_blue',6),900);
 const gs=[0,1,2].map(()=>new THREE.BoxGeometry(2,2,2)),v=createPlacedInstances(new THREE.Group(),()=>0,async()=>gs);
 assert.equal(v.add({...place('mirrored'),scale3:[-1,1,1]}),false);
 for(let i=0;i<40;i++)v.add(place('house-'+i,i));await settle(v);v.update(0,0,{x:0,y:0,z:0});assert.equal(v.stats.lod0,40);assert.equal(v.stats.calls,1);
 const created=v.stats.instanceCreates;v.setOcclusion(()=>false);v.update(1,0,{x:0,y:0,z:0});assert.equal(v.stats.instanceCreates,created);assert.equal(v.stats.instanceDeletes,0,'unchanged visibility must not rebuild every instance');
 const far=lodDistances(worldAsset('architecture.house_blue'))[2]+50;v.update(0,0,{x:0,y:0,z:far});assert.equal(v.stats.lod2,40);
 v.update(0,0,{x:0,y:0,z:0});assert.equal(v.stats.lod0,40,'returning close restores detailed buildings');v.dispose();gs.forEach(g=>g.dispose());
});
test('failed static-building GLB retains a visible bounded placeholder',async()=>{
 const root=new THREE.Group(),v=createPlacedInstances(root,()=>0,async()=>null);v.add(place('missing'));await settle(v);v.update(0,0);assert.equal(v.stats.fallbacks,1);assert.ok(root.children.some(m=>m.name.startsWith('Placed loading')&&m.visible));v.update(2000,0);assert.ok(!root.children.some(m=>m.name.startsWith('Placed loading')&&m.visible));v.dispose();assert.equal(root.children.length,0);
});

test('parent culling encloses every LOD under rotations and nonuniform/mirrored scales',async()=>{
 const {assetInFrustum}=await import('../src/render/asset-culling.ts');const id='architecture.house_blue',a=worldAsset(id),object=new THREE.Group(),camera=new THREE.PerspectiveCamera(60,1,.1,2000);camera.position.set(0,15,0);camera.lookAt(0,15,-100);camera.updateMatrixWorld();const f=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 object.position.set(0,0,-100);object.rotation.y=.7;object.scale.set(-2,3,.5);assert.equal(assetInFrustum(id,object,f),true);object.position.x=900;assert.equal(assetInFrustum(id,object,f),false);object.userData.dynamicVisual=true;assert.equal(assetInFrustum(id,object,f),true);
 object.userData.dynamicVisual=false;
 for(let n=0;n<16;n++){object.position.set(-160+n*20,0,-100);object.rotation.y=n*.31;object.updateMatrix();for(const lod of a.lods)for(let c=0;c<8;c++){const v=new THREE.Vector3(...[0,1,2].map(k=>lod.bounds[(c>>k)&1?'max':'min'][k])).applyMatrix4(object.matrix);if(f.containsPoint(v))assert.equal(assetInFrustum(id,object,f),true,'no LOD corner inside the frustum may be clipped');}}
 assert.ok(a.lods.every(l=>l.bounds.min.length===3));
});

test('the third building batch does not duplicate rock geometry or reserve slots for small props',async()=>{
 const gs=[0,1,2].map(()=>new THREE.BoxGeometry(2,2,2)),root=new THREE.Group(),v=createPlacedInstances(root,()=>0,async()=>gs);v.add(place('house'));for(let i=0;i<50;i++)v.add({...place('rock-'+i,i),assetId:'nature.boulder_large'});await settle(v);assert.equal(v.stats.lod2Capacity,1);const far=root.children.find(m=>m.name==='Placed structures LOD2');assert.equal(far.geometry.getAttribute('position').count,gs[2].getAttribute('position').count);v.dispose();gs.forEach(g=>g.dispose());
});

test('GLB completion queues preparation; only one LOD batch is prepared per update',async()=>{
 const gs=[0,1,2].map(()=>new THREE.BoxGeometry(2,2,2)),root=new THREE.Group(),v=createPlacedInstances(root,()=>0,async()=>gs);v.add(place('house'));await new Promise(r=>setTimeout(r,0));assert.equal(root.children.filter(c=>c.isBatchedMesh).length,0);assert.equal(v.stats.pendingLevels,3);
 for(let i=1;i<=3;i++){v.update(0,0);assert.equal(v.stats.preparedThisUpdate,1);assert.equal(root.children.filter(c=>c.isBatchedMesh).length,i);}assert.equal(v.stats.state,'ready');v.dispose();gs.forEach(g=>g.dispose());
});
