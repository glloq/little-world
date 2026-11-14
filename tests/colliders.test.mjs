import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {colliderFor} from '../src/world-production/registry.ts';
import {createTreeColliders,trunkSize} from '../src/gameplay/tree-colliders.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';
import {transformedCollider} from '../src/physics/definitions.ts';
import {ITEM_STRIDE,DRESSING_KINDS} from '../src/geography/dressing.ts';

const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const actor=(x,z)=>({position:new THREE.Vector3(x,0,z),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false,body:{radius:.32,height:1.35,step:.4},climbCooldown:1e9});
const walk=(p,q,s)=>{for(let i=0;i<s*30;i++)simulatePlayer(p,{...keys,forward:1},1/30,q);return p;};

test('H3 colliders from the registry: buildings by footprint, props by box, trees by trunk, boats/docks none',()=>{
  const house=colliderFor('architecture.house_timber');assert.ok(house&&house.size.x>5&&house.size.y>7,'house footprint');
  assert.ok(colliderFor('structure.barrel').size.x<1);assert.ok(colliderFor('landmark.world_tree').size.x<6,'world tree: trunk, not canopy');
  assert.equal(colliderFor('boat.rowboat_wood'),null);assert.equal(colliderFor('structure.dock_tile'),null);assert.equal(colliderFor('nature.fern_small'),null);
});
test('H3 a house collider stops the player; walking around it is possible',()=>{
  const q=new WorldCollisionQuery(()=>0,()=>null),c=colliderFor('architecture.house_timber');
  const d=transformedCollider('house',c,{position:{x:0,y:0,z:8},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}});
  q.add({id:'house',shape:'box',position:d.position,size:d.size,enabled:()=>true});
  const p=walk(actor(0,0),q,3);assert.ok(p.position.z<8-c.size.z/2,'blocked in front of the house at z '+p.position.z.toFixed(2));
  const side=walk(actor(c.size.x,0),q,3);assert.ok(side.position.z>12,'beside the house the path is free');
});
test('H3 tree trunks around the player block until the tree is felled',()=>{
  const items=Object.fromEntries(DRESSING_KINDS.map(k=>[k,new Float32Array(0)]));items.oak=new Float32Array([0,0,6,1.5,0,0,-1]);
  const cell={cx:0,cz:0,items,count:1,ms:0},empty={cx:0,cz:0,items:Object.fromEntries(DRESSING_KINDS.map(k=>[k,new Float32Array(0)])),count:0,ms:0};
  let felled=false;const q=new WorldCollisionQuery(()=>0,()=>null);
  const trees=createTreeColliders({collision:q,cell:(cx,cz)=>cx===0&&cz===0?cell:empty,hidden:()=>felled});trees.update({x:.5,z:0});
  assert.equal(trees.count,1);const s=trunkSize(1.5);
  const p=walk(actor(0,0),q,2);assert.ok(p.position.z<6-s.z/2,'trunk blocks at '+p.position.z.toFixed(2));
  felled=true;const r=walk(actor(0,0),q,2);assert.ok(r.position.z>8,'felled tree no longer blocks');
  trees.update({x:300,z:0});assert.equal(trees.count,0,'trunks far from the player are released');
  assert.equal(items.oak.length/ITEM_STRIDE,1);
});
