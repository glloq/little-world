import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {transformedCollider} from '../src/physics/definitions.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';
const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const actor=(x,y,z)=>({position:new THREE.Vector3(x,y,z),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false});
const body=(id,x,z,enabled=()=>true)=>({id,shape:'box',position:{x,y:0,z},size:{x:2,y:3,z:.2},enabled});
test('closed solid blocks a swept horizontal axis, slides along it and opens without changing render detail',()=>{
 const query=new WorldCollisionQuery(()=>0,()=>null);let open=false;query.add(body('door',0,0,()=>!open));const from={x:0,y:0,z:-3},to={x:1,y:0,z:3},hit=query.move(from,to);assert.equal(hit.blockedZ,true);assert.equal(hit.position.z,-.5);assert.equal(hit.position.x,1);
 open=true;assert.deepEqual(query.move(from,to).position,to);assert.equal(query.stats.bodies,1);query.remove('door');assert.equal(query.stats.cells,0);
});
test('stacked surfaces use zone, level and XYZ and never fall back to exterior terrain',()=>{
 const query=new WorldCollisionQuery(()=>50,()=>40);for(let level=0;level<3;level++)query.addLayer({id:'layer-'+level,zoneId:'mine',levelId:'level-'+level,minX:-10,maxX:10,minZ:-10,maxZ:10,floorY:-level*6,ceilingY:-level*6+3});
 for(let level=0;level<3;level++){const space={zoneId:'mine',levelId:'level-'+level},sample=query.surfaceAt({x:0,y:-level*6+.1,z:0},space);assert.equal(sample.floorY,-level*6);assert.equal(sample.ceilingY,-level*6+3);assert.equal(query.waterAt({x:0,y:-level*6,z:0},space),null);}
 assert.equal(query.surfaceAt({x:0,y:-100,z:0},{zoneId:'mine',levelId:'level-2'}).floorY,-12);
 assert.throws(()=>query.surfaceAt({x:0,y:-10,z:0},{zoneId:'mine',levelId:'missing'}));assert.equal(query.surfaceAt({x:0,y:70,z:0}).floorY,50);
});
test('player uses the same query for an underground floor and ceiling at 20/30 Hz',()=>{
 for(const hz of [20,30]){const query=new WorldCollisionQuery(()=>100,()=>50);query.addLayer({id:'lower',zoneId:'mine',levelId:'lower',minX:-20,maxX:20,minZ:-20,maxZ:20,floorY:-12,ceilingY:-9});const p=actor(0,-12,0);p.space={zoneId:'mine',levelId:'lower'};for(let i=0;i<hz;i++)simulatePlayer(p,{...keys,jumpPressed:i===0},1/hz,query);assert.equal(p.position.y,-12);assert.equal(p.mode,'ground');assert.equal(p.oxygen,MAX_OXYGEN);}
});
test('spatial membership moves atomically and huge colliders do not allocate a global cell matrix',()=>{
 const query=new WorldCollisionQuery(()=>0,()=>null);query.add(body('moving',0,0));query.moveBody('moving',{x:100,y:0,z:0});assert.equal(query.move({x:0,y:0,z:-3},{x:0,y:0,z:3}).blockedZ,false);assert.equal(query.move({x:100,y:0,z:-3},{x:100,y:0,z:3}).blockedZ,true);
 query.add({id:'huge',shape:'box',position:{x:0,y:0,z:0},size:{x:10000,y:2,z:10000},enabled:()=>true});assert.ok(query.stats.cells<10);assert.throws(()=>query.move({x:0,y:0,z:0},{x:9999,y:0,z:0}));
});
test('source rotation, offset and nonuniform scale derive conservative collider bounds without meshes',()=>{
 const q={x:0,y:Math.sin(Math.PI/4),z:0,w:Math.cos(Math.PI/4)},d=transformedCollider('rotated',{shape:'box',size:{x:2,y:3,z:4}},{position:{x:10,y:1,z:20},rotation:q,scale:{x:2,y:2,z:1}});assert.ok(Math.abs(d.size.x-4)<1e-8);assert.ok(Math.abs(d.size.z-4)<1e-8);assert.equal(d.size.y,6);assert.equal(d.position.y,1);assert.deepEqual(d.groundAnchor,{x:10,z:20});
});
