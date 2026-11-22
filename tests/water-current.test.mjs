import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WaterSpatialIndex,riverCurrentProfile,RIVER_CURRENT} from '../src/water/profile.ts';
import {configureTerrain,waterCurrentAt,waterSurface,terrainHeight} from '../src/terrain.ts';
import {defaultWorld} from '../src/world-data.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';
import {updateBoat} from '../src/boat.ts';

// Doc 108 §7: river current = gameplay drift derived from the compiled profile only.
const river=(levels)=>({id:'r',points:[{x:0,z:0},{x:0,z:100},{x:0,z:200}],width:10,depth:2.5,level:0,profile:{mode:'manual',levels}});

test('current grows with the water-line slope, is zero on lakes and weaker near the banks',()=>{
 const calm=new WaterSpatialIndex([river([20,19.9,19.8])],()=>40,0),steep=new WaterSpatialIndex([river([20,12,4])],()=>40,0);
 const c=riverCurrentProfile(calm.bodies[0]),s=riverCurrentProfile(steep.bodies[0]);
 assert.ok(c.every(v=>v>=RIVER_CURRENT.baseMs&&v<.6),'calm reach ≈ walking pace: '+Math.max(...c));
 assert.ok(s[Math.floor(s.length/2)]>2,'8 % slope: fast');assert.ok(s.every(v=>v<=RIVER_CURRENT.maxMs));
 const mid=calm.query(0,100)[0],bank=calm.query(4.6,100)[0];
 assert.ok(mid.speed>0&&bank.speed<mid.speed*.6,'banks offer an escape');
 assert.ok(Math.abs(mid.flowZ-1)<1e-6,'flow follows the trace downstream');
 const lake={id:'l',kind:'lake',points:[{x:-20,z:-20},{x:20,z:-20},{x:20,z:20},{x:-20,z:20}],width:4,depth:2,level:5};
 assert.equal(new WaterSpatialIndex([lake],()=>9,0).query(0,0)[0].speed,0);
});

test('a swimmer drifts downstream, can still swim up a calm reach, and is carried down rapids',()=>{
 const config={...defaultWorld().config,width:400,length:600};
 const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0,cameraPitch:0};
 const swimmer=(z)=>({position:new THREE.Vector3(0,(waterSurface(0,z)??0)-.48,z),velocity:new THREE.Vector3(),mode:'swim',oxygen:MAX_OXYGEN,glideReady:false,climbCooldown:1e9});
 const run=(p,s,k={})=>{for(let i=0;i<Math.round(s*30);i++)simulatePlayer(p,{...keys,...k},1/30);return p;};
 try{
  configureTerrain(config,[],[river([20,19.6,19.2])]);
  assert.ok(terrainHeight(0,60)<waterSurface(0,60)-1,'deep enough to swim');
  const idle=run(swimmer(60),4);assert.equal(idle.mode,'swim');
  assert.ok(idle.position.z-60>1,'idle swimmer drifts downstream: '+(idle.position.z-60).toFixed(2));
  assert.ok(Math.abs(idle.position.x)<.2,'no sideways drift');
  const up=run(swimmer(120),4,{forward:1,cameraYaw:Math.PI});
  assert.ok(up.position.z<120-6,'calm reach: swimming upstream still progresses');
  configureTerrain(config,[],[river([30,14,2])]);
  const v=waterCurrentAt(0,100);assert.ok(v.z>2.5&&Math.abs(v.x)<1e-9,'rapids: '+v.z.toFixed(2));
  const fighting=run(swimmer(100),3,{forward:1,cameraYaw:Math.PI});
  assert.ok(fighting.position.z>100-3,'rapids: swimming upstream barely holds or loses ground');
  assert.deepEqual(waterCurrentAt(300,0),{x:0,z:0},'dry land: no current');
 }finally{configureTerrain(defaultWorld().config);}
});

test('a stopped boat drifts with the river but is never pushed onto the bank',()=>{
 const config={...defaultWorld().config,width:400,length:600};
 try{
  configureTerrain(config,[],[{...river([20,18,16]),width:14,depth:3}]);
  const boat={x:0,z:80,y:0,heading:0,speed:0};
  for(let i=0;i<60;i++)updateBoat(boat,{throttle:0,steer:0},1/30);
  assert.ok(boat.z>80.3,'drifted: '+boat.z.toFixed(2));assert.equal(boat.speed,0,'engine speed untouched');
 }finally{configureTerrain(defaultWorld().config);}
});
