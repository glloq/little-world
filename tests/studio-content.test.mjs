import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandBus} from '../src/studio-core/commands.ts';
import {createProject,chunkAt,parseProject} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {applyInteraction,interactionChunkIds,existingInteraction} from '../src/studio-core/interaction-templates.ts';
import {createCharacter,setCharacterPath} from '../src/studio-core/character-authoring.ts';
import {gameplayDataFromProject} from '../src/gameplay/project-adapter.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';

function project(){
  const p=createProject({name:'Contenu',width:1000,length:1000});
  const put=(id,x,z)=>putEntity(p,{id,name:id,kind:'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'props.lantern'}}});
  put('lantern',10,10);put('gate',300,10);return p;
}
test('one-click collectable creates item, state and interaction in one undoable transaction',()=>{
  const p=project(),bus=new CommandBus(p),request={entityId:'lantern',kind:'collect',prompt:'Ramasser',quantity:1,resourceName:'Lanterne'};
  editDocument(bus,'Collectable',interactionChunkIds(p,request),d=>applyInteraction(d,request));
  const interaction=existingInteraction(p,'lantern');assert.equal(interaction.trigger.entityId,'lantern');
  assert.ok(Object.values(p.libraries.items).some(i=>i.name==='Lanterne'));
  const entity=gameplayDataFromProject(p).entities.find(e=>e.id==='lantern');assert.equal(entity.initialState.collected,false);assert.ok(entity.interactable);
  parseProject(structuredClone(p));bus.undo();assert.equal(existingInteraction(p,'lantern'),undefined);assert.deepEqual(p.libraries.items,{});
});
test('a lever across sectors adds the target collider/state and validates references',()=>{
  const p=project(),bus=new CommandBus(p),request={entityId:'lantern',kind:'lever',prompt:'Tirer',quantity:1,targetId:'gate'};
  assert.equal(interactionChunkIds(p,request).length,2);
  editDocument(bus,'Levier',interactionChunkIds(p,request),d=>applyInteraction(d,request));
  const gate=p.chunks[p.entityIndex.gate.ownerChunkId].entities.gate;assert.equal(gate.components.Collider.layer,'solid');assert.equal(gate.components.State.initial.open,false);
  assert.throws(()=>applyInteraction(structuredClone(p),{...request,targetId:'lantern'}),/autre objet/);
  assert.throws(()=>applyInteraction(structuredClone(p),{entityId:'lantern',kind:'deliver',prompt:'x',quantity:1,itemId:'missing'}),/ressource/);
});
test('a route drawn for a character switches it to patrol and reaches the runtime',()=>{
  const p=project(),bus=new CommandBus(p);editDocument(bus,'PNJ',[chunkAt(p.world,0,0)],d=>createCharacter(d,{id:'npc',name:'Noisette',x:0,z:0,species:'squirrel'}));
  const route=[{x:0,z:0},{x:10,z:5},{x:20,z:0}];editDocument(bus,'Trajet',[p.entityIndex.npc.ownerChunkId],d=>setCharacterPath(d,'npc',route));
  const npc=toRuntimeWorld(p).npcs.find(n=>n.id==='npc');assert.equal(npc.behavior,'patrol');assert.deepEqual(npc.path,route);
  assert.throws(()=>setCharacterPath(p,'npc',[{x:0,z:0}]),/2 à 100/);assert.throws(()=>setCharacterPath(p,'lantern',route),/personnages/);
  bus.undo();assert.equal(toRuntimeWorld(p).npcs.find(n=>n.id==='npc').path,undefined);
});
