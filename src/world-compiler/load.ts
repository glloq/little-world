import {parseEnvironmentDefinition} from '../environment/climate.ts';
import {parseComponents} from '../studio-core/schema.ts';
import {hashText,utf8Bytes,type CompiledChunkData,type CompiledChunkDescriptor,type CompiledWorldManifest} from './manifests.ts';
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200;
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const local=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_./-]+\.json$/.test(v)&&!v.startsWith('/')&&!v.split('/').some(s=>!s||s==='.'||s==='..');
function bounds(v:unknown){return record(v)&&['minX','maxX','minZ','maxZ'].every(key=>number(v[key],-100000,100000))&&number((v.maxX as number)-(v.minX as number),1,10000)&&number((v.maxZ as number)-(v.minZ as number),1,10000);}
export function parseCompiledManifest(value:unknown):CompiledWorldManifest {
 if(!record(value)||value.schemaVersion!==1||value.kind!=='compiled-world'||value.coordinateSystem!=='meters-y-up'||!text(value.worldId)||!text(value.projectId)||!text(value.compilerVersion)||!text(value.buildVersion)||!hash(value.sourceHash)||!bounds(value.bounds)||!number(value.seed,1,9999999)||!text(value.generatorVersion)||!number(value.seaLevel,-20,20)||!number(value.chunkSizeM,16,512))throw Error('Invalid compiled world manifest');
 if(value.environment!==undefined)parseEnvironmentDefinition(value.environment);
 if(!record(value.capabilities)||value.capabilities.bakedMeshes!==false||value.capabilities.bakedLOD!==false||value.capabilities.navigation!=='source-descriptors'||value.capabilities.collisions!=='source-descriptors'||value.capabilities.sparseSourceChunks!==true)throw Error('Unsupported compiled world capabilities');
 if(!Array.isArray(value.chunks)||value.chunks.length>30000||!Array.isArray(value.entityIndex)||value.entityIndex.length>100000||!Array.isArray(value.assets)||value.assets.length>10000||!record(value.logic)||!local(value.logic.url)||!hash(value.logic.hash)||!number(value.logic.byteLength,1,16*1024*1024))throw Error('Invalid compiled world index');
 const ids=new Set<string>();
 for(const chunk of value.chunks){
  if(!record(chunk)||!text(chunk.chunkId)||ids.has(chunk.chunkId)||!Number.isInteger(chunk.cx)||!Number.isInteger(chunk.cz)||!number(chunk.cx,0,1000)||!number(chunk.cz,0,1000)||!bounds(chunk.bounds)||!local(chunk.url)||!hash(chunk.hash)||!hash(chunk.sourceHash)||!number(chunk.byteLength,1,16*1024*1024)||!Array.isArray(chunk.entityIds)||chunk.entityIds.length>5000||!chunk.entityIds.every(text)||!Array.isArray(chunk.dependencies)||chunk.dependencies.length>100000||!chunk.dependencies.every(text))throw Error('Invalid compiled chunk descriptor');
  ids.add(chunk.chunkId);
 }
 const entityIds=new Set<string>();
 for(const entity of value.entityIndex){if(!record(entity)||!text(entity.id)||entityIds.has(entity.id)||!text(entity.kind)||!text(entity.ownerChunkId)||!ids.has(entity.ownerChunkId)||!local(entity.chunkUrl))throw Error('Invalid compiled entity locator');entityIds.add(entity.id);}
 return structuredClone(value) as unknown as CompiledWorldManifest;
}
function relativeURL(manifestURL:string,path:string):URL {
 if(!local(path))throw Error('Unsafe compiled resource URL');
 const base=new URL(manifestURL,globalThis.location?.href??'http://localhost/'),url=new URL(path,base);
 if(url.origin!==base.origin)throw Error('External compiled resource URL');return url;
}
async function readJSON(url:URL,fetcher:typeof fetch,expected?:{hash:string;byteLength:number}):Promise<unknown>{
 const response=await fetcher(url);if(!response.ok)throw Error(`HTTP ${response.status}: ${url.pathname}`);
 const content=await response.text();
 if(utf8Bytes(content)>16*1024*1024)throw Error('Compiled resource exceeds 16 MiB');
 if(expected&&(utf8Bytes(content)!==expected.byteLength||await hashText(content)!==expected.hash))throw Error('Compiled resource hash/size mismatch');
 return JSON.parse(content);
}
export async function loadCompiledManifest(url:string,fetcher:typeof fetch=fetch):Promise<CompiledWorldManifest>{
 const address=new URL(url,globalThis.location?.href??'http://localhost/');
 return parseCompiledManifest(await readJSON(address,fetcher));
}
export async function loadCompiledChunk(manifestURL:string,manifest:CompiledWorldManifest,chunkId:string,fetcher:typeof fetch=fetch):Promise<CompiledChunkData>{
 const descriptor=manifest.chunks.find(chunk=>chunk.chunkId===chunkId);if(!descriptor)throw Error('Compiled chunk is absent: '+chunkId);
 const value=await readJSON(relativeURL(manifestURL,descriptor.url),fetcher,descriptor);
 return parseCompiledChunk(value,manifest,descriptor);
}
export function parseCompiledChunk(value:unknown,manifest:CompiledWorldManifest,descriptor:CompiledChunkDescriptor):CompiledChunkData {
 if(!record(value)||value.schemaVersion!==1||value.kind!=='compiled-chunk'||value.worldId!==manifest.worldId||value.chunkId!==descriptor.chunkId||!bounds(value.bounds)||!Array.isArray(value.entities)||value.entities.length>5000||!record(value.terrain)||value.terrain.mode!=='procedural-with-ordered-overrides'||!Array.isArray(value.terrain.edits)||value.terrain.edits.length>10000||!record(value.biomes)||!Array.isArray(value.biomes.edits)||value.biomes.edits.length>10000||!Array.isArray(value.water)||!Array.isArray(value.paths)||!record(value.collision)||value.collision.mode!=='analytic-terrain-and-shape-descriptors'||!record(value.navigation)||value.navigation.mode!=='agent-and-path-descriptors'||!record(value.dependencyHashes))throw Error('Invalid compiled chunk payload');
 const ids=new Set<string>();
 for(const entity of value.entities){if(!record(entity)||!text(entity.id)||ids.has(entity.id)||entity.ownerChunkId!==descriptor.chunkId||!descriptor.entityIds.includes(entity.id))throw Error('Invalid compiled entity');parseComponents(entity.components);ids.add(entity.id);}
 if(ids.size!==descriptor.entityIds.length)throw Error('Compiled chunk/entity index mismatch');
 for(const [id,digest] of Object.entries(value.dependencyHashes))if(!text(id)||!hash(digest))throw Error('Invalid compiled dependency hash');
 return structuredClone(value) as unknown as CompiledChunkData;
}
