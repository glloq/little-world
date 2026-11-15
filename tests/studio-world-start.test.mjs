import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidedWorld} from '../src/studio-core/world-start.ts';
import {parseProject} from '../src/studio-core/schema.ts';
const make=(changes={})=>createGuidedWorld({name:'Carte neuve',mode:'archipelago',width:3000,length:8000,seed:4242,cliffs:.5,volcano:true,...changes});
test('guided geography generates editable 3D-ready V3 sources',()=>{
  const p=make();assert.equal(p.world.bounds.maxZ,4000);
  assert.equal(p.world.terrain.kind,'archipelago');
  assert.ok(p.world.terrain.archipelago.features.some(f=>f.kind==='volcano'));
  assert.ok(p.world.terrain.archipelago.landmasses.every(x=>x.cliffs===.5));
  parseProject(structuredClone(p));
});
test('guided start supports a gentle island, adjustable dimensions and no volcano',()=>{
  const p=make({mode:'calm',width:1000,length:1000,volcano:false,cliffs:0});
  assert.equal(p.world.terrain.archipelago.features.length,0);
  assert.equal(p.world.bounds.maxX,500);
  parseProject(structuredClone(p));
});
test('guided wizard rejects unsafe options',()=>{
  assert.throws(()=>make({width:200}));
  assert.throws(()=>make({cliffs:1.5}));
  assert.throws(()=>make({name:''}));
});
