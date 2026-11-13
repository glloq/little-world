/** Studio test builds: compiled files of a source snapshot, stored in IndexedDB so large
 * worlds do not go through sessionStorage. The game reads them through the same
 * compiled-world reader as published worlds, via a fetch-compatible adapter.
 * Builds are disposable copies: they never touch Studio sources or real save slots.
 */
import type {Point3} from '../gameplay/schema.ts';

export interface StoredBuild {schemaVersion:1;kind:'studio-test-build';buildId:string;projectId:string;createdAt:number;spawn:Point3;files:Record<string,string>}
const DB='little-world-test-builds',STORE='builds',KEEP=3;
const MAX_BYTES=96*1024*1024;
function open():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'buildId'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
function done(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Transaction annulée'));});}
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9-]{8,64}$/.test(v);
export async function saveTestBuild(input:{projectId:string;spawn:Point3;files:Record<string,string>}):Promise<StoredBuild>{
  const bytes=Object.values(input.files).reduce((sum,text)=>sum+text.length*2,0);
  if(bytes>MAX_BYTES)throw Error('Monde compilé trop volumineux pour une copie de test locale');
  if(!input.files['manifest.json'])throw Error('Manifeste compilé absent');
  const build:StoredBuild={schemaVersion:1,kind:'studio-test-build',buildId:crypto.randomUUID(),projectId:input.projectId,createdAt:Date.now(),spawn:{...input.spawn},files:input.files};
  const db=await open();
  try{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
    const all=await new Promise<StoredBuild[]>((resolve,reject)=>{const r=store.getAll();r.onsuccess=()=>resolve(r.result as StoredBuild[]);r.onerror=()=>reject(r.error);});
    // Bounded retention: keep the newest builds only; older test copies are disposable.
    for(const old of all.sort((a,b)=>b.createdAt-a.createdAt).slice(KEEP-1))store.delete(old.buildId);
    store.put(build);await done(tx);
  }finally{db.close();}
  return build;
}
export async function loadTestBuild(buildId:string):Promise<StoredBuild>{
  if(!validId(buildId))throw Error('Identifiant de copie de test invalide');
  const db=await open();
  try{
    const tx=db.transaction(STORE,'readonly'),value=await new Promise<unknown>((resolve,reject)=>{const r=tx.objectStore(STORE).get(buildId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const build=value as StoredBuild|undefined;
    if(!build||build.schemaVersion!==1||build.kind!=='studio-test-build'||build.buildId!==buildId||typeof build.files!=='object')throw Error('Copie de test absente. Relancez-la depuis Studio.');
    return build;
  }finally{db.close();}
}
/** Marker path resolved against the page origin; only the adapter below ever reads it. */
export function buildManifestURL(buildId:string):string{return `__studio-build__/${buildId}/manifest.json`;}
export function buildFetcher(build:StoredBuild):typeof fetch{
  const marker=`/__studio-build__/${build.buildId}/`;
  return (async(input:RequestInfo|URL)=>{
    const href=typeof input==='string'?input:input instanceof URL?input.href:input.url,path=new URL(href,location.href).pathname,at=path.indexOf(marker);
    const key=at<0?null:decodeURIComponent(path.slice(at+marker.length));
    const text=key!==null?build.files[key]:undefined;
    return text===undefined?new Response('',{status:404}):new Response(text,{status:200,headers:{'content-type':'application/json'}});
  }) as typeof fetch;
}
