import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnBoat, updateBoat, canBoatSailAt, nearBoat, nearDock,
  waterDisembarkPoint, BOAT_MAX_SPEED } from '../src/boat.ts';
import { cameraSubmerged, riverX, riverLevel } from '../src/terrain.ts';

test('boat spawns on navigable water near the dock',()=>{
  const boat=spawnBoat();
  assert.equal(canBoatSailAt(boat.x,boat.z,boat.heading),true);
  assert.equal(nearDock(boat),true);
  assert.equal(nearBoat(boat,boat.x+2,boat.y+1,boat.z),true);
  assert.equal(nearBoat(boat,boat.x+40,boat.y+1,boat.z),false);
});
test('forward, reverse, inertia and steering have predictable signs',()=>{
  const boat=spawnBoat(),startZ=boat.z;
  for(let i=0;i<100;i++)updateBoat(boat,{throttle:1,steer:0},1/60);
  assert.ok(boat.z>startZ+3,'boat must move forward');
  assert.ok(boat.speed>0&&boat.speed<=BOAT_MAX_SPEED);
  for(let i=0;i<40;i++)updateBoat(boat,{throttle:1,steer:1},1/60);
  assert.ok(boat.heading<0,'right steering must turn toward camera-right (-X)');
  assert.ok(Number.isFinite(boat.x)&&Number.isFinite(boat.y));
});
test('boat cannot leave valid water or clip dry terrain',()=>{
  const boat=spawnBoat();
  for(let i=0;i<2400;i++)updateBoat(boat,{throttle:1,steer:0},1/60);
  assert.ok(canBoatSailAt(boat.x,boat.z,boat.heading));
  assert.ok(boat.z<=286);
});
test('disembark point is outside the hull and on the water surface',()=>{
  const boat=spawnBoat(),pt=waterDisembarkPoint(boat);
  assert.ok(Math.hypot(pt.x-boat.x,pt.z-boat.z)>=3);
  assert.ok(Math.abs(pt.y-.07)<.1);
});
test('underwater filter depends on camera, not submerged player',()=>{
  assert.equal(cameraSubmerged(0,4,242),false);
  assert.equal(cameraSubmerged(0,-1,242),true);
  const z=-120,x=riverX(z),surface=riverLevel(z);
  assert.equal(cameraSubmerged(x,surface+4,z),false);
  assert.equal(cameraSubmerged(x,surface-1,z),true);
  assert.equal(cameraSubmerged(80,-3,-120),false);
});
