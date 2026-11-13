import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandBus,CommandConflictError,JournalRecoveryError} from '../src/studio-core/commands.ts';
import {createProject,emptyChunk} from '../src/studio-core/schema.ts';
import {SelectionService,defaultStudioContext} from '../src/studio-core/context.ts';
function project(){const p=createProject({name:'Command test'});p.chunks['0:0']=emptyChunk(p.world,'0:0');p.chunks['1:0']=emptyChunk(p.world,'1:0');p.chunks['2:0']=emptyChunk(p.world,'2:0');return p;}

test('atomic transaction changes multiple chunks and keeps unrelated source references',()=>{
 const p=project(),bus=new CommandBus(p),a=p.chunks['0:0'],unrelated=p.chunks['2:0'];
 const patches=[bus.patch(['chunks','0:0','revision'],1),bus.patch(['chunks','1:0','revision'],2),bus.patch(['manifest','name'],'Edited')];
 bus.execute('Across records',patches,['0:0']);assert.equal(p.chunks['0:0'].revision,1);assert.equal(p.manifest.name,'Edited');
 assert.notEqual(p.chunks['0:0'],a);assert.equal(p.chunks['2:0'],unrelated);assert.equal(p.chunks['1:0'].revision,2);
 assert.ok(bus.undo());assert.equal(p.chunks['0:0'].revision,0);assert.equal(p.manifest.name,'Command test');assert.equal(p.chunks['1:0'].revision,0);
 assert.ok(bus.redo());assert.equal(p.chunks['0:0'].revision,1);
});
test('late patch conflict or validator failure leaves every source unchanged',()=>{
 const p=project(),bus=new CommandBus(p),before=structuredClone(p),original=p.chunks['0:0'];
 const first=bus.patch(['chunks','0:0','revision'],1),bad=bus.patch(['chunks','1:0','revision'],2);bad.before.value=999;
 assert.throws(()=>bus.execute('Failed move',[first,bad]),CommandConflictError);assert.deepEqual(p,before);assert.equal(p.chunks['0:0'],original);assert.equal(bus.canUndo,false);
 const validating=new CommandBus(p,()=>{throw Error('Reference invalid');});
 assert.throws(()=>validating.execute('Invalid move',[first]),/Reference invalid/);assert.deepEqual(p,before);
});
test('one continuous gesture is one compact reversible transaction; cancellation restores source',()=>{
 const p=project(),bus=new CommandBus(p);bus.begin('Drag');
 for(let i=1;i<=20;i++)bus.update(['chunks','0:0','revision'],i,['0:0']);
 assert.throws(()=>bus.serialize(),/incomplète/);const gesture=bus.commit();assert.equal(gesture.patches.length,1);
 assert.ok(bus.undo());assert.equal(p.chunks['0:0'].revision,0);assert.equal(bus.canUndo,false);
 assert.ok(bus.redo());bus.begin('Cancelled drag');bus.update(['manifest','name'],'Temporary');bus.cancel();assert.equal(p.manifest.name,'Command test');assert.equal(p.chunks['0:0'].revision,20);
});
test('journal survives serialized reload with undo/redo order and rejects incompatible state',()=>{
 const p=project(),bus=new CommandBus(p);bus.set('Rename',['manifest','name'],'One');bus.set('Rename again',['manifest','name'],'Two');bus.undo();
 const saved=JSON.parse(JSON.stringify(p)),journal=JSON.parse(JSON.stringify(bus.serialize()));
 const reloaded=new CommandBus(saved);reloaded.restore(journal);assert.ok(reloaded.redo());assert.equal(saved.manifest.name,'Two');assert.ok(reloaded.undo());assert.ok(reloaded.undo());assert.equal(saved.manifest.name,'Command test');
 const wrong=structuredClone(p);wrong.manifest.name='Other tab';assert.throws(()=>new CommandBus(wrong).restore(journal),JournalRecoveryError);
 const incompatible={...journal,schemaVersion:99};assert.throws(()=>new CommandBus(p).restore(incompatible),JournalRecoveryError);
});
test('history byte bound and unloaded source guards are enforced',()=>{
 const p=project(),bus=new CommandBus(p,undefined,{maxHistoryBytes:1500});
 for(let i=0;i<20;i++)bus.set('Name',['manifest','name'],`Name ${i}`);
 assert.ok(bus.historyBytes<=1500);assert.ok(bus.serialize().undo.length<20);
 assert.throws(()=>bus.set('Unloaded',['chunks','3:0','revision'],1),/non chargé/);
 assert.throws(()=>bus.patch(['libraries','__proto__','bad'],1),/non autorisé/);
 assert.throws(()=>bus.patch(['manifest','name'],NaN),/finies/);
});
test('selection context crosses modules and restores the exact camera/selection without changing authoring data',()=>{
 const p=project(),service=new SelectionService(defaultStudioContext(p.manifest.projectId,p.world.worldId));
 service.select({kind:'character',id:'miller'});service.setCamera({x:5,y:20,z:-56,mode:'orbit'});service.setChunk('0:0');service.openModule('dialogues');
 const saved=JSON.parse(JSON.stringify(service.snapshot()));const reload=new SelectionService(defaultStudioContext(p.manifest.projectId,p.world.worldId));reload.restore(saved);
 assert.equal(reload.state.selected.id,'miller');assert.equal(reload.state.activeModule,'dialogues');assert.deepEqual(reload.state.camera,{x:5,y:20,z:-56,mode:'orbit'});
 reload.openModule('terrain');assert.equal(reload.state.selected.id,'miller');assert.equal(reload.state.activeChunkId,'0:0');
 assert.throws(()=>reload.restore({...saved,projectId:'other'}),/autre projet/);
 const defensive=reload.state;defensive.camera.x=999;assert.equal(reload.state.camera.x,5);
});
