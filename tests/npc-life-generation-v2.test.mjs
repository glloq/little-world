import test from 'node:test';
import assert from 'node:assert/strict';
import {flatSettlementProject} from '../tools/settlement-fixture.mjs';
import {newSettlement} from '../src/settlements/schema.ts';
import {localLifeCapabilities} from '../src/npc-life/capabilities.ts';
import {createResidentAssignmentPlanner} from '../src/npc-life/assignments.ts';
import {createResidentRouter} from '../src/npc-life/routes.ts';
import {planSettlement} from '../src/settlements/planner.ts';
import {applySettlement} from '../src/settlements/authoring.ts';

const ground={bounds:{minX:-250,maxX:250,minZ:-250,maxZ:250},height:()=>12,wet:()=>false,seaLevel:0};
const makeJob=(id,p)=>({id,sourceId:id,role:'farmer',point:p,kind:'farm'});
const homes=[
  {id:'house:A',slot:0,point:{x:0,z:0}},
  {id:'house:B',slot:1,point:{x:0,z:30}},
  {id:'house:C',slot:2,point:{x:100,z:0}},
];
test('capability index rejects fictitious jobs and keeps native provenance',()=>{
  const p=flatSettlementProject();
  const recipe={...newSettlement(p.world,'work-check'),activity:'fishing'};
  const buildings=[{id:'a',slot:0,entry:{x:3,z:4}}];
  const i=localLifeCapabilities(recipe,buildings,[],[],p);
  assert.equal(i.homes.length,1);
  assert.equal(i.jobs.length,0);
  assert.ok(i.warnings.includes('LIFE_NO_JOBS'));
  const withCounter=localLifeCapabilities(recipe,buildings,[{id:'market',role:'counter',entry:{x:8,z:8}}],[],p);
  assert.ok(withCounter.jobs.some(j=>j.role==='merchant'));
  assert.equal(withCounter.jobs.some(j=>j.role==='fisher'),false);
  const withDock=localLifeCapabilities(recipe,buildings,[{id:'dock',role:'harbor',entry:{x:8,z:8}}],[],p);
  assert.equal(withDock.jobs.find(j=>j.role==='fisher').sourceId,'dock');
});
test('work assignment picks a route, not Euclidean shortest across blocked shore',()=>{
  const paths=[{points:[{x:0,z:0},{x:0,z:30},{x:30,z:30},{x:30,z:0},{x:100,z:0}]}];
  const router=createResidentAssignmentPlanner(paths,ground,{maxOccupantsPerHome:2});
  const job=makeJob('field', {x:99,z:0});
  const result=router.allocate(job,homes,'farmer');
  assert.ok(result);
  assert.equal(result.home.id,'house:C');
  assert.ok(result.route.length<1);
  assert.equal(router.jobOccupancy('field'),1);
  assert.equal(router.allocate(job,homes,'farmer'),null);
});
test('route selection refuses water and walls even when two points are close',()=>{
  const wet={...ground,wet:(x,z)=>x>3&&x<20};
  const p=createResidentAssignmentPlanner([{points:[{x:0,z:0},{x:30,z:0}]}],wet);
  assert.equal(p.allocate(makeJob('job',{x:30,z:0}),[homes[0]],'farmer'),null);
  const wall=createResidentAssignmentPlanner([{points:[{x:0,z:0},{x:30,z:0}]}],ground,{blocked:(x)=>x>8&&x<18});
  assert.equal(wall.allocate(makeJob('job',{x:30,z:0}),[homes[0]],'farmer'),null);
});
test('native T-junction connects a house access path to the middle of a street',()=>{
  const paths=[{points:[{x:-20,z:0},{x:20,z:0}]},{points:[{x:0,z:0},{x:0,z:20}]}];
  const router=createResidentRouter(paths,()=>true);
  const found=router.route({x:-18,z:0},{x:0,z:18});
  assert.ok(found);
  assert.ok(found.length>=30&&found.length<=42);
});
test('households have bounded occupancy and failed assignments do not consume capacity',()=>{
  const r=createResidentAssignmentPlanner([{points:[{x:0,z:0},{x:0,z:30}]}],ground,{maxOccupantsPerHome:2});
  for(let i=0;i<2;i++){
    const selected=r.allocate({id:'play:'+i,sourceId:'play:'+i,role:'child',kind:'amenity',point:{x:0,z:30}},[homes[0]],'child');
    assert.ok(selected);
  }
  assert.equal(r.occupancy(homes[0].id),2);
  assert.equal(r.allocate({id:'third',sourceId:'third',role:'child',kind:'amenity',point:{x:0,z:30}},[homes[0]],'child'),null);
});
test('real settlement children and host have route-qualified homes, job sources and stable IDs',()=>{
  const p=flatSettlementProject(),r={...newSettlement(p.world,'npc-v2'),radius:150,services:true,
    localLife:true,residentRoutines:true,cultivation:true,activity:'agriculture',residentDensity:'normal'};
  const first=planSettlement(p,r);
  assert.equal(first.diagnostics.some(d=>d.severity==='ERROR'),false,JSON.stringify(first.diagnostics));
  assert.ok(first.lifeStats);
  assert.ok(first.lifeStats.graphNodes>0);
  const residents=first.entities.filter(e=>e.components.Resident);
  assert.ok(residents.length>=2,JSON.stringify({stats:first.lifeStats,diagnostics:first.diagnostics}));
  const allAnchors=new Set([...first.buildings.map(b=>b.id),...(first.amenities??[]).map(a=>a.id),...(first.zones??[]).map(z=>z.id)]);
  for(const e of residents){
    const r=e.components.Resident;
    assert.ok(allAnchors.has(r.homeAnchorId),r.homeAnchorId);
    assert.ok(allAnchors.has(r.workAnchorId),r.workAnchorId);
    assert.notDeepEqual(r.home,r.work);
  }
  applySettlement(p,first);
  const next=planSettlement(p,r);
  assert.deepEqual(next.entities.filter(e=>e.components.Resident).map(e=>[e.id,e.components.Resident.homeAnchorId,e.components.Resident.workAnchorId]).sort(),
    residents.map(e=>[e.id,e.components.Resident.homeAnchorId,e.components.Resident.workAnchorId]).sort());
});
