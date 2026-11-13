import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {planView,viewChanged,safetyRadius,distanceToChunk} from '../src/chunks.ts';
import {createTerrainView} from '../src/terrain-view.ts';

const config={width:3000,length:8000,chunkSize:64,viewDistance:240};
const focus=(over={})=>({playerX:0,playerZ:0,cameraX:0,cameraY:15,cameraZ:-13,forwardX:0,forwardZ:1,halfFovH:0.9,focalPx:493,velocityX:0,velocityZ:0,groundY:2,quality:0,...over});
const center=c=>({x:(c.minX+c.maxX)/2,z:(c.minZ+c.maxZ)/2});
test('detail follows the camera frustum and keeps a 360° safety ring around the player',()=>{
  const plan=planView(config,focus()),safety=safetyRadius(config);
  for(const c of plan)if(c.reason!=='safety')assert.ok(distanceToChunk(c,0,0)>safety);
  // every tile touching the safety disc is present, whatever the direction
  for(let x=-200;x<=200;x+=16)for(let z=-200;z<=200;z+=16)if(Math.hypot(x,z)<=safety*.9)assert.ok(plan.some(c=>x>=c.minX&&x<c.maxX&&z>=c.minZ&&z<c.maxZ),`(${x},${z}) covered`);
  const behind=plan.filter(c=>c.reason!=='safety'&&center(c).z<-40);
  assert.equal(behind.length,0,'nothing far behind the camera is requested');
  const ahead=plan.filter(c=>center(c).z>150);
  assert.ok(ahead.length>4);
  const turned=planView(config,focus({forwardZ:-1,cameraZ:13}));
  assert.ok(turned.some(c=>center(c).z<-150),'a U-turn requests the tiles now in view');
  assert.equal(viewChanged(focus(),focus({forwardX:0.2,forwardZ:1}),64),true,'≈11° rotation replans');
  assert.equal(viewChanged(focus(),focus({forwardX:0.05,forwardZ:1}),64),false,'small jitter does not');
});
test('safety and view requests come first, ordered by distance',()=>{
  const plan=planView(config,focus());
  const ranks=plan.map(c=>c.reason==='safety'?0:c.reason==='view'?1:2);
  assert.deepEqual(ranks,[...ranks].sort((a,b)=>a-b));
  for(let i=1;i<plan.length;i++)if(plan[i].reason===plan[i-1].reason)assert.ok(plan[i].distance>=plan[i-1].distance);
});
test('movement prediction preloads tiles along the trajectory even when looking aside',()=>{
  const still=planView(config,focus({forwardX:1,forwardZ:0,cameraX:-13,cameraZ:0}));
  const moving=planView(config,focus({forwardX:1,forwardZ:0,cameraX:-13,cameraZ:0,velocityZ:-9}));
  assert.ok(moving.some(c=>c.reason==='ahead'&&center(c).z<-100));
  assert.ok(!still.some(c=>c.reason==='ahead'));
});
test('altitude, projected size and the shared quality level coarsen LOD',()=>{
  const count=(plan,lod)=>plan.filter(c=>c.lod===lod).length;
  const ground=planView(config,focus()),high=planView(config,focus({cameraY:300,groundY:2}));
  assert.ok(count(high,0)<count(ground,0));
  const degraded=planView(config,focus({quality:2})),large=planView(config,focus({focalPx:900}));
  assert.ok(count(degraded,0)<=count(ground,0)&&count(degraded,2)>=count(ground,2));
  assert.ok(count(large,0)>=count(ground,0));
  const huge=planView({...config,width:10000,length:10000},focus());
  assert.ok(Math.abs(huge.length-ground.length)<=4,'cost independent of the project area');
});
test('time-sliced generation and byte-bounded residency',()=>{
  const view=createTerrainView(new THREE.Group(),{width:1000,length:1000,chunkSize:64,viewDistance:240},{buildBudgetMs:0,maxBuildsPerUpdate:8,maxBytes:600000});
  view.update(0,0,focus({cameraZ:-13}));
  assert.equal(view.work.lastBuilt,1,'a zero budget still makes progress, one tile at a time');
  let guard=0;while(view.stats.pending&&guard++<500)view.update(0,0,focus());
  for(let x=-400;x<=400;x+=64){let g=0;do view.update(x,0,focus({playerX:x,cameraX:x}));while(view.stats.pending&&g++<500);}
  let activeBytes=0;for(const mesh of view.terrain.children)activeBytes+=mesh.geometry.index.array.byteLength+Object.values(mesh.geometry.attributes).reduce((a,b)=>a+b.array.byteLength,0);
  assert.ok(view.stats.bytes<=Math.max(600000,activeBytes)+1,'cache evicts down to the byte bound (displayed tiles kept)');
  assert.ok(view.stats.disposed>0);
  view.dispose();
});
