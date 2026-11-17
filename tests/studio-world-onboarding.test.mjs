import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWelcomeProject,DEFAULT_WELCOME_CONFIG} from '../src/studio-core/world-onboarding.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {generatorField} from '../src/terrain-generator.ts';
const c=(overrides={})=>({...DEFAULT_WELCOME_CONFIG,...overrides});
const sample=(p,x,z)=>{
  const b=p.world.bounds;
  return generatorField(p.world.terrain,{seed:p.world.seed,seaLevel:p.world.seaLevel,width:b.maxX-b.minX,length:b.maxZ-b.minZ},()=>0).height(x,z);
};
test('welcome preview and saved document use the same reproducible relief',()=>{
  const a=buildWelcomeProject(c(),'Premier monde'),b=buildWelcomeProject(c(),'Deuxième monde');
  assert.equal(a.world.terrain.kind,'archipelago');
  assert.equal(sample(a,40,200),sample(b,40,200));
  assert.notEqual(sample(a,40,200),sample(buildWelcomeProject(c({seed:123456})),40,200));
  parseProject(structuredClone(a));
});
test('blank starts with simple terrain and no placed content',()=>{
  const p=buildWelcomeProject(c({mode:'blank',width:1000,length:1000,volcano:true,mountain:{x:10,z:10}}));
  assert.equal(p.world.terrain.archipelago.features.length,0);
  assert.equal(p.world.terrain.archipelago.landmasses.length,1);
  assert.equal(p.world.terrain.archipelago.landmasses[0].hillHeightM,0);
  assert.equal(Object.keys(p.entityIndex).length,0);
  parseProject(structuredClone(p));
});
test('visual placement saves real editable mountain and volcano features',()=>{
  const p=buildWelcomeProject(c({mode:'archipelago',mountain:{x:80,z:100},volcanoAt:{x:-100,z:-400},relief:'rugged'}));
  const fs=p.world.terrain.archipelago.features;
  assert.equal(fs.find(f=>f.id==='welcome-mountain').x,80);
  const volcano=fs.find(f=>f.kind==='volcano');assert.equal(volcano.x,-100);assert.equal(volcano.z,-400);
  assert.ok(p.world.terrain.archipelago.landmasses.every(l=>l.cliffs===.7));
  parseProject(structuredClone(p));
});
test('wizard rejects invalid sizes, locations, seeds and names',()=>{
  assert.throws(()=>buildWelcomeProject(c({width:200})));
  assert.throws(()=>buildWelcomeProject(c({seed:0})));
  assert.throws(()=>buildWelcomeProject(c({mountain:{x:50000,z:0}})));
  assert.throws(()=>buildWelcomeProject(c(),'')); 
});
