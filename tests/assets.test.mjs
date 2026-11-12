import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import catalog from '../assets/catalog.json' with { type: 'json' };

test('GLB assets have valid glTF 2.0 headers and referenced meshes',async()=>{
 const ids=new Set();
 for(const a of catalog.assets){
  assert.ok(!ids.has(a.id),'duplicate asset ID '+a.id);ids.add(a.id);
  if(a.type!=='glb')continue;
  assert.ok(typeof a.file==='string' && a.file.startsWith('models/'));
  const bytes=await readFile(new URL('../public/'+a.file,import.meta.url));
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  assert.equal(data.getUint32(0,true),0x46546c67);
  assert.equal(data.getUint32(4,true),2);
  assert.equal(data.getUint32(8,true),bytes.byteLength);
  const jsonLen=data.getUint32(12,true);
  assert.equal(data.getUint32(16,true),0x4e4f534a);
  const json=JSON.parse(bytes.subarray(20,20+jsonLen).toString('utf8'));
  assert.equal(json.asset.version,'2.0');
  assert.ok(json.meshes.length>0);
  const binOffset=20+jsonLen;
  assert.equal(data.getUint32(binOffset+4,true),0x004e4942);
  const binLen=data.getUint32(binOffset,true);
  assert.ok(binOffset+8+binLen<=bytes.byteLength);
  for(const view of json.bufferViews)assert.ok((view.byteOffset??0)+view.byteLength<=binLen);
 }
});
