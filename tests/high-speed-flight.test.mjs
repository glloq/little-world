import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {advanceSpeedCamera,speedCameraState,createSpeedStreaks} from '../src/render/speed-effects.ts';
test('speed camera approaches wide FOV and extra chase distance without exceeding the cap',()=>{
 const s=speedCameraState();
 for(let i=0;i<120;i++)advanceSpeedCamera(s,{speed:34,mode:'glide',boosting:true,turnRate:1,enabled:true},1/30);
 assert.ok(s.fov>75&&s.fov<=77.00001);
 assert.ok(s.extraDistance>3&&s.extraDistance<3.61);
 assert.ok(s.bank>0&&s.bank<=.075);
 for(let i=0;i<300;i++)advanceSpeedCamera(s,{speed:34,mode:'glide',boosting:true,turnRate:1,enabled:false},1/30);
 assert.ok(Math.abs(s.fov-66)<.001);
 assert.ok(Math.abs(s.extraDistance)<.001);
 assert.ok(Math.abs(s.bank)<.001);
});
test('wind lines are a fixed GPU pool and stay invisible without flight or speed preference',()=>{
 const camera=new THREE.PerspectiveCamera(66,1,0.1,750),fx=createSpeedStreaks(camera);
 assert.equal(camera.children.length,1);
 const mesh=camera.children[0];assert.ok(mesh.isInstancedMesh);
 assert.equal(mesh.count,0);
 fx.update(34,true,true,1/30);assert.ok(mesh.count>0&&mesh.count<=12);
 fx.update(34,false,true,1/30);assert.equal(mesh.count,0);
 fx.update(34,true,false,1/30);assert.equal(mesh.count,0);
 fx.dispose();assert.equal(camera.children.length,0);
});
