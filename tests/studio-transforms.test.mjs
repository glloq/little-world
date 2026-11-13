import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandBus} from '../src/studio-core/commands.ts';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {applyTransforms,transformChunkIds,entityTransform,duplicateEntities,duplicateChunkIds,deleteEntities,yawQuaternion} from '../src/studio-core/transforms.ts';
import {createCharacter} from '../src/studio-core/character-authoring.ts';
import {SelectionService,defaultStudioContext,parseStudioContext} from '../src/studio-core/context.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';

function world(){
  const p=createProject({name:'Transforms',width:1000,length:1000});
  const put=(id,x,z,extra={})=>putEntity(p,{id,name:id,kind:'prop',ownerChunkId:chunkAt(p.world,x,z),components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'props.crate'},...extra}});
  put('crate-a',10,10);put('crate-b',20,10,{Interactable:{type:'Interactable',prompt:'Ouvrir',range:3,interactionIds:[]},State:{type:'State',initial:{open:false}}});
  return p;
}
const move=(p,id,dx,dz,extra={})=>{const t=entityTransform(p,id);return {id,transform:{...t,...extra,position:{x:t.position.x+dx,y:t.position.y+(extra.dy??0),z:t.position.z+dz}}};};
test('a full transform (offset, rotation, non-uniform scale) is one undoable transaction',()=>{
  const p=world(),bus=new CommandBus(p),before=structuredClone(p.chunks);
  const update={id:'crate-a',transform:{position:{x:12,y:1.5,z:11},rotation:{x:0.2,y:0.4,z:0,w:0.9},scale:{x:2,y:1,z:0.5}}};
  const tx=editDocument(bus,'Transformer',transformChunkIds(p,[update]),d=>applyTransforms(d,[update]));
  assert.ok(tx);assert.equal(bus.serialize().undo.length,1);
  const t=entityTransform(p,'crate-a');assert.equal(t.position.y,1.5);assert.deepEqual(t.scale,{x:2,y:1,z:0.5});
  assert.ok(Math.abs(Math.hypot(t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w)-1)<1e-9,'quaternion normalised');
  bus.undo();assert.deepEqual(p.chunks,before);bus.redo();assert.equal(entityTransform(p,'crate-a').position.y,1.5);
});
test('moving entities across sectors keeps their stable IDs and updates owners; undo restores the owner',()=>{
  const p=world(),bus=new CommandBus(p),from=p.entityIndex['crate-a'].ownerChunkId;
  const updates=[move(p,'crate-a',300,0),move(p,'crate-b',300,0)];
  editDocument(bus,'Déplacer',transformChunkIds(p,updates),d=>applyTransforms(d,updates));
  const to=p.entityIndex['crate-a'].ownerChunkId;assert.notEqual(to,from);
  assert.ok(p.chunks[to].entities['crate-a']);assert.ok(!p.chunks[from].entities['crate-a']);assert.ok(p.chunks[to].entityIds.includes('crate-b'));
  parseProject(structuredClone(p));
  bus.undo();assert.equal(p.entityIndex['crate-a'].ownerChunkId,from);assert.ok(p.chunks[from].entities['crate-a']);
});
test('positions are clamped to the project rectangle',()=>{
  const p=world(),bus=new CommandBus(p),u=move(p,'crate-a',5000,-5000);
  editDocument(bus,'Hors carte',transformChunkIds(p,[u]),d=>applyTransforms(d,[u]));
  const t=entityTransform(p,'crate-a');assert.equal(t.position.x,500);assert.equal(t.position.z,-500);
});
test('duplication creates new IDs, copies look/transform but not logic, in one transaction',()=>{
  const p=world(),bus=new CommandBus(p),offset={x:3,y:0,z:0};
  let created;editDocument(bus,'Dupliquer',duplicateChunkIds(p,['crate-a','crate-b'],offset),d=>{created=duplicateEntities(d,['crate-a','crate-b'],offset);});
  assert.equal(created.length,2);assert.ok(created.every(id=>p.entityIndex[id]&&!['crate-a','crate-b'].includes(id)));
  const copyB=p.chunks[p.entityIndex[created[1]].ownerChunkId].entities[created[1]];
  assert.equal(copyB.components.Interactable,undefined);assert.equal(copyB.components.State,undefined);assert.equal(copyB.components.Visual.assetId,'props.crate');
  assert.equal(entityTransform(p,created[0]).position.x,13);
  bus.undo();assert.ok(created.every(id=>!p.entityIndex[id]));
});
test('a duplicated character gets its own routine entry',()=>{
  const p=world(),bus=new CommandBus(p);editDocument(bus,'PNJ',[chunkAt(p.world,0,0)],d=>createCharacter(d,{id:'npc-1',name:'Noisette',x:0,z:0,species:'squirrel'}));
  let created;editDocument(bus,'Dupliquer PNJ',duplicateChunkIds(p,['npc-1'],{x:2,y:0,z:0}),d=>{created=duplicateEntities(d,['npc-1'],{x:2,y:0,z:0},()=>'npc-2');});
  const copy=p.chunks[p.entityIndex['npc-2'].ownerChunkId].entities['npc-2'];
  assert.equal(copy.components.Navigation.behaviorId,'behavior:npc-2');assert.ok(p.libraries.behaviors['behavior:npc-2']);assert.equal(copy.components.DialogueActor,undefined);
  parseProject(structuredClone(p));
});
test('deletion is reversible',()=>{
  const p=world(),bus=new CommandBus(p),owner=p.entityIndex['crate-a'].ownerChunkId;
  editDocument(bus,'Supprimer',[owner],d=>deleteEntities(d,['crate-a']));assert.equal(p.entityIndex['crate-a'],undefined);
  bus.undo();assert.ok(p.entityIndex['crate-a']);
});
test('transforms survive ZIP export/import and reach the runtime placement',()=>{
  const p=world(),bus=new CommandBus(p),update={id:'crate-a',transform:{position:{x:40,y:2,z:-30},rotation:yawQuaternion(1.2),scale:{x:1,y:3,z:1}}};
  editDocument(bus,'Transformer',transformChunkIds(p,[update]),d=>applyTransforms(d,[update]));
  const back=readProjectArchive(writeProjectArchive(p));
  assert.deepEqual(entityTransform(back,'crate-a'),entityTransform(p,'crate-a'));
  const placement=toRuntimeWorld(back).placements.find(v=>v.id==='crate-a');
  assert.equal(placement.y,2);assert.deepEqual(placement.scale3,[1,3,1]);assert.ok(Math.abs(placement.rotation-1.2)<1e-9);
});
test('multi-selection toggles, prunes deleted elements and the camera context is validated',()=>{
  const s=new SelectionService(defaultStudioContext('p','w')),a={kind:'entity',id:'a'},b={kind:'entity',id:'b'};
  s.toggle(a);s.toggle(b);assert.deepEqual(s.selection.map(v=>v.id),['b','a']);assert.equal(s.state.selected.id,'b');
  s.toggle(b);assert.deepEqual(s.selection.map(v=>v.id),['a']);
  s.setSelection([a,b]);s.prune(v=>v.id!=='a');assert.deepEqual(s.selection.map(v=>v.id),['b']);
  s.setCamera({x:1,y:2,z:3,mode:'top',target:{x:1,y:0,z:3},zoom:400});assert.equal(s.state.camera.zoom,400);
  assert.throws(()=>parseStudioContext({...defaultStudioContext('p','w'),camera:{x:0,y:0,z:0,mode:'orbit',zoom:-1}}),/invalide/);
  parseStudioContext({...defaultStudioContext('p','w'),camera:{x:0,y:150,z:0,mode:'map2d'}});
});
