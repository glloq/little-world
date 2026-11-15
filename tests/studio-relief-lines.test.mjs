import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidedWorld} from '../src/studio-core/world-start.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {RELIEF_LINE_DEFAULTS,newReliefLine,validateReliefLine,upsertReliefLine,
  removeReliefLine,isAuthoredReliefLine,reliefLineFromFeature} from '../src/studio-core/relief-lines.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
const world=()=>createGuidedWorld({name:'A2 cliff and pass',mode:'calm',width:1000,length:1000,seed:55,cliffs:.35,volcano:false});
const line=[{x:-55,z:0},{x:0,z:0},{x:55,z:0}];
test('A2 ridge, escarpment, valley and pass all generate native editable heightfield features',()=>{
 for(const preset of Object.keys(RELIEF_LINE_DEFAULTS)){
  const p=world(),r=newReliefLine(preset);r.points=line;
  const before=projectGeography(p).ctx.height(0,0);
  const created=upsertReliefLine(p,r);
  assert.ok(isAuthoredReliefLine(created));
  assert.equal(reliefLineFromFeature(created).preset,preset);
  const after=projectGeography(p).ctx.height(0,0);
  assert.ok((preset==='ridge'||preset==='cliff')?after>before:after<before);
  parseProject(structuredClone(p));
  r.amountM+=4;
  upsertReliefLine(p,r);
  assert.equal(p.world.terrain.archipelago.features.filter(f=>f.id===r.id).length,1);
  removeReliefLine(p,r.id);
  assert.equal(p.world.terrain.archipelago.features.filter(f=>f.id===r.id).length,0);
  parseProject(structuredClone(p));
 }
});
test('A2 feature history and archive-compatible field mutations',()=>{
 const p=world(),bus=new CommandBus(p),r=newReliefLine('pass');r.points=line;
 editDocument(bus,'Draw pass',[],d=>upsertReliefLine(d,r));
 assert.equal(p.world.terrain.archipelago.features.filter(isAuthoredReliefLine).length,1);
 bus.undo();assert.equal(p.world.terrain.archipelago.features.filter(isAuthoredReliefLine).length,0);
 bus.redo();parseProject(structuredClone(p));
 assert.equal(p.world.terrain.archipelago.features.filter(isAuthoredReliefLine).length,1);
});
test('A2 rejects excessive line points, invalid elevation and outside-world positions',()=>{
 const p=world(),r=newReliefLine('cliff');
 r.points=line;validateReliefLine(p.world,r);
 assert.throws(()=>validateReliefLine(p.world,{...r,points:[{x:0,z:0}]}),/2 à 32/);
 assert.throws(()=>validateReliefLine(p.world,{...r,points:[{x:0,z:0},{x:0,z:0}]}),/proches/);
 assert.throws(()=>validateReliefLine(p.world,{...r,amountM:900}),/amplitude/);
 assert.throws(()=>validateReliefLine(p.world,{...r,points:[{x:-900,z:0},{x:30,z:0}]}),/hors carte/);
 assert.throws(()=>removeReliefLine(p,'not-our-feature'));
});
