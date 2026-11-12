import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileMap} from '../tools/compile-map.mjs';
import {defaultWorld,parseWorld} from '../src/world-data.ts';
test('compiler produces a reloadable static map and stable bounded chunk manifest',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'little-world-compile-'));
 try{
  const input=join(dir,'source.json'),output=join(dir,'public','map.json'),source=defaultWorld();source.config.width=1000;source.config.length=1000;
  await writeFile(input,JSON.stringify(source));const result=await compileMap(input,output);
  assert.deepEqual(parseWorld(JSON.parse(await readFile(output,'utf8'))),source);
  const manifest=JSON.parse(await readFile(output.replace('.json','.chunks.json'),'utf8'));
  assert.equal(manifest.chunks.length,256);assert.equal(result.chunks,256);assert.equal(new Set(manifest.chunks.map(c=>c.id)).size,256);
  assert.ok(manifest.chunks.every(c=>c.minX>=-500&&c.maxX<=500&&c.minZ>=-500&&c.maxZ<=500));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('compiler rejects untrusted malformed sources before writing output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'little-world-reject-'));
 try{const input=join(dir,'bad.json'),output=join(dir,'map.json');const source=defaultWorld();source.placements=[null];await writeFile(input,JSON.stringify(source));await assert.rejects(compileMap(input,output),/Objets/);await assert.rejects(access(output));}
 finally{await rm(dir,{recursive:true,force:true});}
});
