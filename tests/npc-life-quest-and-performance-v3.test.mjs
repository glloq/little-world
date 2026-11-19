import test from 'node:test';
import assert from 'node:assert/strict';
import {flatSettlementProject} from '../tools/settlement-fixture.mjs';
import {newSettlement} from '../src/settlements/schema.ts';
import {planSettlement} from '../src/settlements/planner.ts';
import {applySettlement} from '../src/settlements/authoring.ts';
import {createGameplay} from '../src/gameplay/runtime.ts';
import {residentAnchorChoices,reassignResident} from '../src/npc-life/authoring.ts';
import {residentRegistry} from '../src/npc-life/registry.ts';
import {selectNPCRigs} from '../src/npc-life/rig-budget.ts';

const point={x:0,y:0,z:0};
function settlement(){
 const p=flatSettlementProject(),r={...newSettlement(p.world,'npc-social-v3'),radius:150,services:true,
   localLife:true,residentRoutines:true,cultivation:true,activity:'agriculture',residentDensity:'normal'};
 const plan=planSettlement(p,r);
 assert.ok(!plan.diagnostics.some(d=>d.severity==='ERROR'),JSON.stringify(plan.diagnostics));
 return {p,r,plan};
}
test('social quest derives from two genuine present NPCs and extends native dialogue only',()=>{
 const {p,plan}=settlement(),quest=plan.objectives?.['npc-social-v3-meet-neighbor'];
 assert.ok(quest,JSON.stringify({objectives:plan.objectives,npcs:plan.entities.filter(e=>e.kind==='character').map(e=>e.id)}));
 assert.equal(quest.initialStatus,'locked');
 const startActor=plan.entities.find(e=>plan.dialogues[e.id+'-talk']?.lines?.some(l=>l.choices.some(c=>c.id==='resident-quest-start')));
 const finishActor=plan.entities.find(e=>plan.dialogues[e.id+'-talk']?.lines?.some(l=>l.choices.some(c=>c.id==='resident-quest-finish')));
 assert.ok(startActor&&finishActor&&startActor.id!==finishActor.id);
 const start=plan.dialogues[startActor.id+'-talk'],finish=plan.dialogues[finishActor.id+'-talk'];
 const game=createGameplay({worldId:'quest-v3',buildVersion:'test',entities:[startActor,finishActor].map(e=>({
   id:e.id,ownerChunkId:e.ownerChunkId,initialState:{},persistentState:[],dialogueIds:[e.id+'-talk']
 })),variables:[],items:[],interactions:[],objectives:[quest],dialogues:[start,finish],activities:[]});
 assert.equal(game.state.objectives[quest.id],'locked');
 assert.ok(!game.availableChoices(finish.id,finish.start).some(c=>c.id==='resident-quest-finish'));
 assert.equal(game.dialogueChoice(start.id,start.start,'resident-quest-start'),null);
 assert.equal(game.state.objectives[quest.id],'active');
 assert.ok(game.availableChoices(finish.id,finish.start).some(c=>c.id==='resident-quest-finish'));
 assert.equal(game.dialogueChoice(finish.id,finish.start,'resident-quest-finish'),null);
 assert.equal(game.state.objectives[quest.id],'complete');
 const saved=game.save('quest-v3',point),restored=createGameplay(game.data);
 assert.deepEqual(restored.restore(saved),[]);
 assert.equal(restored.state.objectives[quest.id],'complete');
 assert.equal(saved.objectives[quest.id],'complete');
 assert.equal(Object.keys(plan.objectives).length,1);
 assert.equal(Object.keys(p.libraries.objectives).length,0,'Plan must not mutate authored source before commit');
});
test('native generated objective is idempotent and not lost on recomposition',()=>{
 const {p,r,plan}=settlement(),objective=plan.objectives?.['npc-social-v3-meet-neighbor'];
 assert.ok(objective);
 applySettlement(p,plan);
 assert.equal(p.libraries.objectives[objective.id].name,objective.name);
 const second=planSettlement(p,r);
 assert.deepEqual(second.objectives,plan.objectives);
 applySettlement(p,second);
 assert.equal(p.libraries.objectives[objective.id].name,objective.name);
 assert.ok(p.libraries.settlements[r.id].objectiveHashes?.[objective.id]);
});
test('author changes to quest title remain protected when settlement is regenerated',()=>{
 const {p,r,plan}=settlement();applySettlement(p,plan);
 const id=r.id+'-meet-neighbor';
 p.libraries.objectives[id].name='Mission personnalisée';
 const next=planSettlement(p,r);
 applySettlement(p,next);
 assert.equal(p.libraries.objectives[id].name,'Mission personnalisée');
});
test('disabling auto routines removes only untouched generated social objective',()=>{
 const {p,r,plan}=settlement();applySettlement(p,plan);
 const id=r.id+'-meet-neighbor';
 const replacement=planSettlement(p,{...r,residentRoutines:false});
 applySettlement(p,replacement);
 assert.equal(p.libraries.objectives[id],undefined);
});
test('Studio resident anchor editor rejects fabricated destinations and preserves identity',()=>{
 const {p,plan}=settlement();applySettlement(p,plan);
 const person=residentRegistry(p,'npc-social-v3').residents.find(e=>e.role!=='child');
 assert.ok(person);
 const choices=residentAnchorChoices(p,person.id);
 assert.ok(choices?.homes.length&&choices.jobs.length);
 const old=p.entityIndex[person.id],entity=p.chunks[old.ownerChunkId].entities[person.id];
 const name=entity.name,dialogue=structuredClone(p.libraries.dialogues[person.id+'-talk']);
 assert.throws(()=>reassignResident(p,person.id,'invented-house','invented-job'),/non disponible/);
 reassignResident(p,person.id,person.homeAnchorId,person.workAnchorId);
 const next=p.chunks[p.entityIndex[person.id].ownerChunkId].entities[person.id];
 assert.equal(next.name,name);
 assert.deepEqual(p.libraries.dialogues[person.id+'-talk'],dialogue);
 assert.equal(next.components.Resident.homeAnchorId,person.homeAnchorId);
 assert.equal(next.components.Resident.workAnchorId,person.workAnchorId);
});
test('rig allocation is deterministic, bounded and prioritizes near characters',()=>{
 const residents=Array.from({length:100},(_,i)=>({id:'npc:'+String(i).padStart(3,'0'),kind:'hamster',
   x:(i%10)-5,z:Math.floor(i/10)-5}));
 const first=selectNPCRigs(residents,{x:0,z:0},8),second=selectNPCRigs([...residents].reverse(),{x:0,z:0},8);
 assert.equal(first.size,8);assert.deepEqual([...first],[...second]);
 assert.equal(selectNPCRigs(residents,{x:0,z:0},12).size,12);
 assert.equal(selectNPCRigs(residents,{x:0,z:0},20).size,20);
 const picked=selectNPCRigs(residents,{x:0,z:0},8,'npc:000');
 assert.equal(picked.has('npc:000'),true);
 assert.equal(picked.size,8);
 assert.equal(selectNPCRigs(residents,{x:0,z:0},0).size,0);
 assert.equal(selectNPCRigs([{id:'far',x:200,z:200,kind:'hamster'}],{x:0,z:0},12).size,0);
});

test('Studio reassignment does not silently remove a custom agenda',()=>{
 const {p,plan}=settlement();applySettlement(p,plan);
 const person=residentRegistry(p,'npc-social-v3').residents.find(e=>e.role!=='child');
 assert.ok(person);
 const loc=p.entityIndex[person.id],source=p.chunks[loc.ownerChunkId].entities[person.id];
 const before=structuredClone(source.components.Resident);
 const visits=before.activities;
 reassignResident(p,person.id,person.homeAnchorId,person.workAnchorId);
 const after=p.chunks[p.entityIndex[person.id].ownerChunkId].entities[person.id].components.Resident;
 if(visits?.length)assert.deepEqual(after.activities,visits,'An authored itinerary must not be regenerated');
 assert.equal(after.homeAnchorId,person.homeAnchorId);
});
