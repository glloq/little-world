import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CommandBus} from '../src/studio-core/commands.ts';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {putPath,removePath} from '../src/studio-core/source.ts';
import {putZone,removeZone,validateZone,polygonArea,selfIntersects} from '../src/studio-core/zones.ts';
import {lineChunkIds} from '../src/water/sectors.ts';
import {resampleLevels,riverWithPoints} from '../src/studio/world-features.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';

const square=(x,z,s)=>[{x,z},{x:x+s,z},{x:x+s,z:z+s},{x,z:z+s}];
test('zone contract: closed simple polygon inside the world, mines with 1–8 levels',()=>{
  const p=createProject({name:'Zones',width:1000,length:1000});
  assert.equal(polygonArea(square(0,0,10)),100);assert.equal(selfIntersects(square(0,0,10)),false);
  assert.equal(selfIntersects([{x:0,z:0},{x:10,z:10},{x:10,z:0},{x:0,z:10}]),true);
  validateZone({id:'z1',kind:'farm-plot',name:'Champ',polygon:square(0,0,20)},p.world);
  validateZone({id:'m1',kind:'mine',name:'Mine',polygon:square(50,50,10),levels:3},p.world);
  assert.throws(()=>validateZone({id:'m2',kind:'mine',name:'Mine',polygon:square(0,0,10)},p.world),/niveaux/);
  assert.throws(()=>validateZone({id:'z2',kind:'farm-plot',name:'X',polygon:[{x:0,z:0},{x:10,z:10},{x:10,z:0},{x:0,z:10}]},p.world),/croise/);
  assert.throws(()=>validateZone({id:'z3',kind:'farm-plot',name:'X',polygon:square(0,0,1)},p.world),/4 m²/);
  assert.throws(()=>validateZone({id:'z4',kind:'farm-plot',name:'X',polygon:square(495,0,20)},p.world),/hors du monde/);
  assert.throws(()=>validateZone({id:'z5',kind:'volcano',name:'X',polygon:square(0,0,20)},p.world),/type/);
});
test('zones are optional V3 library data: old projects stay valid, new ones round-trip and compile',async()=>{
  const old=parseProject(JSON.parse(await readFile(new URL('../maps/beta.project.json',import.meta.url),'utf8')));assert.equal(old.libraries.zones,undefined);
  const p=createProject({name:'Zones',width:1000,length:1000}),bus=new CommandBus(p);
  editDocument(bus,'Champ',[],d=>putZone(d,{id:'zone:a',kind:'farm-plot',name:'Champ',polygon:square(0,0,30)}));
  editDocument(bus,'Mine',[],d=>putZone(d,{id:'zone:b',kind:'mine',name:'Mine',polygon:square(100,100,20),levels:3}));
  assert.equal(Object.keys(parseProject(structuredClone(p)).libraries.zones).length,2);
  assert.deepEqual(readProjectArchive(writeProjectArchive(p)).libraries.zones,p.libraries.zones);
  const compiled=await compileProject(p,{resolveAsset:async()=>({hash:'0'.repeat(64),byteLength:100})});const logic=JSON.parse(compiled.files[compiled.manifest.logic.url]);
  assert.equal(logic.libraries.zones['zone:b'].levels,3,'compiled logic carries zones for future systems');
  bus.undo();assert.equal(p.libraries.zones['zone:b'],undefined);editDocument(bus,'Retirer',[],d=>removeZone(d,'zone:a'));assert.deepEqual(p.libraries.zones,{});
  const bad=structuredClone(p);bad.libraries.zones={'zone:x':{id:'zone:y',kind:'farm-plot',name:'X',polygon:square(0,0,30)}};assert.throws(()=>parseProject(bad),/ID différent/);
});
test('paths keep sector references through edit, move and removal (one transaction each)',()=>{
  const p=createProject({name:'Chemins',width:1000,length:1000}),bus=new CommandBus(p),path={id:'path:1',points:[{x:-200,z:0},{x:200,z:0}],width:3};
  editDocument(bus,'Tracer',lineChunkIds(p.world,path),d=>putPath(d,path));
  const refs=()=>Object.values(p.chunks).filter(c=>c.pathRefs.includes('path:1')).map(c=>c.chunkId).sort();
  assert.deepEqual(refs(),lineChunkIds(p.world,path).sort());assert.equal(toRuntimeWorld(p).paths.length,1);
  const moved={...path,points:[{x:-200,z:300},{x:200,z:300}]};editDocument(bus,'Déplacer',[...new Set([...lineChunkIds(p.world,path),...lineChunkIds(p.world,moved)])],d=>putPath(d,moved));
  assert.deepEqual(refs(),lineChunkIds(p.world,moved).sort());parseProject(structuredClone(p));
  editDocument(bus,'Supprimer',lineChunkIds(p.world,moved),d=>removePath(d,'path:1'));assert.deepEqual(refs(),[]);assert.equal(p.libraries.paths['path:1'],undefined);
  bus.undo();bus.undo();assert.deepEqual(refs(),lineChunkIds(p.world,path).sort());
});
test('editing river points keeps its profile; manual heights are resampled along the line',()=>{
  const before=[{x:0,z:0},{x:100,z:0}],after=[{x:0,z:0},{x:50,z:0},{x:100,z:0}];
  assert.deepEqual(resampleLevels([10,0],before,after),[10,5,0]);assert.deepEqual(resampleLevels([1,2,3],after,after),[1,2,3]);
  const river={id:'r',points:before,width:8,depth:2,level:4,profile:{mode:'manual',levels:[10,0]}};
  const next=riverWithPoints(river,after);assert.deepEqual(next.profile.levels,[10,5,0]);assert.equal(next.width,8);
  assert.deepEqual(riverWithPoints({...river,profile:{mode:'terrain',offset:-.35}},after).profile,{mode:'terrain',offset:-.35});
});
