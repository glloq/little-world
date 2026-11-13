import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,access,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createProject,emptyChunk,chunkAt} from '../src/studio-core/schema.ts';
import {entityIndexEntry,resolveEntity} from '../src/studio-core/references.ts';
import {projectToFiles,writeProjectArchive} from '../src/studio-core/archive.ts';
import {compileProject,preflightProject} from '../src/world-compiler/compile.ts';
import {parseCompiledManifest,loadCompiledChunk,loadCompiledManifest} from '../src/world-compiler/load.ts';
import {compileProjectToDirectory,localFileAssetResolver} from '../tools/compile-project.mjs';
import {hashText} from '../src/world-compiler/manifests.ts';

const resolver=localFileAssetResolver();
function addEntity(project,id,x,z,components={}){
 const ownerChunkId=chunkAt(project.world,x,z);
 if(!project.chunks[ownerChunkId]){
  const chunk=emptyChunk(project.world,ownerChunkId);project.chunks[ownerChunkId]=chunk;
  project.chunkIndex[ownerChunkId]={chunkId:ownerChunkId,cx:chunk.index.cx,cz:chunk.index.cz,revision:0,sourceRef:'world/chunks/'+ownerChunkId.replace(':','_')+'.json',dependencies:[]};
 }
 const entity={id,kind:'prop',name:id,ownerChunkId,components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'props.crate'},...components}};
 project.chunks[ownerChunkId].entities[id]=entity;project.chunks[ownerChunkId].entityIds.push(id);
 project.entityIndex[id]=entityIndexEntry(resolveEntity(project,entity));return entity;
}
function fixture(){
 const project=createProject({name:'Compiler fixture',width:400,length:600,projectId:'compiler-project',worldId:'compiler-world'});
 project.libraries.interactions.open={id:'open',trigger:{type:'onInteract',entityId:'lever'},repeat:'always',sequence:[{type:'setState',entityId:'door',key:'open',value:true}]};
 addEntity(project,'lever',-180,-280,{Interactable:{type:'Interactable',prompt:'Ouvrir',range:3,interactionIds:['open']}});
 addEntity(project,'door',-110,-280,{State:{type:'State',initial:{open:false}},Collider:{type:'Collider',shape:'box',size:{x:2,y:3,z:.3},layer:'solid'}});
 project.libraries.behaviors.idle={id:'idle',kind:'idle'};
 addEntity(project,'unrelated',-40,-280,{Navigation:{type:'Navigation',behaviorId:'idle',speed:1,radius:5}});
 return project;
}
function syncEntity(project,entity){project.entityIndex[entity.id]=entityIndexEntry(resolveEntity(project,entity));}
const compile=project=>compileProject(project,{resolveAsset:resolver});
async function temporary(run){const directory=await mkdtemp(join(tmpdir(),'little-world-compiler-'));try{await run(directory);}finally{await rm(directory,{recursive:true,force:true});}}

