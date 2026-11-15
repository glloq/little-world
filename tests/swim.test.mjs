import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN,SWIM} from '../src/player.ts';

const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0,cameraPitch:0};
// Open water 6 m deep, surface at 0.
const sea=()=>new WorldCollisionQuery(()=>-6,()=>0);
const actor=(y=.3)=>({position:new THREE.Vector3(0,y,0),velocity:new THREE.Vector3(),mode:'air',oxygen:MAX_OXYGEN,glideReady:false,body:{radius:.32,height:1.35,step:.4},climbCooldown:1e9});
const run=(p,q,s,k={})=>{for(let i=0;i<Math.round(s*30);i++)simulatePlayer(p,{...keys,...k},1/30,q);return p;};
const press=(p,q,k={})=>simulatePlayer(p,{...keys,...k,jumpPressed:true},1/30,q);

test('SWIM — the hamster swims IN the water: body centre at the water line, head out (not standing on it)',()=>{
  const q=sea(),p=run(actor(),q,2);
  assert.equal(p.mode,'swim');assert.ok(Math.abs(p.position.y-(-SWIM.sink))<.08,'feet '+SWIM.sink+' m under the surface: y '+p.position.y.toFixed(2));
  run(p,q,2,{forward:1});assert.equal(p.mode,'swim');assert.ok(Math.abs(p.position.y+SWIM.sink)<.08,'stays on the swimming line while moving');
  assert.ok(Math.hypot(p.position.x,p.position.z)>4,'swims forward');
});
test('SWIM — Space dives (once), Space again comes back up to the surface',()=>{
  const q=sea(),p=run(actor(),q,1.5);
  press(p,q);run(p,q,1.2);assert.equal(p.diving,true);assert.equal(p.mode,'dive','under water after Space');const y=p.position.y;assert.ok(y<-SWIM.sink-.35);
  run(p,q,2);assert.ok(Math.abs(p.position.y-y)<.6,'neutral: no automatic resurfacing while diving');assert.ok(p.oxygen<MAX_OXYGEN,'oxygen used');
  press(p,q);run(p,q,2.5);assert.equal(p.diving,false);assert.equal(p.mode,'swim','second Space: back at the surface');assert.ok(p.position.y>-SWIM.sink-.15);
});
test('SWIM — under water, forward follows the camera: looking down dives down, looking up rises (and surfaces)',()=>{
  const q=sea(),p=run(actor(),q,1.5);press(p,q);run(p,q,.6);const y0=p.position.y;
  run(p,q,1.5,{forward:1,cameraPitch:.8});assert.ok(p.position.y<y0-1.5,'camera down + forward: dives deeper ('+(p.position.y-y0).toFixed(2)+' m)');
  const level=run(actor(),q,1.5);press(level,q);run(level,q,.6);const z0=level.position.z;run(level,q,1.5,{forward:1,cameraPitch:0});
  assert.ok(Math.abs(level.velocity.y)<.4,'level camera: level swim');assert.ok(level.position.z-z0>2.5,'level camera: forward');
  const deep=p.position.y;run(p,q,3,{forward:1,cameraPitch:-.7});assert.ok(p.position.y>deep+1,'camera up + forward: rises');
  run(p,q,3,{forward:1,cameraPitch:-.7});assert.equal(p.diving,false,'reaching the surface ends the dive');assert.equal(p.mode,'swim');
  const floor=run(actor(),q,1.5);press(floor,q);run(floor,q,8,{forward:1,cameraPitch:1.1});assert.ok(floor.position.y>=-6+.3-1e-6,'never through the sea bed: '+floor.position.y.toFixed(2));
});
test('SWIM — out of oxygen the dive ends and the hamster rises; Ctrl held still sinks (existing control)',()=>{
  const q=sea(),p=run(actor(),q,1.5);press(p,q);run(p,q,1);p.oxygen=0;run(p,q,2.5);assert.equal(p.diving,false);assert.equal(p.mode,'swim');
  const c=run(actor(),q,1.5);run(c,q,1.5,{dive:true});assert.equal(c.mode,'dive');run(c,q,2.5);assert.equal(c.mode,'swim','released: back up');
});
