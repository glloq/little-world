import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGrass,grassProfileFor,tuftGeometry,GRASS_PROFILES} from '../src/render/grass.ts';

const meadow=()=>({share:1,tall:.4,color:0x7da558});
const build=(profile,sampler=meadow,height=()=>2)=>{const g=createGrass(new THREE.Group(),42,sampler,height);g.setProfile(profile);for(let i=0;i<40;i++)g.update(1/30,{x:5,y:2,z:5},50);return g;};

test('GRASS — a tuft is 3 opaque blades (3 triangles), one InstancedMesh, no shadows',()=>{
  const geo=tuftGeometry();assert.equal(geo.getAttribute('position').count/3,3);
  const g=build('balanced');assert.ok(g.mesh.isInstancedMesh);assert.equal(g.mesh.castShadow||g.mesh.receiveShadow,false);
  assert.equal(g.mesh.material.transparent,false);assert.equal(g.stats.calls,1);assert.equal(g.stats.triangles,g.stats.tufts*3);
});
test('GRASS — deterministic per cell (seed + position), stable when the player comes back',()=>{
  const a=build('balanced'),b=build('balanced');assert.ok(a.stats.tufts>500,'tufts: '+a.stats.tufts);
  assert.deepEqual(Array.from(a.mesh.instanceMatrix.array.slice(0,a.stats.tufts*16)),Array.from(b.mesh.instanceMatrix.array.slice(0,b.stats.tufts*16)));
  const before=Array.from(a.mesh.instanceMatrix.array.slice(0,16));for(let i=0;i<20;i++)a.update(1/30,{x:300,y:2,z:300},50);for(let i=0;i<20;i++)a.update(1/30,{x:5,y:2,z:5},50);
  const tufts=[];for(let i=0;i<a.stats.tufts;i++)tufts.push(Array.from(a.mesh.instanceMatrix.array.slice(i*16,i*16+16)).join());assert.ok(tufts.includes(before.join()),'same tufts after a round trip');
});
test('GRASS — profiles follow the budget level: dense > balanced > ultra > groundOnly (0)',()=>{
  assert.deepEqual([0,1,2,3].map(l=>grassProfileFor(l)),['dense','balanced','ultra','groundOnly']);assert.equal(grassProfileFor(0,true),'balanced','economy quality one step lower');
  const n=Object.fromEntries(['dense','balanced','ultra','groundOnly'].map(p=>[p,build(p).stats.tufts]));
  assert.ok(n.dense>n.balanced&&n.balanced>n.ultra&&n.ultra>0&&n.groundOnly===0,JSON.stringify(n));
  const off=build('groundOnly');assert.equal(off.mesh.visible,false);assert.equal(off.stats.calls,0);
});
test('GRASS — nothing grows where the sampler says no (roads, water, rock), tufts sit on the ground',()=>{
  const road=build('balanced',(x,z)=>x<0?null:meadow());
  for(let i=0;i<road.stats.tufts;i++){const e=road.mesh.instanceMatrix.array;assert.ok(e[i*16+12]>=-2,'no tuft on the road side: x '+e[i*16+12]);assert.ok(Math.abs(e[i*16+13]-(2-.03))<1e-5,'rooted on the ground');}
  const none=build('balanced',()=>null);assert.equal(none.stats.tufts,0);
  const sparse=build('balanced',()=>({share:.2,tall:.1,color:0x8a9a5a})),full=build('balanced');assert.ok(sparse.stats.tufts<full.stats.tufts*.35,'density follows the grass share');
});
test('GRASS — no per-frame CPU work once built: the instance buffer is not rewritten while standing',()=>{
  const g=build('balanced');const v=g.mesh.instanceMatrix.version;for(let i=0;i<60;i++)g.update(1/30,{x:5.5,y:2,z:5.2},50);
  assert.equal(g.mesh.instanceMatrix.version,v,'only uniforms change (wind, player) — vertex shader');
  assert.ok(GRASS_PROFILES.dense.radius<=45,'grass stays local (doc 18)');g.dispose();
});
test('GRASS — projected subpixel tufts stop preparing at altitude and recover on landing',()=>{
 const g=build('balanced'),view={position:{x:5,y:900,z:5},fov:60,height:640};
 for(let i=0;i<60;i++)g.update(1/30,{x:5,y:900,z:5},50,view);
 assert.equal(g.stats.tufts,0);assert.equal(g.stats.pending,0);assert.equal(g.stats.visibleScale,0);assert.equal(g.stats.actors,0);
 const generated=g.stats.generatedCells;g.update(1/30,{x:500,y:900,z:500},50,view);assert.equal(g.stats.generatedCells,generated);
 view.position.y=4;for(let i=0;i<40;i++)g.update(1/30,{x:5,y:2,z:5},50,view);
 assert.ok(g.stats.tufts>0);assert.equal(g.stats.visibleScale,1);g.dispose();
});
test('GRASS — low detached camera prepares its own cells; actors remain separate and bounded',()=>{
 const g=build('balanced'),view={position:{x:200,y:4,z:200},fov:60,height:640};
 for(let i=0;i<40;i++)g.update(1/30,{x:0,y:2,z:0},50,view,[{x:201,y:2,z:201},{x:800,y:2,z:800}]);
 assert.ok(g.mesh.instanceMatrix.array[12]>150);assert.equal(g.stats.actors,1);
 g.update(1/30,{x:200,y:2,z:200},50,view,[{x:201,y:2,z:201},{x:202,y:2,z:202}]);assert.equal(g.stats.actors,2);
 g.setProfile('ultra');g.update(1/30,{x:200,y:2,z:200},50,view,[{x:201,y:2,z:201}]);assert.equal(g.stats.actors,1);g.dispose();
});
test('GRASS — two cells maximum per update, exact exclusion edges and local refresh preserve distant cells',()=>{
 const sampler=(x,z)=>x<1.3?null:meadow(),g=createGrass(new THREE.Group(),42,sampler,()=>2,24000,true);g.setProfile('balanced');
 g.update(1/30,{x:5,y:2,z:5},50);assert.ok(g.stats.generatedCells<=2);assert.ok(g.stats.tufts>0,'partial preparation already visible');
 for(let i=0;i<40;i++)g.update(1/30,{x:5,y:2,z:5},50);
 for(let i=0;i<g.stats.tufts;i++)assert.ok(g.mesh.instanceMatrix.array[i*16+12]>=1.3,'no 4 m grid spill');
 const before=g.stats.generatedCells;g.refresh(0,0,1);for(let i=0;i<40;i++)g.update(1/30,{x:5,y:2,z:5},50);
 assert.ok(g.stats.generatedCells-before<before,'only nearby cells rebuilt');assert.ok(g.stats.bytes<5*1024*1024);g.dispose();
});
