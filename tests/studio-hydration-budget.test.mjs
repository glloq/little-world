import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,chunkAt} from '../src/studio-core/schema.ts';
import {ensureChunk} from '../src/studio-core/source.ts';
import {StudioSession} from '../src/studio/session.ts';
import {defaultStudioContext} from '../src/studio-core/context.ts';
test('hydrated author cache is bounded without losing pinned visible chunks',()=>{
  const p=createProject({name:'Hydration bounds',width:1000,length:1000}),ids=[];
  for(let i=0;i<15;i++){const id=chunkAt(p.world,-400+i*55,0);if(ids.includes(id))continue;ids.push(id);ensureChunk(p,id);}
  const s=new StudioSession({}, {document:p,revision:0,context:defaultStudioContext(p.manifest.projectId,p.manifest.worldId),journal:null});
  const keep=new Set([ids[0],ids[1]]);
  const removed=s.compactHydrated(keep,4);
  assert.equal(Object.keys(p.chunks).length,4);
  assert.ok(removed>0);
  assert.ok(p.chunks[ids[0]]&&p.chunks[ids[1]]);
  assert.ok(s.compactHydrated(new Set(),4)===0);
});
