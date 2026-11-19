import test from 'node:test';
import assert from 'node:assert/strict';
import {flatSettlementProject} from '../tools/settlement-fixture.mjs';
import {newSettlement} from '../src/settlements/schema.ts';
import {planSettlement} from '../src/settlements/planner.ts';
import {applySettlement} from '../src/settlements/authoring.ts';
import {residentRegistry} from '../src/npc-life/registry.ts';
import {validateSettlements} from '../src/settlements/validation.ts';

function create(){
 const project=flatSettlementProject();
 const recipe={...newSettlement(project.world,'registry-demo'),radius:150,services:true,
   cultivation:true,localLife:true,residentRoutines:true,activity:'agriculture'};
 const plan=planSettlement(project,recipe);
 assert.equal(plan.diagnostics.some(x=>x.severity==='ERROR'),false,JSON.stringify(plan.diagnostics));
 applySettlement(project,plan);
 return {project,recipe,plan};
}
test('registry is a read-only view of source NPCs with stable names and anchor provenance',()=>{
 const {project,plan}=create();
 const before=JSON.stringify(project);
 const registry=residentRegistry(project,'registry-demo');
 assert.equal(registry.residents.length,plan.entities.filter(e=>e.components.Resident).length);
 assert.equal(registry.issues.length,0,JSON.stringify(registry.issues));
 assert.equal(JSON.stringify(project),before);
 assert.equal(Object.values(registry.byRole).reduce((a,b)=>a+b,0),registry.residents.length);
 assert.equal(validateSettlements(project,'registry-demo').filter(x=>x.code.startsWith('LIFE_')).length,0);
});
test('registry and settlement validation flag missing job after author edit without mutation',()=>{
 const {project}=create(),initial=residentRegistry(project,'registry-demo');
 const victim=initial.residents[0];
 assert.ok(victim);
 const idx=project.entityIndex[victim.id],entity=project.chunks[idx.ownerChunkId].entities[victim.id];
 entity.components.Resident.workAnchorId='missing-job';
 const issues=residentRegistry(project,'registry-demo').issues;
 assert.ok(issues.some(issue=>issue.targetId===victim.id&&issue.code==='LIFE_WORK_MISSING'));
 const diagnostics=validateSettlements(project,'registry-demo');
 assert.ok(diagnostics.some(x=>x.targetId===victim.id&&x.code==='LIFE_WORK_MISSING'&&x.severity==='WARNING'));
});
test('recomposition preserves author-edited NPC identity, dialogue and home choice',()=>{
 const {project,recipe,plan}=create();
 const name=plan.entities.find(x=>x.components.Resident)?.id;
 assert.ok(name);
 const index=project.entityIndex[name],entity=project.chunks[index.ownerChunkId].entities[name];
 entity.name='Habitant personnalisé';
 const source=JSON.stringify(entity),dialogue=JSON.stringify(project.libraries.dialogues[name+'-talk']);
 const next=planSettlement(project,recipe);
 assert.ok(next.preserved.includes(name),JSON.stringify(next.preserved));
 applySettlement(project,next);
 assert.equal(JSON.stringify(project.chunks[project.entityIndex[name].ownerChunkId].entities[name]),source);
 assert.equal(JSON.stringify(project.libraries.dialogues[name+'-talk']),dialogue);
});

test('turning off routines never strips dialogue from an author-edited resident',()=>{
 const {project,recipe,plan}=create();
 const child=plan.entities.find(e=>e.id.includes('-resident-')&&e.components.Resident);
 assert.ok(child);
 const idx=project.entityIndex[child.id],entity=project.chunks[idx.ownerChunkId].entities[child.id];
 entity.name='Habitant conservé';
 const dialogueBefore=JSON.stringify(project.libraries.dialogues[child.id+'-talk']);
 const replacement=planSettlement(project,{...recipe,residentRoutines:false});
 assert.equal(replacement.diagnostics.some(d=>d.severity==='ERROR'),false,JSON.stringify(replacement.diagnostics));
 applySettlement(project,replacement);
 const kept=project.chunks[project.entityIndex[child.id].ownerChunkId].entities[child.id];
 assert.equal(kept.name,'Habitant conservé');
 assert.equal(JSON.stringify(project.libraries.dialogues[child.id+'-talk']),dialogueBefore);
 const residents=residentRegistry(project,'registry-demo').residents;
 assert.ok(residents.some(r=>r.id===child.id),'The author-edited resident remains attached to the village');
});
