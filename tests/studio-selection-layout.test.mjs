import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {layoutUpdates} from '../src/studio-core/selection-layout.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {applyTransforms,transformChunkIds} from '../src/studio-core/transforms.ts';
const p=()=>{
 const doc=createProject({name:'Arrange',width:1000,length:1000});
 for(const [id,x,z] of [['a',0,5],['b',20,30],['c',50,15]]){
  putEntity(doc,{id,name:id,kind:'prop',ownerChunkId:chunkAt(doc.world,x,z),components:{
    Visual:{type:'Visual',assetId:'props.crate'},
    Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}}
  }});
 }return doc;
};
test('alignment preserves other coordinates and is undoable',()=>{
 const doc=p(),bus=new CommandBus(doc),updates=layoutUpdates(doc,['a','b','c'],'align-x');
 assert.ok(updates.every(u=>Math.abs(u.transform.position.x-70/3)<1e-6));
 editDocument(bus,'Align X',transformChunkIds(doc,updates),d=>applyTransforms(d,updates));
 assert.ok(Object.values(doc.entityIndex).every(e=>Math.abs(e.position.x-70/3)<1e-6));
 bus.undo();assert.equal(doc.entityIndex.a.position.x,0);bus.redo();
 assert.equal(doc.entityIndex.b.position.z,30);
});
test('distribution sorts deterministically and keeps outer positions',()=>{
 const doc=p(),u=layoutUpdates(doc,['c','a','b'],'distribute-x');
 assert.deepEqual(u.map(e=>[e.id,e.transform.position.x]),[['c',50],['a',0],['b',25]]);
 assert.deepEqual(layoutUpdates(doc,['a','b','c'],'distribute-z').map(e=>[e.id,e.transform.position.z]),[['a',5],['b',30],['c',17.5]]);
});
test('layout prevents invalid selection sizes',()=>{
 assert.throws(()=>layoutUpdates(p(),['a'],'align-x'));
});
