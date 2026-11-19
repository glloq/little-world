/** Optional surf diagnostics (?surfPerf=1). Pure TypeScript: no Three.js, DOM or GPU.
 * Disabled by default: the game then never wraps the wave field nor the terrain sampler,
 * so the normal path pays no timing call. CPU durations only — the WebGL submit time is
 * NOT a GPU time and is never reported as such. */
import type {SurfWaveField} from './wave-field.ts';

export const SURF_PERF_CHANNELS=['physicsTick','waveSample','waveHeight','ground',
 'barrelSample','waterUpdate','tubeUpdate','foamUpdate'] as const;
export type SurfPerfChannel=typeof SURF_PERF_CHANNELS[number];
export interface SurfPerfSummary {p50:number;p95:number;max:number;mean:number}
export interface SurfPerfGauges {
 drawCalls:number;vertices:number;triangles:number;uploadBytes:number;
 zonesTotal:number;zonesVisible:number;zonesSimulated:number;tubesVisible:number;
 lods:number[];
}
export interface SurfPerfSnapshot {
 enabled:true;frames:number;
 /** Milliseconds of CPU per presented frame (physics: per frame, summed over its ticks). */
 cpuMs:Record<SurfPerfChannel,SurfPerfSummary>;
 /** Calls per presented frame. */
 calls:Record<SurfPerfChannel,SurfPerfSummary>;
 gauges:SurfPerfGauges;
 gpu:'not-isolated';
 notes:string[];
}
const now=()=>globalThis.performance?.now()??Date.now();
function summarize(a:Float64Array,count:number):SurfPerfSummary{
 if(!count)return {p50:0,p95:0,max:0,mean:0};
 const v=Array.from(a.subarray(0,count)).sort((x,y)=>x-y);
 let sum=0;for(const x of v)sum+=x;
 const round=(x:number)=>Math.round(x*10000)/10000;
 return {p50:round(v[Math.floor(v.length*.5)]),p95:round(v[Math.min(v.length-1,Math.floor(v.length*.95))]),
  max:round(v[v.length-1]),mean:round(sum/v.length)};
}
/** Bounded ring of per-frame accumulators; allocation-free while recording. */
export class SurfPerfRecorder {
 readonly enabled=true;
 private readonly ms=new Float64Array(SURF_PERF_CHANNELS.length);
 private readonly calls=new Float64Array(SURF_PERF_CHANNELS.length);
 private readonly ringMs:Float64Array[];private readonly ringCalls:Float64Array[];
 private cursor=0;private count=0;
 readonly gauges:SurfPerfGauges={drawCalls:0,vertices:0,triangles:0,uploadBytes:0,
  zonesTotal:0,zonesVisible:0,zonesSimulated:0,tubesVisible:0,lods:[]};
 readonly capacity:number;
 constructor(capacity=240){
  this.capacity=capacity;
  this.ringMs=SURF_PERF_CHANNELS.map(()=>new Float64Array(capacity));
  this.ringCalls=SURF_PERF_CHANNELS.map(()=>new Float64Array(capacity));
 }
 now():number{return now();}
 add(channel:SurfPerfChannel,ms:number,calls=1):void{
  const i=SURF_PERF_CHANNELS.indexOf(channel);this.ms[i]+=ms;this.calls[i]+=calls;
 }
 /** Times fn and returns its value. */
 time<T>(channel:SurfPerfChannel,fn:()=>T):T{
  const t=now();try{return fn();}finally{this.add(channel,now()-t);}
 }
 endFrame():void{
  const c=this.cursor;
  for(let i=0;i<SURF_PERF_CHANNELS.length;i++){
   this.ringMs[i][c]=this.ms[i];this.ringCalls[i][c]=this.calls[i];this.ms[i]=0;this.calls[i]=0;
  }
  this.cursor=(c+1)%this.capacity;this.count=Math.min(this.capacity,this.count+1);
 }
 snapshot():SurfPerfSnapshot{
  const cpuMs={} as Record<SurfPerfChannel,SurfPerfSummary>,calls={} as Record<SurfPerfChannel,SurfPerfSummary>;
  SURF_PERF_CHANNELS.forEach((name,i)=>{cpuMs[name]=summarize(this.ringMs[i],this.count);
   calls[name]=summarize(this.ringCalls[i],this.count);});
  return {enabled:true,frames:this.count,cpuMs,calls,gauges:{...this.gauges,lods:[...this.gauges.lods]},
   gpu:'not-isolated',
   notes:['waveSample/waveHeight include their ground() calls',
    'ground is counted inside wave sampling; physicsTick includes all surf physics',
    'GPU time is only available for the whole frame (EXT_disjoint_timer_query), never per surf mesh']};
 }
}
/** Diagnostic-only decorator. The decorated field returns exactly the same values. */
export function instrumentSurfField(field:SurfWaveField,perf:SurfPerfRecorder):SurfWaveField{
 return {zone:field.zone,
  sample(x,z,tick){const t=perf.now(),r=field.sample(x,z,tick);perf.add('waveSample',perf.now()-t);return r;},
  height(x,z,tick){const t=perf.now(),r=field.height(x,z,tick);perf.add('waveHeight',perf.now()-t);return r;}};
}
/** Counts terrain samples consumed by surf code (time is already inside wave sampling). */
export function instrumentGround(ground:(x:number,z:number)=>number,perf:SurfPerfRecorder){
 return (x:number,z:number)=>{perf.add('ground',0);return ground(x,z);};
}
