import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldCollisionQuery,DEFAULT_BODY} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';

const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const actor=(x,y,z)=>({position:new THREE.Vector3(x,y,z),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false});
const box=(id,x,z,sx,sy,sz,y=0)=>({id,shape:'box',position:{x,y,z},size:{x:sx,y:sy,z:sz},enabled:()=>true});
/** Walk toward +Z (camera yaw 0) for `seconds` at `hz`. */
function walk(p,query,seconds,hz=30,extra={}){for(let i=0;i<Math.round(seconds*hz);i++)simulatePlayer(p,{...keys,forward:1,...extra},1/hz,query);return p;}
/** Tiny occupancy grid standing in for a mine level (the real adapter is tested with the mine). */
function gridProvider(levels){
  return {floor:id=>levels[id].floorY,
    column(id,x,z){const l=levels[id],cx=Math.floor(x),cz=Math.floor(z);return l.open.has(cx+':'+cz)?{floorY:l.floorY,ceilingY:l.floorY+l.height}:null;},
    solids(id,minX,maxX,minZ,maxZ,out){const l=levels[id];for(let cx=Math.floor(minX);cx<=Math.floor(maxX);cx++)for(let cz=Math.floor(minZ);cz<=Math.floor(maxZ);cz++)if(!l.open.has(cx+':'+cz))out.push({minX:cx,maxX:cx+1,minZ:cz,maxZ:cz+1,minY:-1e5,maxY:1e5});}};
}
const corridor=(x0,x1,z0,z1)=>{const s=new Set();for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)s.add(x+':'+z);return s;};

