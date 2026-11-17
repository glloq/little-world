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

test('60 m/s glider uses swept collisions rather than skipping a thin obstacle',async()=>{
 const {simulatePlayer}=await import('../src/player.ts');
 const {WorldCollisionQuery}=await import('../src/physics/collision-world.ts');
 const world=new WorldCollisionQuery(()=>0,()=>null);
 world.add({id:'flight-wall',position:{x:0,y:0,z:8},size:{x:8,y:80,z:.03},shape:'box',enabled:()=>true});
 for(const speed of [34,60]){
  const p={position:new THREE.Vector3(0,35,0),velocity:new THREE.Vector3(0,0,speed),mode:'glide',oxygen:90,glideReady:true,gasReserve:150};
  const controls={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0,cameraPitch:0};
  for(let i=0;i<20;i++)simulatePlayer(p,controls,1/30,world);
  assert.ok(p.position.z<8,'wall collision failed at '+speed+'m/s, z='+p.position.z);
 }
});
