/** Local key/value store for large save payloads (mine excavations, farm states):
 * IndexedDB built into the browser, no server or installation. Null when unavailable. */
export interface BlobStore {get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;delete(key:string):Promise<void>}
export function indexedDbBlobStore(name='little-world-game-saves'):BlobStore|null{
  if(typeof indexedDB==='undefined')return null;
  let db:Promise<IDBDatabase>|null=null;
  const open=()=>db??=new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('payloads');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const run=<T>(mode:IDBTransactionMode,work:(s:IDBObjectStore)=>IDBRequest<T>)=>open().then(d=>new Promise<T>((resolve,reject)=>{const t=d.transaction('payloads',mode),req=work(t.objectStore('payloads'));t.oncomplete=()=>resolve(req.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);}));
  return {get:async k=>(await run('readonly',s=>s.get(k)) as string|undefined)??null,set:async(k,v)=>{await run('readwrite',s=>s.put(v,k));},delete:async k=>{await run('readwrite',s=>s.delete(k));}};
}
export function memoryBlobStore():BlobStore&{size:number}{const m=new Map<string,string>();return {get:async k=>m.get(k)??null,set:async(k,v)=>{m.set(k,v);},delete:async k=>{m.delete(k);},get size(){return m.size;}};}