test('PHYS 1 — walks on irregular relief and stays on the ground',()=>{
  const h=(x,z)=>Math.sin(z*.3)*.8+Math.cos(x*.2)*.5,q=new WorldCollisionQuery(h,()=>null),p=walk(actor(0,h(0,0),0),q,3);
  assert.ok(p.position.z>12,'moved '+p.position.z);assert.equal(p.mode,'ground');assert.ok(Math.abs(p.position.y-h(p.position.x,p.position.z))<.08);
});
test('PHYS 2/3/4 — small step climbed, tall block stops, wall slides, low ceiling refused, high one passed',()=>{
  const q=new WorldCollisionQuery(()=>0,()=>null);q.add(box('step',0,3,4,.3,1));
  const p=walk(actor(0,0,0),q,1.2);assert.ok(p.position.z>3,'crossed the 0.3 m step');
  const q2=new WorldCollisionQuery(()=>0,()=>null);q2.add(box('block',0,3,4,.8,1));
  const b=walk(actor(0,0,0),q2,1.5);assert.ok(Math.abs(b.position.z-(2.5-DEFAULT_BODY.radius))<1e-6,'stopped against the 0.8 m block at '+b.position.z);
  // Diagonal input against a wall: slides along X.
  const q3=new WorldCollisionQuery(()=>0,()=>null);q3.add(box('wall',0,3,40,3,.4));
  const s=walk(actor(0,0,0),q3,2,30,{right:1});assert.ok(s.position.z<=2.8-DEFAULT_BODY.radius+1e-9);assert.ok(Math.abs(s.position.x)>3,'slid along the wall '+s.position.x);
  const low=new WorldCollisionQuery(()=>0,()=>null);low.add(box('beam',0,3,4,1,1,1.5));assert.ok(walk(actor(0,0,0),low,1.5).position.z<2.5,'1.5 m beam blocks a 1.8 m body');
  const high=new WorldCollisionQuery(()=>0,()=>null);high.add(box('bridge',0,3,4,1,1,2));const under=walk(actor(0,0,0),high,1.5);assert.ok(under.position.z>4&&Math.abs(under.position.y)<1e-9,'walks under a 2 m bridge');
  const small=walk(Object.assign(actor(0,0,0),{body:{height:1.2}}),low,1.5);assert.ok(small.position.z>4,'a 1.2 m body passes under the beam');
});
test('PHYS — slopes above the limit cannot be climbed, gentle ones can; descent is free',()=>{
  const cliff=(x,z)=>z>5?(z-5)*2.5:0,q=new WorldCollisionQuery(cliff,()=>null),p=walk(actor(0,0,0),q,3);assert.ok(p.position.z<5.3&&p.position.y<.8,'stopped at the cliff foot '+p.position.z);
  const hill=(x,z)=>z>5?(z-5)*.6:0,g=walk(actor(0,0,0),new WorldCollisionQuery(hill,()=>null),3);assert.ok(g.position.z>9,'climbs a 31° slope');
  const down=walk(actor(0,cliff(0,8),8),q,1,30,{forward:-1});assert.ok(down.position.z<6,'goes down the cliff');
});
test('PHYS — continuous sweep: no tunnelling through a thin wall at any speed or frame rate',()=>{
  for(const hz of [10,20,30,60]){
    const q=new WorldCollisionQuery(()=>0,()=>null);q.add(box('thin',0,5,10,3,.05));const p=actor(0,0,0);
    for(let i=0;i<hz*2;i++){p.velocity.set(0,0,60);p.mode='glide';simulatePlayer(p,{...keys,forward:1},1/hz,q);}
    assert.ok(p.position.z<5,'blocked at '+hz+' Hz: '+p.position.z);
  }
});
test('PHYS — a moving obstacle pushes the body out instead of trapping it',()=>{
  const q=new WorldCollisionQuery(()=>0,()=>null);q.add(box('cart',5,0,2,1.5,2));const p=actor(0,0,0);simulatePlayer(p,keys,1/30,q);
  q.moveBody('cart',{x:.5,y:0,z:0});simulatePlayer(p,keys,1/30,q);assert.ok(p.position.x<=-.5-DEFAULT_BODY.radius+1e-9,'pushed out to '+p.position.x);
});
test('PHYS 5/6/7/8 — enters an underground space, uses several levels, never snaps to the surface, comes back',()=>{
  const surface=()=>20,q=new WorldCollisionQuery(surface,()=>null);
  q.setSpaceProvider('mine',gridProvider({l0:{floorY:10,height:3.5,open:corridor(-1,1,0,12)},l1:{floorY:4,height:3.5,open:corridor(-1,1,0,12)}}));
  q.addTransition({id:'mine:entry',from:null,to:{zoneId:'mine',levelId:'l0'},minX:-1,maxX:1,minZ:-6,maxZ:-5,minY:15,maxY:25,arrival:{x:0,y:10,z:1}});
  q.addTransition({id:'mine:down',from:{zoneId:'mine',levelId:'l0'},to:{zoneId:'mine',levelId:'l1'},minX:-1,maxX:1,minZ:10,maxZ:11,minY:5,maxY:15,arrival:{x:0,y:4,z:8}});
  q.addTransition({id:'mine:up',from:{zoneId:'mine',levelId:'l1'},to:{zoneId:'mine',levelId:'l0'},minX:-1,maxX:1,minZ:0,maxZ:1,minY:0,maxY:8,arrival:{x:0,y:10,z:3}});
  q.addTransition({id:'mine:exit',from:{zoneId:'mine',levelId:'l0'},to:null,minX:-1,maxX:1,minZ:0,maxZ:.5,minY:5,maxY:15,arrival:{x:0,y:20,z:-8}});
  const p=walk(actor(0,20,-9),q,1);assert.deepEqual(p.space,{zoneId:'mine',levelId:'l0'},'entered through the portal');assert.equal(p.position.y,10);
  walk(p,q,4);assert.deepEqual(p.space,{zoneId:'mine',levelId:'l1'},'took the stairs down');assert.equal(p.position.y,4);
  for(let i=0;i<30;i++){simulatePlayer(p,{...keys,forward:1},1/30,q);assert.ok(Math.abs(p.position.y-4)<1e-9,'never snapped to the surface (20 m) or the upper level');}
  assert.ok(p.position.z<=12+1-DEFAULT_BODY.radius+1e-9,'rock at the end of the gallery blocks');
  const jump=actor(0,4,6);jump.space={zoneId:'mine',levelId:'l1'};simulatePlayer(jump,{...keys,jumpPressed:true},1/30,q);for(let i=0;i<30;i++){simulatePlayer(jump,keys,1/30,q);assert.ok(jump.position.y+DEFAULT_BODY.height<=7.5+1e-9,'ceiling holds');}
  const crossed=[];for(let i=0;i<300&&p.space;i++){simulatePlayer(p,{...keys,forward:-1},1/30,q);if(p.transitioned)crossed.push(p.transitioned);}
  assert.deepEqual(crossed,['mine:up','mine:exit'],'stairs up, then the exit, each crossed once');
  assert.equal(p.space,undefined,'back on the surface');assert.equal(p.position.y,20);
});
test('PHYS — same trajectory at 20, 30 and 60 Hz (step, wall slide, landing on a block)',()=>{
  const run=hz=>{const q=new WorldCollisionQuery(()=>0,()=>null);q.add(box('step',0,3,6,.3,1));q.add(box('wall',3,8,1,3,10));q.add(box('crate',-1,10,3,1,2));const p=actor(0,0,0);
    for(let i=0;i<hz*4;i++)simulatePlayer(p,{...keys,forward:1,right:-.4,jumpPressed:i===Math.round(hz*1.8)},1/hz,q);return p.position;};
  const a=run(20),b=run(30),c=run(60);for(const v of [a,c]){assert.ok(Math.hypot(v.x-b.x,v.z-b.z)<.35,`${JSON.stringify(v)} vs ${JSON.stringify(b)}`);assert.ok(Math.abs(v.y-b.y)<.05);}
});
