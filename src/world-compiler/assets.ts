import catalogue from '../../assets/catalog.json' with {type:'json'};
import characterCatalogue from '../../assets/character-catalog.json' with {type:'json'};
import {placeableWorldAssets} from '../world-production/registry.ts';
import type {AssetDefinition,ProjectDocument} from '../studio-core/types.ts';
import type {CompiledAssetDescriptor,CompilationDiagnostic} from './manifests.ts';
import {hashText} from './manifests.ts';

export interface AssetEvidence {hash:string;byteLength:number}
export type AssetResolver=(asset:AssetDefinition)=>Promise<AssetEvidence>;
/** Local URLs only. A failed response or missing asset blocks compilation. */
export function fetchAssetResolver(baseURL:string,fetcher:typeof fetch=fetch):AssetResolver {
  return async asset=>{
    if(!asset.file||!localAssetPath(asset.file))throw Error('Unsafe local asset path');
    const base=new URL(baseURL,globalThis.location?.href??'http://localhost/');
    const url=new URL(asset.file,base.href.endsWith('/')?base.href:base.href+'/');
    if(url.origin!==base.origin)throw Error('External asset URLs are forbidden');
    const response=await fetcher(url);
    if(!response.ok)throw Error(`HTTP ${response.status}: ${asset.file}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength<20||bytes.byteLength>20_000_000)throw Error('GLB size outside supported limits');
    const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==bytes.byteLength)throw Error('Invalid GLB header');
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return {hash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),byteLength:bytes.byteLength};
  };
}
export function localAssetPath(path:string):boolean {
  return /^models\/[a-zA-Z0-9_./-]+\.glb$/.test(path)&&!path.split('/').some(part=>part==='..'||part==='.'||part==='');
}
const registry=new Map<string,{type:string;file?:string;license:string}>([
  ...catalogue.assets,...characterCatalogue.characters,...placeableWorldAssets(),
].map(asset=>[asset.id,asset]));
export async function verifyAssets(project:ProjectDocument,resolver?:AssetResolver):Promise<{assets:CompiledAssetDescriptor[];diagnostics:CompilationDiagnostic[]}>{
  const assets:CompiledAssetDescriptor[]=[],diagnostics:CompilationDiagnostic[]=[];
  for(const asset of Object.values(project.assets).sort((a,b)=>a.id.localeCompare(b.id))){
    const known=registry.get(asset.id);
    const fail=(code:string,message:string)=>diagnostics.push({severity:'ERROR',code,message,targetId:asset.id,locator:'assets/'+asset.id});
    if(!known){fail('ASSET_UNKNOWN',`Asset is absent from the local catalogue: ${asset.id}`);continue;}
    if(asset.type!==known.type||asset.file!==known.file){fail('ASSET_MISMATCH',`Asset type/path differs from its local catalogue entry: ${asset.id}`);continue;}
    if(!asset.license||asset.license!==known.license){fail('ASSET_LICENSE',`Asset licence differs from the local catalogue: ${asset.id}`);continue;}
    if(asset.type==='procedural'){
      assets.push({id:asset.id,type:'procedural',license:asset.license,hash:await hashText(asset.source)});continue;
    }
    if(!asset.file||!localAssetPath(asset.file)){fail('ASSET_PATH',`Unsafe asset path: ${asset.id}`);continue;}
    if(!resolver){fail('ASSET_UNVERIFIED',`A local-file resolver must verify ${asset.file}`);continue;}
    try{
      const evidence=await resolver(asset);
      if(!/^[a-f0-9]{64}$/.test(evidence.hash)||!Number.isSafeInteger(evidence.byteLength)||evidence.byteLength<20||evidence.byteLength>20_000_000)throw Error('Invalid file verification evidence');
      assets.push({id:asset.id,type:'glb',file:asset.file,license:asset.license,...evidence});
    }catch(error){fail('ASSET_MISSING',`Asset ${asset.file} could not be verified: ${error instanceof Error?error.message:String(error)}`);}
  }
  return {assets,diagnostics};
}
