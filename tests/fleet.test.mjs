import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';
import {createFleet} from '../src/gameplay/fleet.ts';
import {colliderFor} from '../src/world-production/registry.ts';

const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const actor=(x,z,y)=>({position:new THREE.Vector3(x,y,z),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false,body:{radius:.32,height:1.35,step:.4},climbCooldown:1e9});
// Beach (z < 0, 0.5 m above the sea) then sea 1.5 m deep (z ≥ 0), water level 0.
const ground=(x,z)=>z<0?.5:-1.5,water=(x,z)=>z<0?null:0;

test('Docks: a dock tile is a walkable deck; the hamster walks from the beach onto it without swimming',()=>{
  const c=colliderFor('structure.dock_tile');assert.ok(c,'dock tiles have a collider now');assert.ok(c.size.x>=1.9&&c.size.z>=1.9,'full footprint (no gap between 2 m tiles)');
  const q=new WorldCollisionQuery(ground,water);
  // Tiles every 2 m from the beach out to sea, deck top ≈ 0.45 m above the water (as on the island).
  for(let i=0;i<10;i++){const z=-1+2*i,base=z<0?.5:.2;q.add({id:'tile'+i,shape:'box',position:{x:0,y:base,z},size:c.size,enabled:()=>true});}
  const p=actor(0,-6,.5);for(let i=0;i<150;i++)simulatePlayer(p,{...keys,forward:1},1/30,q);
  assert.ok(p.position.z>12,'reached the end of the dock: z '+p.position.z.toFixed(1));
  assert.equal(p.mode,'ground','walking on the deck, not swimming');assert.ok(p.position.y>.4,'on the deck: y '+p.position.y.toFixed(2));
});

test('Fleet: moored boats are solid, boardable, their collider follows them and is off while aboard',()=>{
  const q=new WorldCollisionQuery(ground,water),fleet=createFleet(q);
  const obj=new THREE.Group();obj.position.set(5,-.1,10);obj.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),.3);obj.scale.setScalar(1.2);
  const b=fleet.addMoored('row-1','boat.rowboat_wood',obj,0,[5.95,1.29,3.69]);
  assert.ok(Math.abs(b.state.heading-(.3+Math.PI/2))<1e-6,'rowboat heading from its long X axis');
  // Solid: a swimmer cannot cross the hull.
  const s=actor(5,4,-.3);s.mode='swim';for(let i=0;i<120;i++)simulatePlayer(s,{...keys,forward:1},1/30,q);
  assert.ok(s.position.z<10-1,'the hull blocks the swimmer: z '+s.position.z.toFixed(2));
  assert.equal(fleet.nearest(5,0,7),b,'boardable from 3 m');assert.equal(fleet.nearest(40,0,40),null);
  fleet.board(b);assert.ok(q.surfaceAt({x:5,y:2,z:10},undefined,.3).floorY<0,'collider off while aboard');
  b.state.x=30;b.state.z=30;fleet.leave();
  assert.ok(q.surfaceAt({x:30,y:2,z:30},undefined,.3).floorY>0,'collider moved with the boat');
  assert.ok(q.surfaceAt({x:5,y:2,z:10},undefined,.3).floorY<0,'nothing left at the old mooring');
  fleet.sync(b,0);assert.ok(Math.abs(obj.position.x-30)<1e-9&&Math.abs(obj.rotation.y-(b.state.heading-Math.PI/2))<1e-9,'model follows the state');
});
