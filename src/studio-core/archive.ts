/** Portable, uncompressed ZIP of independently versioned JSON source files. No executable payloads. */
import type { ProjectDocument } from './types.ts';
import { parseProject } from './schema.ts';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const MAX_BYTES=128*1024*1024,MAX_FILES=30000;
export type ProjectFiles=Record<string,string>;
function safePath(path:string){if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..')||!path.endsWith('.json'))throw Error('Chemin d’archive interdit : '+path);return path;}
export function projectToFiles(project:ProjectDocument):ProjectFiles {
 const p=parseProject(project),f:ProjectFiles=Object.create(null),refs=p.manifest.sourceManifest;
 f['project.json']=JSON.stringify(p.manifest);f[refs.worldRef]=JSON.stringify(p.world);f[refs.chunkIndexRef]=JSON.stringify(p.chunkIndex);f[refs.entityIndexRef]=JSON.stringify(p.entityIndex);f[refs.librariesRef]=JSON.stringify(p.libraries);f[refs.assetCatalogRef]=JSON.stringify(p.assets);
 for(const meta of Object.values(p.chunkIndex)){const chunk=p.chunks[meta.chunkId];if(!chunk)throw Error('Secteur non chargé : '+meta.chunkId);f[safePath(meta.sourceRef)]=JSON.stringify(chunk);}
 return f;
}
export function projectFromFiles(files:ProjectFiles):ProjectDocument {
 if(Object.keys(files).length>MAX_FILES)throw Error('Trop de fichiers dans le projet');
 for(const [path,text] of Object.entries(files)){safePath(path);if(typeof text!=='string'||text.length>16*1024*1024)throw Error('Fichier de projet trop volumineux');}
 const json=(path:string):unknown=>{safePath(path);if(!Object.hasOwn(files,path))throw Error('Fichier absent : '+path);return JSON.parse(files[path]);};
 const manifest=json('project.json') as ProjectDocument['manifest'];
 if(!manifest||manifest.schemaVersion!==3||!manifest.sourceManifest)throw Error('Manifeste V3 absent');
 const r=manifest.sourceManifest,chunkIndex=json(r.chunkIndexRef) as ProjectDocument['chunkIndex'];
 const chunks:ProjectDocument['chunks']=Object.create(null);
 for(const meta of Object.values(chunkIndex)){if(!meta||typeof meta.chunkId!=='string'||typeof meta.sourceRef!=='string')throw Error('Index de secteurs invalide');chunks[meta.chunkId]=json(meta.sourceRef) as ProjectDocument['chunks'][string];}
 return parseProject({manifest,world:json(r.worldRef),chunkIndex,entityIndex:json(r.entityIndexRef),libraries:json(r.librariesRef),assets:json(r.assetCatalogRef),chunks});
}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
/** ZIP STORE is intentionally simple, deterministic and compatible with ordinary unzip tools. */
export function writeFilesArchive(files:ProjectFiles):Uint8Array {
 const entries=Object.entries(files).sort(([a],[b])=>a.localeCompare(b));if(entries.length>MAX_FILES)throw Error('Trop de fichiers');
 const parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0,centralSize=0;
 for(const [path,text] of entries){safePath(path);const name=encoder.encode(path),data=encoder.encode(text),crc=crc32(data);if(offset+data.length>MAX_BYTES)throw Error('Archive trop volumineuse');
  const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);
  const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);c.set(name,46);
  parts.push(header,data);central.push(c);offset+=header.length+data.length;centralSize+=c.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
 const output=new Uint8Array(offset+centralSize+22);let cursor=0;for(const p of [...parts,...central,end]){output.set(p,cursor);cursor+=p.length;}return output;
}
export function readFilesArchive(bytes:Uint8Array):ProjectFiles {
 if(bytes.byteLength>MAX_BYTES||bytes.length<22)throw Error('Taille d’archive invalide');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('Archive ZIP non prise en charge');
 const count=v.getUint16(end+10,true),centralSize=v.getUint32(end+12,true),centralOffset=v.getUint32(end+16,true);if(count>MAX_FILES||centralOffset+centralSize!==end)throw Error('Index ZIP invalide');
 const files:ProjectFiles=Object.create(null);let cursor=centralOffset,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>end||v.getUint32(cursor,true)!==0x02014b50)throw Error('Entrée ZIP invalide');
  const flags=v.getUint16(cursor+8,true),method=v.getUint16(cursor+10,true),crc=v.getUint32(cursor+16,true),size=v.getUint32(cursor+24,true),nameLength=v.getUint16(cursor+28,true),extra=v.getUint16(cursor+30,true),comment=v.getUint16(cursor+32,true),local=v.getUint32(cursor+42,true);
  if(method!==0||flags&9||v.getUint32(cursor+20,true)!==size)throw Error('Importer une archive ZIP non compressée créée par le Studio');
  if(cursor+46+nameLength+extra+comment>end||local+30>centralOffset)throw Error('Entrée ZIP tronquée');
  const name=safePath(decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength)));if(Object.hasOwn(files,name))throw Error('Fichier dupliqué : '+name);
  if(v.getUint32(local,true)!==0x04034b50)throw Error('En-tête ZIP invalide');const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
  if(start+size>centralOffset||(total+=size)>MAX_BYTES)throw Error('Archive tronquée ou trop volumineuse');const data=bytes.subarray(start,start+size);if(crc32(data)!==crc)throw Error('Fichier corrompu : '+name);files[name]=decoder.decode(data);cursor+=46+nameLength+extra+comment;
 }
 if(cursor!==end)throw Error('Index ZIP incomplet');return files;
}
export const writeProjectArchive=(project:ProjectDocument)=>writeFilesArchive(projectToFiles(project));
export const readProjectArchive=(bytes:Uint8Array)=>projectFromFiles(readFilesArchive(bytes));
