import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sunDirection,applySkyLighting} from '../src/environment/sky-lighting.ts';
import {createSkyRenderer} from '../src/environment/sky-renderer.ts';

test('visible sun direction matches existing directional sunlight at every phase',()=>{
  const lighting={
    sun:new THREE.DirectionalLight(),
    fill:new THREE.DirectionalLight(),
    ambient:new THREE.HemisphereLight(),
  }, background=new THREE.Color();
  const angles=[0,.125,.25,.5,.75,.875,1];
  for(const phase of angles){
    const altitude=Math.sin(2*Math.PI*(phase-.25));
    applySkyLighting(lighting,background,altitude,phase,.25);
    const expected=lighting.sun.position.clone().normalize();
    assert.ok(expected.distanceTo(sunDirection(phase,altitude))<1e-12, 'sun angle must equal the actual light');
  }
});

test('sky renderer reuses one mesh and texture, follows camera, and disposes cleanly',()=>{
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(70,1.6,.1,800);
  camera.position.set(45,120,-80);
  const sky=createSkyRenderer(scene,camera,1284);
  const mesh=scene.getObjectByName('EnvironmentSky');
  assert.ok(mesh instanceof THREE.Mesh);
  assert.equal(sky.metrics.skyDrawCalls,1);
  assert.equal(sky.metrics.skyTextureBytes,128*128*4);
  const atlas=mesh.material.uniforms.atlas.value;
  const params={
    color:new THREE.Color('#cce6e2'),
    sunDirection:new THREE.Vector3(0,1,0),
    sunAltitude:1,cloudCover:.5,wind:.2,time:150,
    detail:0,underground:false,
  };
  sky.update(params);
  assert.ok(mesh.position.distanceTo(camera.position)<1e-12);
  assert.equal(sky.metrics.clouds2d,true);
  assert.equal(sky.metrics.visualCloudCover,.5);
  sky.update({...params,cloudCover:1,deltaSeconds:1/30});
  assert.ok(sky.metrics.visualCloudCover>.5&&sky.metrics.visualCloudCover<.51,'visual cover changes gradually');
  assert.equal(mesh.material.uniforms.cloudCover.value,sky.metrics.visualCloudCover);
  sky.update({...params,quality:'high',detail:0});
  assert.ok(sky.metrics.clouds3d>0&&sky.metrics.clouds3d<=16);
  assert.ok(sky.metrics.clouds3dDrawCalls<=2);
  sky.update({...params,quality:'low'});
  assert.equal(sky.metrics.clouds3d,0);
  sky.update({...params,detail:2});
  assert.equal(sky.metrics.clouds2d,false);
  sky.update({...params,detail:0,underground:true});
  assert.equal(sky.metrics.visible,false);
  assert.equal(sky.metrics.skyDrawCalls,0);
  sky.update(params);
  assert.equal(sky.metrics.visible,true);
  assert.equal(scene.children.filter(v=>v.name==='EnvironmentSky').length,1);
  assert.strictEqual(mesh.material.uniforms.atlas.value,atlas);
  sky.dispose();
  assert.equal(scene.getObjectByName('EnvironmentSky'),undefined);
});
