#!/usr/bin/env node
/** Node.js 22. Source ZIP/file map/directory -> static runtime data descriptors. */
import {readFile,writeFile,mkdir,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {projectFromFiles,readProjectArchive} from '../src/studio-core/archive.ts';
import {parseManifest} from '../src/studio-core/schema.ts';
import {compileProject} from '../src/world-compiler/compile.ts';

const defaultPublic=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const safePath=path=>typeof path==='string'&&/^[a-zA-Z0-9_./-]+\.json$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(part=>part==='..'||part==='.'||part==='');
async function boundedRead(path,max=16*1024*1024){const info=await stat(path);if(!info.isFile()||info.size>max)throw Error('Invalid or oversized source file: '+path);return readFile(path);}
async function insideRead(root,path){
 if(!safePath(path))throw Error('Unsafe source path: '+path);
 const location=await realpath(resolve(root,path)),rel=relative(root,location);
 if(rel.startsWith('..'+sep)||rel==='..'||resolve(location)===root)throw Error('Source escapes project directory');
 return (await boundedRead(location)).toString('utf8');
}
export async function readProjectSource(input){
 const location=resolve(input),info=await stat(location);
 if(info.isDirectory()){
  const root=await realpath(location),files=Object.create(null);
  files['project.json']=await insideRead(root,'project.json');
  const manifest=parseManifest(JSON.parse(files['project.json'])),refs=manifest.sourceManifest;
  for(const ref of Object.values(refs))files[ref]=await insideRead(root,ref);
  const index=JSON.parse(files[refs.chunkIndexRef]);
  if(!index||typeof index!=='object'||Array.isArray(index)||Object.keys(index).length>30000)throw Error('Invalid source chunk index');
  for(const metadata of Object.values(index)){
   if(!metadata||!safePath(metadata.sourceRef))throw Error('Invalid chunk source path');
   files[metadata.sourceRef]=await insideRead(root,metadata.sourceRef);
  }
  return projectFromFiles(files);
 }
 const bytes=await boundedRead(location,128*1024*1024);
 if(bytes[0]===0x50&&bytes[1]===0x4b)return readProjectArchive(new Uint8Array(bytes));
 if(bytes.length>16*1024*1024)throw Error('JSON input exceeds 16 MiB; use a project directory or ZIP archive');
 const data=JSON.parse(bytes.toString('utf8'));
 return data&&typeof data==='object'&&typeof data['project.json']==='string'?projectFromFiles(data):data;
}
export function localFileAssetResolver(publicDirectory=defaultPublic){
 return async asset=>{
  if(!asset.file||!/^models\/[a-zA-Z0-9_./-]+\.glb$/.test(asset.file)||asset.file.split('/').some(part=>part==='..'||part==='.'||part===''))throw Error('Invalid local GLB path');
  const root=await realpath(publicDirectory),location=await realpath(resolve(root,asset.file)),rel=relative(root,location);
  if(rel.startsWith('..'+sep)||rel==='..')throw Error('Asset escapes public directory');
  const bytes=await boundedRead(location,20_000_000);
  if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB header');
  return {hash:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length};
 };
}
/** Writes content-addressed files unchanged when identical. Manifest commits last.
 * Old content-addressed outputs are retained so in-flight clients keep valid URLs.
 */
export async function compileProjectToDirectory(input,output,options={}){
 const source=typeof input==='string'?await readProjectSource(input):input;
 const directory=resolve(output);
 let previous;
 try{previous=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));}
 catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
 const result=await compileProject(source,{resolveAsset:options.resolveAsset??localFileAssetResolver(options.publicDirectory),previous});
 // No output directory or file is touched until every source/ref/asset has passed.
 const paths=Object.keys(result.files).sort((a,b)=>a==='manifest.json'?1:b==='manifest.json'?-1:a.localeCompare(b));
 const written=[],unchanged=[];
 for(const path of paths){
  const destination=resolve(directory,path),text=result.files[path];
  let existing;try{existing=await readFile(destination,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing===text){unchanged.push(path);continue;}
  await mkdir(dirname(destination),{recursive:true});await writeFile(destination,text);written.push(path);
 }
 return {...result,written,unchanged};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [input,output]=process.argv.slice(2);
 if(!input||!output){console.error('Usage: node --experimental-strip-types tools/compile-project.mjs <source.json|source.zip|project-directory> <output-directory>');process.exitCode=1;}
 else try{
  const result=await compileProjectToDirectory(input,output);
  console.log(JSON.stringify({worldId:result.manifest.worldId,buildVersion:result.manifest.buildVersion,chunks:result.manifest.chunks.length,rebuiltChunks:result.rebuiltChunkIds,written:result.written,unchanged:result.unchanged,capabilities:result.manifest.capabilities},null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
