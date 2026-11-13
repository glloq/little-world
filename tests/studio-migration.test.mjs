import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrateWorldToV3,toRuntimeWorld} from '../src/studio-core/migration.ts';
import {parseProject,createProject,chunkAt} from '../src/studio-core/schema.ts';
import {writeProjectArchive,readProjectArchive,writeFilesArchive} from '../src/studio-core/archive.ts';
import {putTerrainEdit} from '../src/studio-core/source.ts';
const reference=JSON.parse(await readFile(new URL('../maps/default.json',import.meta.url),'utf8'));
test('real V2 reference migrates purely with stable IDs and complete runtime roundtrip',()=>{
 const source=structuredClone(reference),before=structuredClone(source);
 const a=migrateWorldToV3(source),b=migrateWorldToV3(source);
 assert.deepEqual(source,before);assert.deepEqual(a,b);
 assert.deepEqual(toRuntimeWorld(a.project),source);
 assert.deepEqual(Object.keys(a.project.entityIndex).sort(),source.npcs.map(n=>n.id).sort());
 assert.deepEqual(readProjectArchive(writeProjectArchive(a.project)),a.project);
});
test('V1 preserves placement without injecting demo NPCs and input remains independent',()=>{
 const source={schemaVersion:1,config:{seed:42,density:.5},placements:[{id:'pine-original',assetId:'nature.pine',x:-24,z:-183,rotation:.7,scale:1.2}]};
 const before=structuredClone(source),{project}=migrateWorldToV3(source),runtime=toRuntimeWorld(project);
 assert.deepEqual(source,before);assert.equal(runtime.npcs.length,0);assert.equal(runtime.placements[0].id,'pine-original');
 assert.ok(Math.abs(runtime.placements[0].rotation-.7)<1e-10);assert.equal(runtime.config.seed,42);
 project.chunks[chunkAt(project.world,-24,-183)].entities['pine-original'].name='renamed';assert.deepEqual(source,before);
});
test('cross-sector strokes keep one canonical source, order and portable references',()=>{
 const p=createProject({name:'Boundary',width:1000,length:1000});
 putTerrainEdit(p,{id:'edge',x:-436,z:-436,radius:20,strength:2,mode:'raise',height:0,order:0});
 const parsed=parseProject(p),chunks=Object.values(parsed.chunks);
 assert.equal(chunks.reduce((n,c)=>n+c.terrainEdits.length,0),1);assert.ok(chunks.filter(c=>c.terrainRefs.includes('edge')).length>=4);
 assert.deepEqual(readProjectArchive(writeProjectArchive(parsed)),parsed);
 const broken=structuredClone(parsed);delete broken.chunks[Object.keys(broken.chunks)[0]];assert.throws(()=>parseProject(broken));
});
test('V3 validates bounds independently and archive rejects traversal and damaged data',()=>{
 const p=createProject({name:'Large sparse',width:10000,length:10000});assert.equal(Object.keys(parseProject(p).chunks).length,0);
 assert.throws(()=>writeFilesArchive({'../escape.json':'{}'}));
 const archive=writeProjectArchive(p);archive[30+new DataView(archive.buffer).getUint16(26,true)]^=1;assert.throws(()=>readProjectArchive(archive));
 const malformed=structuredClone(p);malformed.world.bounds.maxX=Infinity;assert.throws(()=>parseProject(malformed));
});
