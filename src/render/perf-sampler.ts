/** Bounded CPU samples. GPU durations come exclusively from asynchronous WebGL queries.
 * OPT-0: also keeps GPU results (when the timer extension exists), the presentation
 * interval distribution (>50 / >100 ms) and an estimated GPU upload counter. Collection
 * is metrics-mode only; a sample is a few typed-array writes, no allocation. */
type Summary = { p50: number; p95: number; p99: number; mean: number; max: number };
export class PerfSampler {
 private frames:Float64Array;private costs:Float64Array[];private cursor=0;private count=0;
 private gpu:Float64Array;private gpuCursor=0;private gpuCount=0;private scratch:Float64Array;
 constructor(capacity=240){this.frames=new Float64Array(capacity);this.costs=[new Float64Array(capacity),new Float64Array(capacity),new Float64Array(capacity)];this.gpu=new Float64Array(capacity);this.scratch=new Float64Array(capacity);}
 record(frameMs:number,simulationMs:number,updateMs:number,submitMs:number){const i=this.cursor;this.frames[i]=frameMs;this.costs[0][i]=simulationMs;this.costs[1][i]=updateMs;this.costs[2][i]=submitMs;this.cursor=(i+1)%this.frames.length;this.count=Math.min(this.frames.length,this.count+1);}
 /** One resolved GPU query (ms). Queries resolve a few frames late, so this is its own series. */
 recordGpu(ms:number){if(!Number.isFinite(ms))return;this.gpu[this.gpuCursor]=ms;this.gpuCursor=(this.gpuCursor+1)%this.gpu.length;this.gpuCount=Math.min(this.gpu.length,this.gpuCount+1);}
 private summary(a:Float64Array,n:number):Summary{const v=this.scratch.subarray(0,n);v.set(a.subarray(0,n));v.sort();let sum=0;for(let i=0;i<n;i++)sum+=v[i];return {p50:v[Math.floor(n*.5)]??0,p95:v[Math.floor(n*.95)]??0,p99:v[Math.floor(n*.99)]??0,mean:n?sum/n:0,max:n?v[n-1]:0};}
 snapshot(){const n=this.count,f=this.frames.subarray(0,n);let over50=0,over100=0;for(let i=0;i<n;i++){if(f[i]>50)over50++;if(f[i]>100)over100++;}
  return {samples:n,frameMs:this.summary(this.frames,n),simulationMs:this.summary(this.costs[0],n),updateMs:this.summary(this.costs[1],n),submitMs:this.summary(this.costs[2],n),
   gpuMs:this.gpuCount?this.summary(this.gpu,this.gpuCount):null,gpuSamples:this.gpuCount,longFrames:over50,over100};}
}
export function createGpuTimer(renderer:{getContext():WebGLRenderingContext|WebGL2RenderingContext},enabled=true){
 const gl=renderer.getContext() as WebGL2RenderingContext,ext=enabled&&typeof gl.createQuery==='function'?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
 const pending:WebGLQuery[]=[];let active:WebGLQuery|null=null;
 const stats={samples:0,available:!!ext,ms:null as number|null,disjoint:0,pending:0};
 return {stats,begin(){if(!ext)return;if(gl.getParameter(ext.GPU_DISJOINT_EXT)){stats.disjoint++;stats.ms=null;for(const q of pending)gl.deleteQuery(q);pending.length=0;}while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=pending.shift()!;stats.ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;stats.samples++;gl.deleteQuery(q);}if(pending.length>=4)return;active=gl.createQuery();if(active)gl.beginQuery(ext.TIME_ELAPSED_EXT,active);},end(){if(!ext||!active)return;gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);active=null;stats.pending=pending.length;},dispose(){for(const q of pending)gl.deleteQuery(q);pending.length=0;}};
}

