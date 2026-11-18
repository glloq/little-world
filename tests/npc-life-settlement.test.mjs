import test from 'node:test';
import assert from 'node:assert/strict';
import {flatSettlementProject} from '../tools/settlement-fixture.mjs';
import {newSettlement} from '../src/settlements/schema.ts';
import {planSettlement} from '../src/settlements/planner.ts';
import {applySettlement} from '../src/settlements/authoring.ts';
import {validateSettlements} from '../src/settlements/validation.ts';
import {runtimeContent} from '../src/studio-core/migration.ts';
import {validResidentRoutine} from '../src/npc-life/schedule.ts';

function recipe(p){return {...newSettlement(p.world,'living-village'),radius:150,services:true,localLife:true,residentRoutines:true,cultivation:true,activity:'agriculture'};}
test('new opted-in settlement assigns homes and daytime destinations without new meshes or replacement dialogue runtime',()=>{
 const p=flatSettlementProject(),r=recipe(p),plan=planSettlement(p,r);
 assert.equal(plan.diagnostics.some(d=>d.severity==='ERROR'),false,JSON.stringify(plan.diagnostics));
 const host=plan.entities.find(e=>e.id==='living-village-host');
 assert.ok(host?.components.DialogueActor);
 assert.equal(validResidentRoutine(host.components.Resident),true);
 assert.ok(plan.buildings.some(b=>b.id===host.components.Resident.homeAnchorId));
 const childEntities=plan.entities.filter(e=>e.components.Resident?.role==='child');
 assert.equal(childEntities.length,2);
 for(const child of childEntities){
  assert.equal(child.components.Transform.scale.x,.73);
  assert.ok(plan.buildings.some(b=>b.id===child.components.Resident.homeAnchorId));
  assert.ok(plan.amenities.some(a=>a.id===child.components.Resident.workAnchorId));
  assert.ok(plan.dialogues[child.id+'-talk']);
 }
 applySettlement(p,plan);
 assert.deepEqual(validateSettlements(p),[]);
 const resolved=plan.entities.map(e=>({id:e.id,name:e.name,components:e.components}));
 const npc=runtimeContent(resolved,p.libraries).npcs;
 assert.equal(npc.filter(n=>n.routine).length,3);
 assert.ok(npc.some(n=>n.routine?.role==='child'&&n.scale===.73));
});
test('legacy settlement recipe does not create any child or resident schedule',()=>{
 const p=flatSettlementProject(),r={...recipe(p),residentRoutines:undefined};
 const plan=planSettlement(p,r);
 assert.equal(plan.entities.filter(e=>e.components.Resident).length,0);
 assert.ok(plan.entities.some(e=>e.id==='living-village-host'));
});
test('generated living residents and author changes persist across recomposition',()=>{
 const p=flatSettlementProject(),r=recipe(p),first=planSettlement(p,r);
 applySettlement(p,first);
 const second=planSettlement(p,r);
 assert.equal(second.entities.filter(e=>e.components.Resident?.role==='child').length,2);
 applySettlement(p,second);
 assert.deepEqual(validateSettlements(p),[]);
});
