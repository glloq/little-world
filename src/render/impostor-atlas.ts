import * as THREE from 'three';
import {parseImpostorManifest,type AtlasPage,type AtlasEntry,IMPOSTOR_LIMITS} from './impostor-manifest.ts';
import {SharedResourceCache} from './resource-cache.ts';
export interface AtlasResource {page:AtlasPage;texture:THREE.Texture;metadata:THREE.DataTexture;entries:Map<string,AtlasEntry>;bytes:number;dispose():void}
const base=()=>(import.meta as {env?:{BASE_URL?:string}}).env?.BASE_URL??'/';
let manifest:Promise<ReturnType<typeof parseImpostorManifest>>|undefined;
const cache=new SharedResourceCache<AtlasResource>(IMPOSTOR_LIMITS.maxAtlasBytes);
export const atlasCacheStats=cache.stats;
export const clearUnusedAtlases=()=>cache.trim(0);
export function acquireAtlas(kind:string){
 return cache.acquire(base()+kind,async()=>{
  manifest??=fetch(base()+'impostors/manifest.json').then(r=>{if(!r.ok)throw Error('Atlas manifest unavailable');return r.json();}).then(parseImpostorManifest).catch(e=>{manifest=undefined;throw e;});
  const page=(await manifest).pages[kind];if(!page)throw Error('Atlas page unavailable');
  const texture=await new THREE.TextureLoader().loadAsync(base()+page.image);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
  const data=new Float32Array(page.anchors.length*4);page.anchors.forEach((a,i)=>{data.set(a,i*4);});
  const metadata=new THREE.DataTexture(data,page.anchors.length,1,THREE.RGBAFormat,THREE.FloatType);metadata.needsUpdate=true;
  return {page,texture,metadata,entries:new Map(page.entries.map(e=>[e.id,e])),bytes:page.width*page.height*4+data.byteLength,dispose(){texture.dispose();metadata.dispose();}};
 });
}