test('V3 compilation is deterministic, separate from source and emits truthful per-chunk runtime/collision/nav descriptors',async()=>{
 const source=fixture(),before=structuredClone(source),a=await compile(source),b=await compile(source);
 assert.deepEqual(source,before);assert.deepEqual(a.files,b.files);
 assert.equal(a.manifest.kind,'compiled-world');assert.equal(a.manifest.chunks.length,3);
 assert.deepEqual(a.manifest.capabilities,{bakedMeshes:false,bakedLOD:false,navigation:'source-descriptors',collisions:'source-descriptors',sparseSourceChunks:true});
 const door=a.manifest.chunks.find(c=>c.entityIds.includes('door'));
 const payload=JSON.parse(a.files[door.url]);assert.equal(payload.collision.shapes.length,1);assert.equal(payload.collision.shapes[0].entityId,'door');
 const other=a.manifest.chunks.find(c=>c.entityIds.includes('unrelated'));
 assert.equal(JSON.parse(a.files[other.url]).navigation.agents[0].entityId,'unrelated');
 for(const descriptor of a.manifest.chunks)assert.equal(await hashText(a.files[descriptor.url]),descriptor.hash);
 assert.equal(parseCompiledManifest(a.manifest).worldId,source.world.worldId);
});
test('incremental disk compilation preserves unchanged mtime/hash and invalidates cross-chunk entity/action dependencies',async()=>temporary(async directory=>{
 const project=fixture(),output=join(directory,'runtime'),first=await compileProjectToDirectory(project,output);
 const untouched=first.manifest.chunks.find(c=>c.entityIds.includes('unrelated'));
 const untouchedFile=join(output,untouched.url),before=await stat(untouchedFile,{bigint:true});
 const noop=await compileProjectToDirectory(project,output);assert.deepEqual(noop.written,[]);assert.deepEqual(noop.rebuiltChunkIds,[]);
 const door=project.chunks[project.entityIndex.door.ownerChunkId].entities.door;door.components.State.initial.open=true;syncEntity(project,door);
 const changed=await compileProjectToDirectory(project,output);
 assert.deepEqual(new Set(changed.rebuiltChunkIds),new Set([project.entityIndex.door.ownerChunkId,project.entityIndex.lever.ownerChunkId]));
 const next=changed.manifest.chunks.find(c=>c.chunkId===untouched.chunkId);assert.equal(next.hash,untouched.hash);assert.equal(next.url,untouched.url);
 assert.equal((await stat(untouchedFile,{bigint:true})).mtimeNs,before.mtimeNs);
 project.libraries.interactions.open.sequence.push({type:'showText',text:'Ouvert'});
 const action=await compileProjectToDirectory(project,output);assert.deepEqual(action.rebuiltChunkIds,[project.entityIndex.lever.ownerChunkId]);
}));
test('canonical border terrain overrides are emitted once per affected chunk in source order',async()=>{
 const project=fixture(),edit={id:'border-stroke',x:-136,z:-280,radius:10,strength:2,height:0,mode:'raise',order:0};
 project.chunks['1:0'].terrainEdits.push(edit);
 for(const id of ['0:0','1:0']){project.chunks[id].terrainRefs.push(edit.id);project.chunkIndex[id].terrainOwners={[edit.id]:'1:0'};}
 project.chunkIndex['0:0'].dependencies.push('1:0');
 const first=await compile(project);
 for(const id of ['0:0','1:0']){
  const descriptor=first.manifest.chunks.find(c=>c.chunkId===id),data=JSON.parse(first.files[descriptor.url]);
  assert.deepEqual(data.terrain.edits,[edit]);
 }
 edit.strength=3;const next=await compileProject(project,{resolveAsset:resolver,previous:first.manifest});
 assert.deepEqual(new Set(next.rebuiltChunkIds),new Set(['0:0','1:0']));
});
test('strict preflight rejects missing source/ref/asset and writes nothing on failure',async()=>temporary(async directory=>{
 const cases=[];
 const missing=fixture();delete missing.chunks['1:0'];cases.push(missing);
 const ref=fixture();ref.libraries.interactions.open.sequence[0].entityId='missing-door';cases.push(ref);
 const asset=fixture();asset.assets['props.crate'].file='models/missing.glb';cases.push(asset);
 for(let i=0;i<cases.length;i++){
  const output=join(directory,'invalid-'+i);await assert.rejects(compileProjectToDirectory(cases[i],output));await assert.rejects(access(output));
 }
 const unchecked=await preflightProject(fixture());assert.ok(unchecked.diagnostics.some(d=>d.code==='ASSET_UNVERIFIED'));
}));
test('maximum 10 km bounds compile sparsely without allocating theoretical empty grid cells',async()=>{
 const project=createProject({name:'Sparse 100 km2',width:10000,length:10000,projectId:'sparse',worldId:'sparse-world'});
 addEntity(project,'far-object',4990,4990);
 const compiled=await compile(project);assert.equal(compiled.manifest.chunks.length,1);assert.equal(Object.keys(compiled.files).length,3);
 assert.ok(JSON.stringify(compiled.manifest).length<10000);assert.ok(Object.values(compiled.files).join('').length<20000);
 assert.equal(compiled.manifest.bounds.maxX-compiled.manifest.bounds.minX,10000);
});
test('CLI accepts portable ZIP and source directory and writes matching static file packages',async()=>temporary(async directory=>{
 const project=fixture(),source=join(directory,'source'),files=projectToFiles(project);
 for(const [path,text]of Object.entries(files)){const destination=join(source,path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,text);}
 const archive=join(directory,'source.zip');await writeFile(archive,writeProjectArchive(project));
 const fromDirectory=await compileProjectToDirectory(source,join(directory,'directory-build'));
 const fromArchive=await compileProjectToDirectory(archive,join(directory,'archive-build'));
 assert.deepEqual(fromDirectory.manifest,fromArchive.manifest);
 assert.equal(JSON.parse(await readFile(join(directory,'archive-build','manifest.json'),'utf8')).kind,'compiled-world');
}));
test('runtime manifest/chunk loaders use relative local URLs and reject corrupt chunks before use',async()=>{
 const compiled=await compile(fixture()),base='https://example.test/little-world/maps/build/manifest.json',requests=[];
 const fetcher=async url=>{requests.push(String(url));const key=new URL(url).pathname.split('/maps/build/')[1];return new Response(compiled.files[key]??'',{status:compiled.files[key]?200:404});};
 const manifest=await loadCompiledManifest(base,fetcher),descriptor=manifest.chunks[0];
 const chunk=await loadCompiledChunk(base,manifest,descriptor.chunkId,fetcher);assert.equal(chunk.chunkId,descriptor.chunkId);
 assert.ok(requests[1].startsWith('https://example.test/little-world/maps/build/chunks/'));
 compiled.files[descriptor.url]+=' ';await assert.rejects(loadCompiledChunk(base,manifest,descriptor.chunkId,fetcher),/hash\/size/);
 const invalid=structuredClone(manifest);invalid.chunks[0].url='../secret.json';assert.throws(()=>parseCompiledManifest(invalid),/chunk descriptor/);
});
