import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {createCharacter,updateCharacter} from '../src/studio-core/character-authoring.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {resolveEntity} from '../src/studio-core/references.ts';
import {createNPCState,validNPC} from '../src/npc.ts';
const options={id:'test-actor',name:'Brindille',x:0,z:0,species:'squirrel'};
test('create and customize a character with stable linked behavior and dialogue, no injected demo actors',()=>{
 const p=createProject({name:'Characters'});createCharacter(p,options);assert.equal(Object.keys(p.entityIndex).length,1);const graph=structuredClone(p.libraries.dialogues['dialogue:test-actor']);updateCharacter(p,'test-actor',{name:'Brindille du jardin',species:'animal',appearance:{hat:true,backpack:true,neckwear:'scarf',emotion:'curious'},behavior:'wander',radius:12,speed:1.5});const valid=parseProject(p),npc=toRuntimeWorld(valid).npcs[0];assert.equal(npc.name,'Brindille du jardin');assert.equal(npc.kind,'animal');assert.equal(npc.appearance.hat,true);assert.equal(npc.behavior,'wander');assert.deepEqual(valid.libraries.dialogues['dialogue:test-actor'],graph);
 assert.throws(()=>createCharacter(p,options));
});
test('editing a character preserves patrol data and can replace prefab appearance overrides',()=>{
 const p=createProject({name:'Patrol'});createCharacter(p,options);const entity=p.chunks[chunkAt(p.world,0,0)].entities['test-actor'];entity.components.Navigation.path=[{x:1,z:2},{x:3,z:4}];entity.overrides=[{component:'Character',field:'appearance.hat',value:true}];updateCharacter(p,'test-actor',{name:'Patrol',species:'squirrel',appearance:{hat:false,backpack:false,neckwear:'none',emotion:'happy'},behavior:'patrol',radius:8,speed:1});const resolved=resolveEntity(p,p.chunks[entity.ownerChunkId].entities[entity.id]);assert.equal(resolved.components.Character.appearance.hat,false);assert.deepEqual(resolved.components.Navigation.path,[{x:1,z:2},{x:3,z:4}]);
});
test('V3 NPC construction accepts explicit large bounds without relaxing legacy validation',()=>{
 const p=createProject({name:'Large',width:10000,length:10000});createCharacter(p,{...options,x:4000,z:4000});const npc=toRuntimeWorld(parseProject(p)).npcs[0];assert.equal(validNPC(npc),false);assert.doesNotThrow(()=>createNPCState(npc,{width:10000,length:10000}));
});
test('Character species — hamster uses its own rig, rig/species mismatch is rejected, runtime keeps the morphology',()=>{
 const p=createProject({name:'Hamsters'});createCharacter(p,{id:'h-1',name:'Noisette',x:0,z:0,species:'hamster'});
 assert.equal(resolveEntity(p,p.chunks[p.entityIndex['h-1'].ownerChunkId].entities['h-1']).components.Character.rigId,'hamster-rigid');
 const npc=toRuntimeWorld(parseProject(p)).npcs[0];assert.equal(npc.kind,'hamster');
 updateCharacter(p,'h-1',{name:'Noisette',species:'squirrel',appearance:{hat:false,backpack:false,neckwear:'none',emotion:'happy'},behavior:'idle',radius:0,speed:0});
 assert.equal(toRuntimeWorld(parseProject(p)).npcs[0].kind,'squirrel');
 const bad=JSON.parse(JSON.stringify(p));const walk=o=>{if(o&&typeof o==='object'){if(o.type==='Character')o.rigId='hamster-rigid';for(const v of Object.values(o))walk(v);}};walk(bad);
 assert.throws(()=>parseProject(bad),/rig/);
});
