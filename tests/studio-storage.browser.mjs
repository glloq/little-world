import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const base=(process.argv[2]??'http://127.0.0.1:5189/little-world/').replace(/\/?$/,'/');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(base+'assets/catalog.json');
 const result=await page.evaluate(async(base)=>{
  const {createProject,emptyChunk}=await import(base+'src/studio-core/schema.ts');
  const {ProjectStore}=await import(base+'src/studio-core/project-store.ts');
  const {CommandBus}=await import(base+'src/studio-core/commands.ts');
  const {defaultStudioContext}=await import(base+'src/studio-core/context.ts');
  let checks=0;const verify=(ok,message)=>{if(!ok)throw Error(message);checks++;};
  const dbName='little-world-studio-v3-storage-test-'+crypto.randomUUID(),store=new ProjectStore(dbName);
  try{
   const document=createProject({name:'Storage test',width:10000,length:10000});
   for(const id of ['0:0','1:0']){const [cx,cz]=id.split(':').map(Number);document.chunkIndex[id]={chunkId:id,cx,cz,revision:0,sourceRef:`world/chunks/${cx}_${cz}.json`,dependencies:[]};document.chunks[id]=emptyChunk(document.world,id);}
   const bus=new CommandBus(document),context=defaultStudioContext(document.manifest.projectId,document.world.worldId);context.activeChunkId='0:0';context.activeModule='terrain';
   const created=await store.create(document,{context,journal:bus.serialize()});
   const initialCheckpoint=created.checkpointId;
   verify((await store.loadProject(document.manifest.projectId)).document.chunks&&Object.keys((await store.loadProject(document.manifest.projectId)).document.chunks).length===0,'Header eagerly loaded chunks');
   bus.execute('Atomic two-sector edit',[bus.patch(['chunks','0:0','revision'],1),bus.patch(['chunks','1:0','revision'],1)],['0:0','1:0']);
   let revision=await store.saveChanges(document,['0:0','1:0'],{expectedRevision:0,context,journal:bus.serialize(),checkpoint:true});verify(revision===1,'revision increment');
   const head=await store.loadProject(document.manifest.projectId);Object.assign(head.document.chunks,await store.loadChunks(document.manifest.projectId,['0:0','1:0']));
   const restored=new CommandBus(head.document);restored.restore(head.journal);verify(restored.undo(),'Undo was lost on reload');verify(head.document.chunks['0:0'].revision===0&&head.document.chunks['1:0'].revision===0,'Cross-chunk undo mismatch');
   let conflict=false;try{await store.saveChanges(head.document,['0:0'],{expectedRevision:0});}catch(error){conflict=error.constructor.name==='ProjectRevisionError';}verify(conflict,'Stale revision accepted');
   verify((await store.loadChunks(document.manifest.projectId,['0:0']))['0:0'].revision===1,'Conflict modified source');
   const corruptJournal={...bus.serialize(),notSerializable:()=>{}};let failed=false;
   try{await store.saveChanges(head.document,['0:0','1:0'],{expectedRevision:1,journal:corruptJournal});}catch{failed=true;}verify(failed,'Invalid DB payload unexpectedly accepted');
   verify((await store.loadProject(document.manifest.projectId)).revision===1,'Failed write changed header');verify((await store.loadChunks(document.manifest.projectId,['0:0']))['0:0'].revision===1,'Failed write partially changed chunks');
   const recovered=await store.loadCheckpoint(document.manifest.projectId,initialCheckpoint);verify(recovered.document.chunks['0:0'].revision===0,'Initial checkpoint lost');
   revision=await store.saveChanges(head.document,['0:0','1:0'],{expectedRevision:1,journal:restored.serialize(),checkpoint:true});verify(revision===2,'Checkpoint save failed');
   const final=await store.loadAll(document.manifest.projectId);verify(final.document.chunks['0:0'].revision===0,'Latest source restore failed');verify(final.context.activeModule==='terrain','Context lost');
   const second=createProject({name:'Independent project'});await store.create(second);verify((await store.list()).length===2,'Multiproject storage failed');
   const quotaProbe=new ProjectStore(dbName);verify((await quotaProbe.loadProject(document.manifest.projectId)).document.manifest.name==='Storage test','Reopening database failed');await quotaProbe.close();
   let staleRead=false;try{await store.loadChunks(document.manifest.projectId,['0:0'],1);}catch(error){staleRead=error.constructor.name==='ProjectRevisionError';}verify(staleRead,'Lazy read mixed an old header with newer source');verify((await store.loadChunks(document.manifest.projectId,['0:0'],2))['0:0'].revision===0,'Current snapshot could not hydrate');
   const legacyName=dbName+'-legacy',legacy=createProject({name:'Version one project'}),legacyId=legacy.manifest.projectId;legacy.chunkIndex['0:0']={chunkId:'0:0',cx:0,cz:0,revision:0,sourceRef:'world/chunks/0_0.json',dependencies:[]};legacy.chunks['0:0']=emptyChunk(legacy.world,'0:0');
   const oldDB=await new Promise((resolve,reject)=>{const r=indexedDB.open(legacyName,1);r.onupgradeneeded=()=>{for(const name of ['projects','chunks','journals','contexts','checkpoints','checkpointChunks'])r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const {chunks:_,...legacyHeader}=legacy;await new Promise((resolve,reject)=>{const tx=oldDB.transaction(['projects','chunks'],'readwrite');tx.objectStore('projects').put({document:legacyHeader,revision:0,updatedAt:Date.now(),checkpointId:null},legacyId);tx.objectStore('chunks').put({projectId:legacyId,chunkId:'0:0',source:legacy.chunks['0:0']},[legacyId,'0:0']);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});oldDB.close();
   const upgraded=new ProjectStore(legacyName);try{const header=await upgraded.loadProject(legacyId);verify(header.document.manifest.name==='Version one project','V1 IndexedDB header lost on index upgrade');verify((await upgraded.loadChunks(legacyId,['0:0'],0))['0:0'].chunkId==='0:0','V1 source lost on index upgrade');await upgraded.saveChanges(header.document,[],{expectedRevision:0});let rejected=false;try{await upgraded.loadChunks(legacyId,['0:0'],0);}catch(error){rejected=error.constructor.name==='ProjectRevisionError';}verify(rejected,'Migrated revision index was not updated atomically');}finally{await upgraded.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(legacyName);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}
   return {checks,projects:2,revision,restoredContext:final.context.activeModule};
  }finally{await store.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(dbName);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}
 },base);
 assert.equal(result.revision,2);console.log(JSON.stringify(result));
}finally{await browser.close();}
