import test from 'node:test';
import assert from 'node:assert/strict';
import {flatSettlementProject} from '../tools/settlement-fixture.mjs';
import {newSettlement} from '../src/settlements/schema.ts';
import {planSettlement} from '../src/settlements/planner.ts';
import {applySettlement} from '../src/settlements/authoring.ts';
import {residentActivityChoices,setResidentStudioActivities} from '../src/npc-life/authoring.ts';
import {residentRegistry} from '../src/npc-life/registry.ts';

function fixture(){
 const project=flatSettlementProject();
 const recipe={...newSettlement(project.world,'npc-activities-studio'),radius:150,services:true,
  cultivation:true,localLife:true,residentRoutines:true,activity:'agriculture'};
 const plan=planSettlement(project,recipe);
 assert.equal(plan.diagnostics.some(d=>d.severity==='ERROR'),false,JSON.stringify(plan.diagnostics));
 applySettlement(project,plan);
 const person=residentRegistry(project,recipe.id).residents.find(r=>r.role!=='child');
 assert.ok(person);
 return {project,person};
}
test('Studio activities are authored on the existing Resident source without changing dialogue',()=>{
 const {project,person}=fixture();
 const choices=residentActivityChoices(project,person.id);
 assert.ok(choices.length,'expected a native bench or well');
 const original=project.chunks[project.entityIndex[person.id].ownerChunkId].entities[person.id];
 const dialogue=structuredClone(project.libraries.dialogues[person.id+'-talk']);
 const beforeName=original.name;
 assert.throws(()=>setResidentStudioActivities(project,person.id,[{
   kind:'social',anchorId:'invented:unknown',startHour:12,endHour:13,
 }]),/inexistant/);
 assert.equal(original.name,beforeName);
 // Clearing an existing agenda is a source edit, not removal of the resident.
 setResidentStudioActivities(project,person.id,[]);
 const updated=project.chunks[project.entityIndex[person.id].ownerChunkId].entities[person.id];
 assert.equal(updated.components.Resident.activities,undefined);
 assert.equal(updated.name,beforeName);
 assert.deepEqual(project.libraries.dialogues[person.id+'-talk'],dialogue);
});
test('Studio activities reject overlapping windows without partial mutation',()=>{
 const {project,person}=fixture();
 const anchor=residentActivityChoices(project,person.id)[0];
 assert.ok(anchor);
 const loc=project.entityIndex[person.id],before=structuredClone(project.chunks[loc.ownerChunkId].entities[person.id].components.Resident);
 assert.throws(()=>setResidentStudioActivities(project,person.id,[
  {kind:'meal',anchorId:anchor.id,startHour:12,endHour:13},
  {kind:'social',anchorId:anchor.id,startHour:12.5,endHour:14},
 ]),/Horaires/);
 assert.deepEqual(project.chunks[loc.ownerChunkId].entities[person.id].components.Resident,before);
});

test('F02 Studio stores weather gates in the original Resident V1 component',()=>{
 const {project,person}=fixture();
 const anchor=residentActivityChoices(project,person.id)[0];
 assert.ok(anchor);
 setResidentStudioActivities(project,person.id,[{
   kind:'social',anchorId:anchor.id,startHour:12,endHour:12.5,weather:'dry',
 }]);
 const loc=project.entityIndex[person.id],source=project.chunks[loc.ownerChunkId].entities[person.id];
 assert.equal(source.components.Resident.version,1);
 assert.equal(source.components.Resident.activities?.[0]?.weather,'dry');
 assert.throws(()=>setResidentStudioActivities(project,person.id,[{
   kind:'social',anchorId:anchor.id,startHour:12,endHour:12.5,weather:'storm',
 }]),/Horaires ou activités incompatibles/);
 assert.equal(source.components.Resident.activities?.[0]?.weather,'dry',
   'invalid edits must not mutate an existing routine');
});
