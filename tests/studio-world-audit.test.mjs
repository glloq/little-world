import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/studio-core/schema.ts';
import {authoringIssues} from '../src/studio-core/world-audit.ts';
const point=(x,z)=>({x,z});
test('world authoring audit checks broken water links and distant junctions',()=>{
  const p=createProject({name:'Audit',width:1000,length:1000});
  p.libraries.water.a={id:'a',points:[point(0,0),point(20,10)],width:5,depth:2,level:0,to:{kind:'river',id:'missing'}};
  assert.ok(authoringIssues(p).some(d=>d.code==='WATER_MISSING_LINK'&&d.id==='a'));
  p.libraries.water.b={id:'b',points:[point(300,300),point(330,350)],width:5,depth:2,level:0};
  p.libraries.water.a.to={kind:'river',id:'b'};
  assert.ok(authoringIssues(p).some(d=>d.code==='WATER_FAR_LINK'));
});
test('world authoring audit stays clean on empty creation source',()=>{
  const p=createProject({name:'Vide',width:1000,length:1000});
  assert.deepEqual(authoringIssues(p),[]);
});
test('world authoring audit catches invalid bounds without mutating the source',()=>{
  const p=createProject({name:'Audit',width:1000,length:1000});
  p.libraries.paths.bad={id:'bad',points:[point(600,0),point(700,0)],width:3};
  const before=structuredClone(p);
  assert.ok(authoringIssues(p).some(d=>d.code==='PATH_OUTSIDE'));
  assert.deepEqual(p,before);
});
