/** Geography worker pool (main thread). Moves tile, horizon, dressing and 2D-map sampling off
 * the main thread with identical results (same modules). Jobs carry a priority (lower first:
 * tiles, then horizon, dressing, map) and the configuration revisions they were posted with;
 * a result computed on an older terrain/geography/project revision is reported `stale` so the
 * consumer can request it again. Unavailable (Node tests, no Worker, `?workers=0`, worker
 * error): callers keep their synchronous main-thread path. */
import {terrainInputs,terrainRevision} from '../terrain.ts';
import {geographyRevision,geographySources} from './engine.ts';
import type {GeoJob,GeoMessage,GeoReply} from './geo-protocol.ts';
import type {ProjectGeographyInput} from './input-geography.ts';

export interface GeoTask<T> {promise:Promise<{result:T;stale:boolean;ms:number}>;cancel():void}
interface Pending {id:number;job:GeoJob;priority:number;revs:[number,number,number];resolve(v:{result:unknown;stale:boolean;ms:number}):void;reject(e:Error):void;cancelled:boolean}
interface Slot {worker:Worker;busy:Map<number,Pending>;terrain:number;geography:number;project:number}
export interface GeoPoolStats {workers:number;queued:number;running:number;done:number;stale:number;workerMs:number}
/** Jobs in flight per worker: small, so priorities still apply to newly queued work. */
const PER_WORKER=2;

export class GeoWorkerPool {
  private slots:Slot[]=[];private queue:Pending[]=[];private next=1;private failed=false;
  private project:ProjectGeographyInput|null=null;private projectRevision=0;
  readonly stats:GeoPoolStats={workers:0,queued:0,running:0,done:0,stale:0,workerMs:0};
  constructor(count:number,create:()=>Worker){
    for(let i=0;i<count;i++){
      const worker=create(),slot:Slot={worker,busy:new Map(),terrain:-1,geography:-1,project:-1};
      worker.onmessage=(e:MessageEvent<GeoReply>)=>this.reply(slot,e.data);
      worker.onerror=e=>{e.preventDefault?.();this.fail(new Error('Worker de géographie indisponible : '+(e.message||'erreur')));};
      this.slots.push(slot);
    }
    this.stats.workers=count;
  }
  get available(){return !this.failed&&this.slots.length>0;}
  /** Studio 2D map: geography inputs of the edited project (replayed by every worker). */
  setProject(input:ProjectGeographyInput){this.project=input;this.projectRevision++;}
  /** Sources changed: results of map jobs already posted become stale immediately. */
  invalidateProject(){this.project=null;this.projectRevision++;}
  get projectRev(){return this.projectRevision;}
  run<T>(job:GeoJob,priority:number):GeoTask<T>{
    let entry!:Pending;
    const promise=new Promise<{result:T;stale:boolean;ms:number}>((resolve,reject)=>{
      entry={id:this.next++,job,priority,revs:[terrainRevision(),geographyRevision(),this.projectRevision],resolve:resolve as Pending['resolve'],reject,cancelled:false};
    });
    if(this.failed){entry.reject(new Error('Worker de géographie indisponible'));return {promise,cancel(){}};}
    this.queue.push(entry);this.pump();
    return {promise,cancel:()=>{entry.cancelled=true;const i=this.queue.indexOf(entry);if(i>=0){this.queue.splice(i,1);this.stats.queued=this.queue.length;}}};
  }
  private pump(){
    if(this.failed)return;
    this.queue.sort((a,b)=>a.priority-b.priority||a.id-b.id);
    for(const slot of this.slots){
      while(slot.busy.size<PER_WORKER&&this.queue.length){
        const entry=this.queue.shift()!;if(entry.cancelled)continue;
        this.sync(slot,entry);entry.revs=[terrainRevision(),geographyRevision(),this.projectRevision];
        slot.busy.set(entry.id,entry);slot.worker.postMessage({type:'job',id:entry.id,job:entry.job} satisfies GeoMessage);
      }
    }
    this.stats.queued=this.queue.length;this.stats.running=this.slots.reduce((n,s)=>n+s.busy.size,0);
  }
  /** Replays the configuration a job depends on before posting it (FIFO per worker). */
  private sync(slot:Slot,entry:Pending){
    if(entry.job.kind==='map'){
      if(slot.project!==this.projectRevision&&this.project){slot.worker.postMessage({type:'project',input:this.project} satisfies GeoMessage);slot.project=this.projectRevision;}
      return;
    }
    const t=terrainRevision(),inputs=terrainInputs();
    if(slot.terrain!==t&&inputs){slot.worker.postMessage({type:'terrain',config:inputs.config,edits:inputs.edits,water:inputs.water,roads:inputs.roads} satisfies GeoMessage);slot.terrain=t;}
    const g=geographyRevision(),sources=geographySources();
    if(slot.geography!==g&&sources){slot.worker.postMessage({type:'geography',sources} satisfies GeoMessage);slot.geography=g;}
  }
  private reply(slot:Slot,m:GeoReply){
    const entry=slot.busy.get(m.id);if(!entry)return;slot.busy.delete(m.id);
    if(!m.ok){if(!entry.cancelled)entry.reject(new Error(m.error));}
    else{
      const stale=entry.job.kind==='map'?entry.revs[2]!==this.projectRevision:entry.revs[0]!==terrainRevision()||entry.revs[1]!==geographyRevision();
      this.stats.done++;if(stale)this.stats.stale++;this.stats.workerMs+=m.ms;
      if(!entry.cancelled)entry.resolve({result:m.result,stale,ms:m.ms});
    }
    this.pump();
  }
  private fail(error:Error){
    if(this.failed)return;this.failed=true;
    // Cancelled tasks never settle: their owner no longer listens.
    for(const slot of this.slots){for(const e of slot.busy.values())if(!e.cancelled)e.reject(error);slot.busy.clear();slot.worker.terminate();}
    for(const e of this.queue)if(!e.cancelled)e.reject(error);this.queue=[];
  }
  dispose(){this.fail(new Error('Pool fermé'));}
}

let pool:GeoWorkerPool|null|undefined;
/** Shared pool (1–2 workers depending on the cores), or null when workers cannot be used. */
export function geoWorkerPool():GeoWorkerPool|null{
  if(pool!==undefined)return pool&&pool.available?pool:null;
  pool=null;
  try{
    if(typeof Worker==='undefined'||typeof window==='undefined')return null;
    if(new URLSearchParams(window.location.search).get('workers')==='0')return null;
    const cores=navigator.hardwareConcurrency||2,count=Math.max(1,Math.min(2,cores-1));
    pool=new GeoWorkerPool(count,()=>new Worker(new URL('./geo-worker.ts',import.meta.url),{type:'module',name:'geography'}));
  }catch{pool=null;}
  return pool;
}
