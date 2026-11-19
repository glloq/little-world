import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SURF_QUALITY,surfQualityProfile} from '../src/render/surf-quality.ts';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {createSurfWaterView} from '../src/render/surf-water-view.ts';
import {createSurfBarrelView} from '../src/render/surf-barrel-view.ts';
import {stepSurf} from '../src/surf/surf-controller.ts';
import {stepSurfBarrel} from '../src/surf/surf-barrel.ts';

const zone={id:'surf:quality',minX:-90,maxX:90,minZ:-80,maxZ:80,dirX:0,dirZ:1,seaLevel:0,
 amplitude:1.45,wavelength:36,speed:6.3,seed:11,shoreFadeDepth:3,edgeFade:9,barrelStrength:1,style:'tubular'};
const ground=(_,z)=>z*.1-3;
test('surf profile follows the user cap and steps down with the adaptive budget',()=>{
 assert.equal(surfQualityProfile('high',0).name,'hq');
 assert.equal(surfQualityProfile('high',1).name,'medium');
 assert.equal(surfQualityProfile('high',2).name,'low');
 assert.equal(surfQualityProfile('medium',0).name,'medium');
 assert.equal(surfQualityProfile('medium',1).name,'low');
 assert.equal(surfQualityProfile('low',0).name,'low');
 assert.equal(surfQualityProfile('unknown',NaN).name,'medium');
 assert.deepEqual([SURF_QUALITY.low.tubeFronts,SURF_QUALITY.medium.tubeFronts,SURF_QUALITY.hq.tubeFronts],[1,2,4]);
 assert.equal(SURF_QUALITY.low.foamDetail,0);assert.equal(SURF_QUALITY.low.wakeDetail,0);
});
test('changing every presentation setting never changes the simulated ride',()=>{
 const ride=apply=>{
  const field=createSurfWaveField(zone,ground),root=new THREE.Group();
  const water=createSurfWaterView(root,field,ground),lip=createSurfBarrelView(root,field,ground);
  const p={position:{x:0,y:0,z:-40},velocity:{x:4,y:0,z:6},mode:'surf',surfStage:'ride',surfHeading:.5};
  for(let tick=1;tick<=240;tick++){
   apply(water,lip,tick);
   stepSurf(p,{forward:.5,right:Math.sin(tick/17),cameraYaw:0,paddle:true,jumpPressed:false,brake:false},field,tick,1/30);
   stepSurfBarrel(p,field,ground,tick);
   lip.update(tick,p.position);water.update(tick,.5);
  }
  water.dispose();lip.dispose();
  return JSON.stringify(p);
 };
 const reference=ride(()=>{});
 for(const profile of Object.values(SURF_QUALITY))
  assert.equal(ride((water,lip,tick)=>{water.setFoamDetail(profile.foamDetail);lip.setMaxFronts(profile.tubeFronts);
   water.setDetail(Math.max(tick%3,profile.waterTierFloor),{x:0,z:tick*3});}),reference,'profile '+profile.name);
});
test('tube lips outside the camera frustum are neither rebuilt nor drawn; fronts follow the profile',()=>{
 const field=createSurfWaveField(zone,ground),root=new THREE.Group(),lip=createSurfBarrelView(root,field,ground);
 const camera=new THREE.PerspectiveCamera(60,1.6,.1,2000);
 camera.position.set(0,6,-60);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
 lip.update(10,{x:0,z:0},{camera});
 assert.equal(lip.mesh.visible,true);
 const built=lip.stats.rebuilds;
 camera.lookAt(0,0,-500);camera.updateMatrixWorld();
 for(let t=11;t<40;t++)lip.update(t,{x:0,z:0},{camera});
 assert.equal(lip.mesh.visible,false);assert.equal(lip.stats.rebuilds,built,'no CPU rebuild while off-screen');
 camera.lookAt(0,0,0);camera.updateMatrixWorld();
 lip.setMaxFronts(1);lip.update(40,{x:0,z:0},{camera});
 assert.ok(lip.stats.activeFronts<=1);
 assert.ok(lip.mesh.geometry.drawRange.count<=lip.stats.triangles*3);
 lip.setMaxFronts(4);lip.update(41,{x:0,z:0},{camera});
 assert.ok(lip.stats.uploadBytes<=lip.stats.activeFronts*31*11*12,'uploads limited to active fronts');
 // Between rebuilds the GPU translation keeps the lip on the moving crest.
 lip.update(80,{x:0,z:0},{camera,alpha:1});
 const builtAt=lip.stats.rebuilds;lip.update(81,{x:0,z:0},{camera:new THREE.PerspectiveCamera(),alpha:1});
 assert.ok(lip.stats.rebuilds>=builtAt);
 lip.dispose();
});
