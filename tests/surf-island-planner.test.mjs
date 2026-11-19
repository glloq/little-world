import test from 'node:test';
import assert from 'node:assert/strict';
import {planThreeSurfBeaches} from '../src/surf/surf-island-planner.ts';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {putAuthoredRace} from '../src/studio-core/race-authoring.ts';
import {validateSurfZone} from '../src/surf/wave-field.ts';
import {validateSurfFeature} from '../src/surf/surf-features.ts';
const bounds={minX:-700,maxX:700,minZ:-700,maxZ:700};
const coast=(_,z)=>z<-60?-8:5;
test('surf coastal planner positions three separate validated lanes and reserves calm water',()=>{
 const p=planThreeSurfBeaches(coast,bounds,0,11,'surf-example');
 assert.equal(p.beaches.length,3,p.warnings.join('; '));
 assert.deepEqual(p.beaches.map(b=>b.name),['A','B','C']);
 assert.ok(p.calmPort);
 assert.equal(p.beaches[0].zone.barrelStrength,0);
 assert.equal(p.beaches[1].zone.barrelStrength,1);
 assert.ok(p.beaches[2].features.some(f=>f.kind==='ramp'));
 assert.ok(p.beaches[2].features.some(f=>f.kind==='boost'));
 for(const item of p.beaches){
  assert.equal(validateSurfZone(item.zone),item.zone);
  assert.equal(item.gates.gates.length,4);
  assert.equal(item.gates.worldId,'surf-example');
  assert.ok(item.start.z<-60,'start in water');
  for(const f of item.features)validateSurfFeature(f);
 }
 for(let i=0;i<p.beaches.length;i++)for(let j=i+1;j<p.beaches.length;j++){
  const a=p.beaches[i].zone,b=p.beaches[j].zone;
  assert.ok(a.maxX<=b.minX||b.maxX<=a.minX||a.maxZ<=b.minZ||b.maxZ<=a.minZ,'no overlapping zone');
 }
 const again=planThreeSurfBeaches(coast,bounds,0,11,'surf-example');
 assert.deepEqual(again,p,'deterministic island authoring, not random per frame');
});
test('three planned beach races and modules pass strict Studio authoring without clobbering old library',()=>{
 const p=createProject({name:'Surf coast test',width:1400,length:1400,seed:11,
  projectId:'surf-project',worldId:'surf-example'});
 const {beaches}=planThreeSurfBeaches(coast,bounds,0,11,p.world.worldId);
 p.libraries.surfZones=Object.fromEntries(beaches.map(b=>[b.zone.id,b.zone]));
 p.libraries.surfFeatures=Object.fromEntries(beaches.flatMap(b=>b.features.map(f=>[f.id,f])));
 for(const beach of beaches)putAuthoredRace(p,beach.gates);
 const parsed=parseProject(p);
 assert.equal(Object.keys(parsed.libraries.surfZones??{}).length,3);
 assert.equal(Object.keys(parsed.libraries.races??{}).length,3);
 assert.ok(parsed.libraries.races?.['race:surf-c-11']);
});
test('planner does not install a surf zone on ocean without a reachable shore',()=>{
 const p=planThreeSurfBeaches(()=>-8,bounds,0,11,'surf-example');
 assert.equal(p.beaches.length,0);
 assert.equal(p.calmPort,null);
 assert.ok(p.warnings.length>0);
});
test('planner avoids reservations, and recognises the normal free occupation value',()=>{
 const open=planThreeSurfBeaches(coast,bounds,0,11,'surf-example',()=> 'none');
 assert.equal(open.beaches.length,3,'free occupation must not block the entire sea');
 const p=planThreeSurfBeaches(coast,bounds,0,11,'surf-example',(x,z)=>x>30?'port reserved':'none');
 assert.ok(p.beaches.every(b=>b.start.x<=30),
  'occupied coast is not used even when other beaches can be found');
 assert.ok(!p.calmPort||p.calmPort.x<=30);
 assert.deepEqual(planThreeSurfBeaches(coast,bounds,0,11,'surf-example',(x,z)=>x>30?'port reserved':'none'),p);
});
