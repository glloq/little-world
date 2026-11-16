/** Bounded CPU samples. GPU durations come exclusively from asynchronous WebGL queries. */
export class PerfSampler {
 private frames:Float64Array;private costs:Float64Array[];private cursor=0;private count=0;
 constructor(capacity=240){this.frames=new Float64Array(capacity);this.costs=[new Float64Array(capacity),new Float64Array(capacity),new Float64Array(capacity)];}
 record(frameMs:number,simulationMs:number,updateMs:number,submitMs:number){const i=this.cursor;this.frames[i]=frameMs;this.costs[0][i]=simulationMs;this.costs[1][i]=updateMs;this.costs[2][i]=submitMs;this.cursor=(i+1)%this.frames.length;this.count=Math.min(this.frames.length,this.count+1);}
 snapshot(){const summary=(a:Float64Array)=>{const v=Array.from(a.subarray(0,this.count)).sort((a,b)=>a-b);return {p50:v[Math.floor(v.length*.5)]??0,p95:v[Math.floor(v.length*.95)]??0,p99:v[Math.floor(v.length*.99)]??0};};return {samples:this.count,frameMs:summary(this.frames),simulationMs:summary(this.costs[0]),updateMs:summary(this.costs[1]),submitMs:summary(this.costs[2]),longFrames:Array.from(this.frames.subarray(0,this.count)).filter(v=>v>50).length};}
}
export function createGpuTimer(renderer:{getContext():WebGLRenderingContext|WebGL2RenderingContext}){
 const gl=renderer.getContext() as WebGL2RenderingContext,ext=typeof gl.createQuery==='function'?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
 const pending:WebGLQuery[]=[];let active:WebGLQuery|null=null;
 const stats={available:!!ext,ms:null as number|null,disjoint:0,pending:0};
 return {stats,begin(){if(!ext)return;if(gl.getParameter(ext.GPU_DISJOINT_EXT)){stats.disjoint++;stats.ms=null;for(const q of pending)gl.deleteQuery(q);pending.length=0;}while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=pending.shift()!;stats.ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);}if(pending.length>=4)return;active=gl.createQuery();if(active)gl.beginQuery(ext.TIME_ELAPSED_EXT,active);},end(){if(!ext||!active)return;gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);active=null;stats.pending=pending.length;},dispose(){for(const q of pending)gl.deleteQuery(q);pending.length=0;}};
}