/** Bytes per texel for the (format, type) pairs three.js uses; 4 when unknown (estimate). */
export function texelBytes(gl:WebGL2RenderingContext,format:number,type:number):number{
 const channels=format===gl.RED||format===gl.RED_INTEGER||format===gl.ALPHA||format===gl.LUMINANCE||format===gl.DEPTH_COMPONENT?1:
  format===gl.RG||format===gl.RG_INTEGER||format===gl.LUMINANCE_ALPHA||format===gl.DEPTH_STENCIL?2:format===gl.RGB||format===gl.RGB_INTEGER?3:4;
 const size=type===gl.FLOAT||type===gl.INT||type===gl.UNSIGNED_INT?4:type===gl.HALF_FLOAT||type===gl.SHORT||type===gl.UNSIGNED_SHORT?2:
  type===gl.UNSIGNED_SHORT_5_6_5||type===gl.UNSIGNED_SHORT_4_4_4_4||type===gl.UNSIGNED_SHORT_5_5_5_1?2/channels:
  type===gl.UNSIGNED_INT_24_8||type===gl.UNSIGNED_INT_2_10_10_10_REV||type===gl.UNSIGNED_INT_10F_11F_11F_REV||type===gl.UNSIGNED_INT_5_9_9_9_REV?4/channels:1;
 return channels*size;
}
type Sized={byteLength:number;BYTES_PER_ELEMENT?:number};
type Pixels={width?:number;height?:number;videoWidth?:number;videoHeight?:number};
/** Estimated CPU→GPU transfer counter (metrics mode only): wraps buffer and texture upload
 * entry points of the WebGL2 context. Buffers are exact; texture sizes are estimated from
 * dimensions × texel size. Not GPU memory: re-uploads count every time. */
export function createUploadCounter(gl:WebGL2RenderingContext){
 const stats={bytes:0,bufferBytes:0,textureBytes:0,calls:0};
 const g=gl as unknown as Record<string,(...a:unknown[])=>unknown>,originals:[string,(...a:unknown[])=>unknown][]=[];
 const wrap=(name:string,count:(a:unknown[])=>[number,boolean])=>{const f=g[name];if(typeof f!=='function')return;originals.push([name,f]);
  g[name]=function(this:unknown,...a:unknown[]){const [n,tex]=count(a);if(n>0){stats.bytes+=n;stats.calls++;if(tex)stats.textureBytes+=n;else stats.bufferBytes+=n;}return f.apply(gl,a);};};
 const viewBytes=(src:unknown,offset:unknown,length:unknown)=>{const s=src as Sized|null;if(!s||typeof s.byteLength!=='number')return 0;const bpe=s.BYTES_PER_ELEMENT??1;
  if(typeof length==='number'&&length>0)return length*bpe;return s.byteLength-(typeof offset==='number'?offset*bpe:0);};
 wrap('bufferData',a=>[typeof a[1]==='number'?a[1]:viewBytes(a[1],a[3],a[4]),false]);
 wrap('bufferSubData',a=>[viewBytes(a[2],a[3],a[4]),false]);
 const texBytes=(w:unknown,h:unknown,d:unknown,format:unknown,type:unknown)=>typeof w==='number'&&typeof h==='number'?w*h*(typeof d==='number'?d:1)*texelBytes(gl,format as number,type as number):0;
 const sourceBytes=(src:unknown,format:unknown,type:unknown)=>{const p=src as Pixels|null;if(!p)return 0;const w=p.videoWidth??p.width,h=p.videoHeight??p.height;return texBytes(w,h,1,format,type);};
 // texImage2D(target,level,internal,w,h,border,format,type,src) or (target,level,internal,format,type,source)
 wrap('texImage2D',a=>[a.length>=8?texBytes(a[3],a[4],1,a[6],a[7]):sourceBytes(a[5],a[3],a[4]),true]);
 // texSubImage2D(target,level,x,y,w,h,format,type,src) or (target,level,x,y,format,type,source)
 wrap('texSubImage2D',a=>[a.length>=8?texBytes(a[4],a[5],1,a[6],a[7]):sourceBytes(a[6],a[4],a[5]),true]);
 wrap('texImage3D',a=>[texBytes(a[3],a[4],a[5],a[7],a[8]),true]);
 wrap('texSubImage3D',a=>[texBytes(a[5],a[6],a[7],a[8],a[9]),true]);
 return {stats,dispose(){for(const [name,f] of originals)g[name]=f;originals.length=0;}};
}
