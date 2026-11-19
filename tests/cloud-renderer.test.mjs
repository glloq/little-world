import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeCloudGeometry} from '../src/environment/cloud-presets.ts';
import {createCloudRenderer} from '../src/environment/cloud-renderer.ts';

test('cloud silhouettes are opaque and bounded low-poly meshes',()=>{
 for(const variant of [0,1]){
  const geometry=makeCloudGeometry(variant);
  const tris=geometry.index?geometry.index.count/3:geometry.getAttribute('position').count/3;
  assert.equal(tris,variant===0?40:60);
  assert.ok(geometry.boundingSphere?.radius>0);
  geometry.dispose();
 }
});
test('3D cloud instances obey quality caps and never rebuild on a stationary camera',()=>{
 const scene=new THREE.Scene(),clouds=createCloudRenderer(scene,1284),position=new THREE.Vector3(0,50,0);
 const params={position,time:100,wind:.3,cloudCover:1,sunAltitude:.8,quality:'high',detail:0,underground:false,enabled:true};
 clouds.update(params);
 assert.ok(clouds.metrics.instances>0&&clouds.metrics.instances<=16);
 assert.ok(clouds.metrics.drawCalls<=2);
 const root=scene.getObjectByName('EnvironmentClouds3D');
 assert.ok(root);
 assert.equal(root.children.length,2);
 for(const child of root.children){
  assert.ok(child instanceof THREE.InstancedMesh);
  assert.equal(child.castShadow,false);
  assert.equal(child.receiveShadow,false);
  assert.equal(child.material.transparent,false);
 }
 const rebuilds=clouds.metrics.rebuilds;
 clouds.update({...params,time:101});
 assert.equal(clouds.metrics.rebuilds,rebuilds,'no instance-matrix uploads per frame');
 clouds.update({...params,quality:'medium'});
 assert.ok(clouds.metrics.instances<=8);
 clouds.update({...params,quality:'low'});
 assert.equal(clouds.metrics.instances,0);
 assert.equal(clouds.metrics.drawCalls,0);
 clouds.update({...params,quality:'high',detail:2});
 assert.equal(clouds.metrics.instances,0);
 clouds.update({...params,underground:true});
 assert.equal(clouds.metrics.instances,0);
 clouds.update({...params,enabled:false});
 assert.equal(clouds.metrics.instances,0);
 clouds.update({...params,position:new THREE.Vector3(500,50,100)});
 assert.ok(clouds.metrics.instances>0);
 clouds.dispose();
 clouds.dispose();
 assert.equal(scene.getObjectByName('EnvironmentClouds3D'),undefined);
});
