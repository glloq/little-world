import {defaultEnvironment} from '../environment/climate.ts';
import {createCompileContext,compileChunkData,dependencyIds,compiledChunkBounds} from './chunks.ts';
import {preflightProject,ProjectCompilationError,type CompileOptions} from './validate.ts';
import {COMPILER_VERSION,canonicalJSON,hashText,jsonFile,utf8Bytes,type CompileResult,type CompiledWorldManifest} from './manifests.ts';

/** Compile sparse source chunks to independently cacheable static JSON resources.
 * No work scales with the number of theoretical empty grid cells.
 */
export async function compileProject(input:unknown,options:CompileOptions={}):Promise<CompileResult>{
  const checked=await preflightProject(input,options);
  if(!checked.project||checked.diagnostics.some(d=>d.severity==='ERROR'))throw new ProjectCompilationError(checked.diagnostics);
  const project=checked.project,context=await createCompileContext(project,checked.assets);
  const sourceHash=await hashText(canonicalJSON({compiler:COMPILER_VERSION,project:{...project,manifest:{...project.manifest,revision:0}},assets:checked.assets}));
  const spatialWorld={bounds:project.world.bounds,seed:project.world.seed,generatorVersion:project.world.generatorVersion,density:project.world.density,seaLevel:project.world.seaLevel,chunkSizeM:project.world.chunkSizeM,coordinateSystem:project.world.coordinateSystem};
  const files:Record<string,string>={},chunks:CompiledWorldManifest['chunks']=[],rebuiltChunkIds:string[]=[];
  const previous=new Map((options.previous?.worldId===project.world.worldId?options.previous.chunks:[]).map(chunk=>[chunk.chunkId,chunk]));
  for(const metadata of Object.values(project.chunkIndex).sort((a,b)=>a.cz-b.cz||a.cx-b.cx)){
    const source=project.chunks[metadata.chunkId],ids=dependencyIds(context,source);
    const data=compileChunkData(context,source,ids),text=jsonFile(data),hash=await hashText(text);
    const chunkSourceHash=await hashText(canonicalJSON({compiler:COMPILER_VERSION,source,world:spatialWorld,dependencies:data.dependencyHashes}));
    const url=`chunks/${metadata.cx}_${metadata.cz}.${hash.slice(0,16)}.json`;
    files[url]=text;
    chunks.push({chunkId:source.chunkId,cx:metadata.cx,cz:metadata.cz,bounds:compiledChunkBounds(project,metadata.cx,metadata.cz),url,hash,sourceHash:chunkSourceHash,
      byteLength:utf8Bytes(text),entityIds:[...source.entityIds].sort(),dependencies:ids});
    if(previous.get(source.chunkId)?.sourceHash!==chunkSourceHash||previous.get(source.chunkId)?.hash!==hash)rebuiltChunkIds.push(source.chunkId);
  }
  const chunkURLs=new Map(chunks.map(chunk=>[chunk.chunkId,chunk.url]));
  const initialStates:Record<string,unknown>={};
  for(const chunk of Object.values(project.chunks))for(const entity of Object.values(chunk.entities)){
    const resolved=context.definitions.get(entity.id) as {components:{State?:unknown;Persistence?:unknown}};
    if(resolved.components.State||resolved.components.Persistence)initialStates[entity.id]={state:resolved.components.State??null,persistence:resolved.components.Persistence??null};
  }
  const logicText=jsonFile({schemaVersion:1,kind:'compiled-logic',worldId:project.world.worldId,libraries:project.libraries,entityIndex:project.entityIndex,initialStates});
  const logicHash=await hashText(logicText),logicURL=`logic.${logicHash.slice(0,16)}.json`;files[logicURL]=logicText;
  const manifest:CompiledWorldManifest={schemaVersion:1,kind:'compiled-world',compilerVersion:COMPILER_VERSION,
    ...(project.world.audio?{audio:project.world.audio}:{}),environment:project.world.environment??defaultEnvironment(project.world.seed),projectId:project.manifest.projectId,worldId:project.world.worldId,sourceHash,buildVersion:COMPILER_VERSION+'-'+sourceHash.slice(0,16),
    bounds:project.world.bounds,seed:project.world.seed,generatorVersion:project.world.generatorVersion,seaLevel:project.world.seaLevel,chunkSizeM:project.world.chunkSizeM,
    coordinateSystem:'meters-y-up',chunks,entityIndex:Object.values(project.entityIndex).sort((a,b)=>a.id.localeCompare(b.id)).map(entity=>({id:entity.id,kind:entity.kind,ownerChunkId:entity.ownerChunkId,chunkUrl:chunkURLs.get(entity.ownerChunkId)!})),
    logic:{url:logicURL,hash:logicHash,byteLength:utf8Bytes(logicText)},assets:checked.assets,
    capabilities:{bakedMeshes:false,bakedLOD:false,navigation:'source-descriptors',collisions:'source-descriptors',sparseSourceChunks:true}};
  files['manifest.json']=jsonFile(manifest);
  return {manifest,files,rebuiltChunkIds,diagnostics:checked.diagnostics};
}
export {preflightProject,ProjectCompilationError} from './validate.ts';
export {fetchAssetResolver} from './assets.ts';
export type {CompileOptions} from './validate.ts';
export type {CompileResult,CompiledWorldManifest,CompiledChunkData} from './manifests.ts';
