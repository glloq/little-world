/** OPT-0 benchmark suite (doc 82 §4): reproducible scenes at fixed seed, quality and
 * resolution, driven by tick-indexed routes (`?benchRoute=`, see src/render/bench-route.ts).
 *
 * Per scene: boot → wait until streaming queues are drained → warm-up → run the route for a
 * fixed number of SIMULATION ticks → per-frame samples → reference captures at fixed ticks.
 * Then an island A→B→A×N cycle (page navigations, as the ferry does).
 *
 * Measures (per scene and per phase): presentation interval mean/p50/p95/p99, frames >50 and
 * >100 ms, FPS, cpuUpdate (JS update before submit), cpuRenderSubmit (JS duration of
 * renderer.render — NOT GPU time), cpuSimulation, GPU time (EXT_disjoint_timer_query_webgl2,
 * null when unavailable), draw calls, triangles, estimated GPU upload bytes/s (wrapped
 * WebGL upload calls), JS heap (precise), heap allocation rate and drop count (GC proxy),
 * long tasks, browser process-tree RSS (Linux /proc), CDP script/task durations.
 *
 * Usage: node tools/benchmark-route.mjs --suite=opt <base-url> <output-dir>
 *   SCENES=forest,village,flight,boat,zones,travel   REPEAT=2   TICKS=1800   CYCLES=10
 *   WIDTH=1280 HEIGHT=720   QUALITY=medium   RENDER_TIER=0   EXTRA_QUERY=a=b&c=d
 *   SETTLE_MS=300000 (max wait for drained streaming queues)   CHROMIUM_PATH=…   GPU=1 (do not force SwiftShader; for real hardware runs)
 * SwiftShader results are regression signals only, never an integrated-GPU qualification. */
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const ISLAND='maps/island/manifest.json',OTHER='archipelago/worlds/forest-valley/manifest.json';
/** Spawn = route start (initial streaming happens there); captures at fixed ticks. */
const SCENES={
  forest:{route:'forest',spawn:[-480,-470],captures:[0,900]},
  village:{route:'village',spawn:[-150,900],captures:[0,900]},
  flight:{route:'flight',spawn:[-480,-470],captures:[0,600,1200]},
  boat:{route:'boat',spawn:[200,1330],captures:[0,900]},
  zones:{route:'zones',spawn:[-480,-470],captures:[260,500,740],ticks:960},
};
const env=process.env;
export async function runOptSuite(baseHref,outputDir){
  const base=new URL(baseHref),output=resolve(outputDir);
  const viewport={width:Number(env.WIDTH??1280),height:Number(env.HEIGHT??720)};
  const ticks=Number(env.TICKS??1800),repeat=Number(env.REPEAT??1),cycles=Number(env.CYCLES??10);
  const selected=(env.SCENES??'forest,village,flight,boat,zones,travel').split(',');
  const runId=randomUUID();
  const args=['--no-sandbox','--enable-precise-memory-info','--lw-bench-run='+runId,
    ...(env.GPU==='1'?['--enable-gpu','--ignore-gpu-blocklist']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])];
  const browser=await chromium.launch({headless:true,executablePath:env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args});
  await mkdir(resolve(output,'captures'),{recursive:true});
  const git=a=>{try{return execFileSync('git',a,{encoding:'utf8'}).trim();}catch{return null;}};
  const run={suite:'opt',recordedAt:new Date().toISOString(),base:base.href,revision:git(['rev-parse','HEAD']),branch:git(['rev-parse','--abbrev-ref','HEAD']),
    dirtyFiles:(git(['status','--short'])??'').split('\n').filter(Boolean).length,browserVersion:browser.version(),launchArgs:args.filter(a=>!a.startsWith('--lw-bench-run')),
    machine:{platform:os.platform(),release:os.release(),cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model??null,totalMemGB:+(os.totalmem()/2**30).toFixed(1)},
    buildLabel:env.BUILD_LABEL??null,viewport,deviceScaleFactor:1,quality:env.QUALITY??'medium',renderTier:Number(env.RENDER_TIER??0),ticksPerScene:ticks,repeat,extraQuery:env.EXTRA_QUERY??'',
    notes:['GPU timer null = EXT_disjoint_timer_query_webgl2 unavailable (always the case under SwiftShader).',
      'cpuRenderSubmitMs = JS duration of renderer.render(): command submission, not GPU execution.',
      'Presentation is quantised by vsync (16.7 ms multiples) and the 30 FPS cap: compare p95/p99 and CPU costs, not mean FPS alone.',
      'uploadBytes are estimated from wrapped WebGL upload calls (buffers exact, textures from dimensions).',
      'heapAllocMBps / heapDrops are a GC proxy from precise per-frame usedJSHeapSize, not an allocation profiler.',
      'Routes are tick-indexed: identical trajectory between runs; frames land on different ticks, so images are compared at fixed ticks after settling.'],
    gpuRenderer:null,scenes:[],travel:null};
  try{
    for(let r=0;r<repeat;r++)for(const name of selected){
      if(name==='travel'||!SCENES[name])continue;
      const result=await runScene(browser,base,output,name,SCENES[name],{viewport,ticks:SCENES[name].ticks??ticks,repeatIndex:r,runId});
      run.gpuRenderer??=result.gpuRenderer;run.scenes.push(result);
      console.log(JSON.stringify(brief(result)));
    }
    if(selected.includes('travel'))run.travel=await runTravel(browser,base,{viewport,cycles,runId});
  }finally{
    await browser.close();
    await writeFile(resolve(output,'results.json'),JSON.stringify(run,null,2)+'\n');
  }
  console.log('Results: '+resolve(output,'results.json'));
  return run;
}
function brief(s){const o=s.overall;return {scene:s.name,repeat:s.repeatIndex,settled:s.settled,fps:+o.fps.toFixed(1),p50:o.p50Ms,p95:o.p95Ms,p99:o.p99Ms,over100:o.over100Ms,
  update95:s.cpu.updateMs.p95,submit95:s.cpu.submitMs.p95,gpu:s.gpu.available?s.gpu.ms.p95:null,uploadKBps:+(s.uploadBytesPerSecond/1024).toFixed(0),calls:Math.round(s.drawCalls.mean),heapMB:s.heap.endMB,errors:s.errors.length};}

const pct=(v,p)=>v.length?v[Math.min(v.length-1,Math.floor(v.length*p))]:null;
function stats(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b),n=v.length,mean=n?v.reduce((a,b)=>a+b,0)/n:null;
  return {n,mean,p50:pct(v,.5),p95:pct(v,.95),p99:pct(v,.99),max:n?v[n-1]:null};}
function intervals(values){const s=stats(values);return {frames:s.n,meanMs:s.mean,p50Ms:s.p50,p95Ms:s.p95,p99Ms:s.p99,maxMs:s.max,
  over50Ms:values.filter(v=>v>50).length,over100Ms:values.filter(v=>v>100).length,fps:s.mean?1000/s.mean:0};}

/** Process-tree RSS (MB) of the browser launched with our unique marker flag (Linux only). */
async function browserRssMB(runId){
  if(os.platform()!=='linux')return null;
  try{
    const procs=[];for(const d of await readdir('/proc')){if(!/^\d+$/.test(d))continue;
      try{const stat=readFileSync(`/proc/${d}/stat`,'utf8'),ppid=Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[1]);
        procs.push({pid:Number(d),ppid,cmd:readFileSync(`/proc/${d}/cmdline`,'utf8')});}catch{/* exited */}}
    const root=procs.find(p=>p.cmd.includes('--lw-bench-run='+runId)&&!p.cmd.includes('--type='));if(!root)return null;
    const tree=new Set([root.pid]);let grew=true;while(grew){grew=false;for(const p of procs)if(!tree.has(p.pid)&&tree.has(p.ppid)){tree.add(p.pid);grew=true;}}
    let kb=0;for(const pid of tree){try{const m=/VmRSS:\s+(\d+)/.exec(await readFile(`/proc/${pid}/status`,'utf8'));if(m)kb+=Number(m[1]);}catch{/* exited */}}
    return +(kb/1024).toFixed(1);
  }catch{return null;}
}
async function openPage(browser,viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
  await context.addInitScript(q=>{try{localStorage.setItem('little-world-quality',q);}catch{/* storage blocked */}},env.QUALITY??'medium');
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  return {context,page,errors,cdp};
}
function worldURL(base,world,extra){
  const url=new URL(base);url.searchParams.set('metrics','1');url.searchParams.set('world',world);if((env.RENDER_TIER??'0')!=='auto')url.searchParams.set('renderTier',String(env.RENDER_TIER??0));
  for(const [k,v] of Object.entries(extra))url.searchParams.set(k,v);
  for(const [k,v] of new URLSearchParams(env.EXTRA_QUERY??''))url.searchParams.set(k,v);
  return url.href;
}
const settledPredicate=()=>{const m=window.littleWorldMetrics;return !!m&&m.chunks.pending===0&&(!m.cliffs||!m.cliffs.pending)&&(!m.dressing||m.dressing.pending===0&&!m.dressing.canopyPending&&m.dressing.species?.state!=='loading')&&(!m.ecology||m.ecology.missing===0)&&(!m.grass||!m.grass.pending);};
async function waitSettled(page,timeout){const t=Date.now();const ok=await page.waitForFunction(settledPredicate,{},{timeout,polling:200}).then(()=>true,()=>false);return {ok,ms:Date.now()-t};}
async function cdpMetrics(cdp){const {metrics}=await cdp.send('Performance.getMetrics');return Object.fromEntries(metrics.map(m=>[m.name,m.value]));}

/** Cumulative work counters (doc 81 P0-C): compiled programs, live GPU objects, rebuild/upload
 * counters of the dressing, grass, cliffs and natural structures, object culling. */
const workCounters=()=>{const m=window.littleWorldMetrics,info=window.__lwRenderer?.info;return {programs:info?.programs?.length??m.programs??null,
  geometries:info?.memory.geometries??null,textures:info?.memory.textures??null,cliffsBuilt:m.cliffs?.built??null,cliffsDisposed:m.cliffs?.disposed??null,
  grassUploadedBytes:m.grass?.uploadedBytes??null,dressingUploadedBytes:m.dressing?.uploadedBytes??null,grassGeneratedCells:m.grass?.generatedCells??null,dressingCells:m.dressing?.cells??null,
  terrainBuilt:m.chunks?.built??null,objectsTested:m.objectCulling?.tested??null,objectsHidden:m.objectCulling?.hidden??null,placed:m.placed??null};};
async function runScene(browser,base,output,name,scene,{viewport,ticks,repeatIndex,runId}){
  const {context,page,errors,cdp}=await openPage(browser,viewport);
  const t0=Date.now();
  await page.goto(worldURL(base,ISLAND,{benchRoute:scene.route,spawn:scene.spawn.join(','),yaw:'0'}),{waitUntil:'domcontentloaded'});
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:180000});
  const bootMs=Date.now()-t0;
  // The route holds tick 0 until benchStart: initial streaming settles at the route start.
  await page.waitForFunction(()=>window.littleWorldMetrics?.bench&&window.littleWorldDebug?.benchStart,{},{timeout:60000});
  const settle=await waitSettled(page,Number(env.SETTLE_MS??300000));
  await page.waitForTimeout(2000);
  const gpuRenderer=await page.evaluate(()=>{const gl=window.__lwRenderer?.getContext(),e=gl?.getExtension('WEBGL_debug_renderer_info');return gl?{renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerQuery:!!gl.getExtension('EXT_disjoint_timer_query_webgl2')}:null;});
  const cdpBefore=await cdpMetrics(cdp),rssBefore=await browserRssMB(runId),workBefore=await page.evaluate(workCounters);
  await page.evaluate(()=>{
    const s=window.__optSampler={rows:[],longTasks:[],stop:false};let last=null,lastFrame=-1;
    try{new PerformanceObserver(l=>{for(const e of l.getEntries())s.longTasks.push(e.duration);}).observe({type:'longtask'});}catch{/* unsupported */}
    function frame(now){if(s.stop)return;const m=window.littleWorldMetrics;
      if(m&&m.frameId!==lastFrame){lastFrame=m.frameId;
        if(last!==null){const t=m.timings;s.rows.push([now-last,t.updateMs,t.renderSubmitMs,t.simulationMs,t.gpuMs??NaN,t.metricsMs??NaN,m.calls,m.triangles,
          m.uploads?.bytes??NaN,performance.memory?.usedJSHeapSize??NaN,m.bench?.phase??0,m.bench?.tick??0,m.chunks.pending,m.dressing?.pending??0,now,m.framebuffer?.pixelRatio??NaN,m.budget?.detailLevel??m.qualityLevel??NaN,m.renderRate??NaN,m.ecology?.missing??NaN,m.ecology?.missingNear??NaN,m.grass?.pending??NaN]);}
        last=now;}
      requestAnimationFrame(frame);}
    requestAnimationFrame(frame);
    window.littleWorldDebug.benchStart();
  });
  if(env.PROFILE==='1'){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});await cdp.send('Profiler.start');}
  if(env.ALLOC_PROFILE==='1'){await cdp.send('HeapProfiler.enable');await cdp.send('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});}
  const runStart=Date.now();
  await page.waitForFunction(n=>window.littleWorldMetrics.bench.tick>=n,ticks,{timeout:Math.max(120000,ticks/30*1000*12),polling:250});
  const runWallMs=Date.now()-runStart;
  const rows=await page.evaluate(()=>{const s=window.__optSampler;s.stop=true;return {rows:s.rows,longTasks:s.longTasks};});
  let allocations=null;
  if(env.ALLOC_PROFILE==='1'){const {profile:h}=await cdp.send('HeapProfiler.stopSampling');allocations=allocationTop(h,40,(Date.now()-runStart)/1000);await writeFile(resolve(output,`alloc-${name}-r${repeatIndex}.json`),JSON.stringify(allocations,null,1));}
  let profile=null;
  if(env.PROFILE==='1'){const {profile:p}=await cdp.send('Profiler.stop');const file=`profile-${name}-r${repeatIndex}.cpuprofile`;await writeFile(resolve(output,file),JSON.stringify(p));profile={file,top:profileTop(p,40)};}
  const cdpAfter=await cdpMetrics(cdp),rssAfter=await browserRssMB(runId),workAfter=await page.evaluate(workCounters);
  const col=i=>rows.rows.map(r=>r[i]);
  const heap=col(9);let alloc=0,drops=0;for(let i=1;i<heap.length;i++){const d=heap[i]-heap[i-1];if(d>0)alloc+=d;else if(d<-65536)drops++;}
  const upl=col(8),spanS=(rows.rows.at(-1)?.[14]-rows.rows[0]?.[14])/1000||1;
  const phases={};for(const r of rows.rows){(phases[r[10]]??=[]).push(r[0]);}
  const gpu=col(4).filter(Number.isFinite);
  const result={name,route:scene.route,repeatIndex,bootMs,settled:settle.ok,settleMs:settle.ms,runWallMs,simulatedTicks:ticks,
    simulatedSpeedRatio:+(ticks/30*1000/runWallMs).toFixed(3),
    overall:intervals(col(0)),byPhase:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,intervals(v)])),
    cpu:{updateMs:stats(col(1)),submitMs:stats(col(2)),simulationMs:stats(col(3)),metricsOverheadMs:stats(col(5))},
    gpu:{available:gpu.length>0,ms:stats(gpu)},gpuRenderer,
    drawCalls:stats(col(6)),triangles:stats(col(7)),
    uploadBytesPerSecond:Number.isFinite(upl.at(-1)-upl[0])?(upl.at(-1)-upl[0])/spanS:null,uploadBytesTotal:Number.isFinite(upl.at(-1)-upl[0])?upl.at(-1)-upl[0]:null,
    heap:{startMB:+(heap[0]/2**20).toFixed(2),endMB:+(heap.at(-1)/2**20).toFixed(2),maxMB:+(Math.max(...heap)/2**20).toFixed(2),allocMBps:+(alloc/2**20/spanS).toFixed(2),drops},
    longTasks:{count:rows.longTasks.length,totalMs:Math.round(rows.longTasks.reduce((a,b)=>a+b,0)),max:Math.round(Math.max(0,...rows.longTasks))},
    pendingMax:{chunks:Math.max(0,...col(12)),dressing:Math.max(0,...col(13))},
    /** Content lag: ecology sectors within radius not yet resident (mean, max) and near ones; grass cells pending. */
    streamingLag:{ecologyMissingMean:stats(col(18)).mean,ecologyMissingMax:Math.max(0,...col(18).filter(Number.isFinite)),ecologyMissingNearMean:stats(col(19)).mean,ecologyMissingNearMax:Math.max(0,...col(19).filter(Number.isFinite)),grassPendingMean:stats(col(20)).mean},
    cdp:{scriptS:+(cdpAfter.ScriptDuration-cdpBefore.ScriptDuration).toFixed(2),taskS:+(cdpAfter.TaskDuration-cdpBefore.TaskDuration).toFixed(2),
      layoutS:+(cdpAfter.LayoutDuration-cdpBefore.LayoutDuration).toFixed(3),styleS:+(cdpAfter.RecalcStyleDuration-cdpBefore.RecalcStyleDuration).toFixed(3),jsHeapUsedMB:+(cdpAfter.JSHeapUsedSize/2**20).toFixed(1)},
    rssMB:{before:rssBefore,after:rssAfter},
    work:{before:workBefore,after:workAfter,programsCompiledDuringRun:workAfter.programs-workBefore.programs,cliffsBuiltDuringRun:workAfter.cliffsBuilt-workBefore.cliffsBuilt,
      grassUploadedKB:Math.round((workAfter.grassUploadedBytes-workBefore.grassUploadedBytes)/1024),dressingUploadedKB:workAfter.dressingUploadedBytes===null?null:Math.round((workAfter.dressingUploadedBytes-workBefore.dressingUploadedBytes)/1024),terrainTilesBuilt:workAfter.terrainBuilt-workBefore.terrainBuilt},
    budget:budgetTrace(rows.rows),
    profile,allocations:allocations&&{totalMBps:allocations.totalMBps,top:allocations.top.slice(0,15)},captures:[],errors};
  // Reference captures: route frozen at fixed ticks, streaming drained, then 1.5 s of steady frames.
  for(const tick of scene.captures){
    await page.evaluate(t=>window.littleWorldDebug.benchSeek(t),tick);
    await page.waitForFunction(t=>window.littleWorldMetrics.bench.tick===t,tick,{timeout:10000});
    const s=await waitSettled(page,Number(env.SETTLE_MS??300000));await page.waitForTimeout(1500);
    const file=`captures/${name}-t${tick}-r${repeatIndex}.png`;
    // 3D view only: the HUD shows FPS/memory text that differs between runs.
    const style=await page.addStyleTag({content:'body > :not(#app), #app > :not(#viewport) { visibility: hidden !important; }'});
    await page.waitForTimeout(100);await page.screenshot({path:resolve(output,file)});
    await style.evaluate(n=>n.remove());
    const m=await page.evaluate(()=>{const m=window.littleWorldMetrics;return {calls:m.calls,triangles:m.triangles,position:m.position,dressingInstances:m.dressing?.instances??null};});
    result.captures.push({tick,file,settled:s.ok,...m});
  }
  await context.close();
  return result;
}

/** A→B→A×N by page navigation (what the ferry does): load and settle time, heap, RSS. */
async function runTravel(browser,base,{viewport,cycles,runId}){
  const {context,page,errors,cdp}=await openPage(browser,viewport),hops=[];
  try{
    for(let i=0;i<cycles*2+1;i++){
      const world=i%2===0?ISLAND:OTHER,t0=Date.now();
      await page.goto(worldURL(base,world,{}),{waitUntil:'domcontentloaded'});
      await page.locator('#start-overlay').waitFor({state:'hidden',timeout:180000});
      const bootMs=Date.now()-t0,s=await waitSettled(page,Number(env.SETTLE_MS??300000));
      await page.waitForTimeout(1000);
      const m=await page.evaluate(()=>{const m=window.littleWorldMetrics;return {heapMB:performance.memory?+(performance.memory.usedJSHeapSize/2**20).toFixed(2):null,
        geometries:m.geometries,programs:m.programs,calls:m.calls,uploadMB:m.uploads?+(m.uploads.bytes/2**20).toFixed(2):null};});
      const c=await cdpMetrics(cdp);
      hops.push({index:i,world,bootMs,settled:s.ok,settleMs:s.ms,readyMs:bootMs+s.ms,...m,jsHeapUsedMB:+(c.JSHeapUsedSize/2**20).toFixed(1),rssMB:await browserRssMB(runId)});
      console.log(JSON.stringify(hops.at(-1)));
    }
  }finally{await context.close();}
  const of=w=>hops.filter(h=>h.world===w),agg=list=>({readyMs:stats(list.map(h=>h.readyMs)),heapMB:stats(list.map(h=>h.heapMB)),rssMB:stats(list.map(h=>h.rssMB))});
  const rss=hops.map(h=>h.rssMB).filter(Number.isFinite);
  return {cycles,hops,island:agg(of(ISLAND)),other:agg(of(OTHER)),
    rssGrowthMB:rss.length>2?+(rss.at(-1)-rss[0]).toFixed(1):null,
    rssSlopeMBPerCycle:rss.length>4?+slope(rss.filter((_,i)=>i%2===0)).toFixed(2):null,errors};
}
/** Self time per function (ms) from a CDP sampling profile, bundled names kept with file:line. */
function profileTop(p,n){const self=new Map(),byId=new Map(p.nodes.map(x=>[x.id,x]));const dt=p.timeDeltas;let total=0;
  for(let i=0;i<p.samples.length;i++){const node=byId.get(p.samples[i]),d=(dt[i+1]??dt[i]??0)/1000;total+=d;const c=node.callFrame,key=`${c.functionName||'(anon)'} ${c.url.split('/').pop()}:${c.lineNumber+1}`;self.set(key,(self.get(key)??0)+d);}
  return {totalMs:Math.round(total),top:[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>({fn:k,ms:Math.round(v),pct:+(100*v/total).toFixed(1)}))};}
/** Adaptive budget trace (RENDER_TIER=auto): time-weighted pixel ratio, detail and rate, and the changes. */
function budgetTrace(rows){if(!rows.length)return null;let t=0,dpr=0,detail=0,rate20=0;const changes=[];let prev=null;
  for(const r of rows){const d=r[0];t+=d;dpr+=r[15]*d;detail+=r[16]*d;if(r[17]===20)rate20+=d;const key=r[15]+'/'+r[16]+'/'+r[17];if(key!==prev){changes.push({tick:r[11],pixelRatio:r[15],detail:r[16],rate:r[17]});prev=key;}}
  return {meanPixelRatio:+(dpr/t).toFixed(3),meanDetail:+(detail/t).toFixed(3),rate20Share:+(rate20/t).toFixed(3),final:changes.at(-1),changes:changes.slice(0,20)};}
/** Sampled allocations (CDP HeapProfiler, 16 KiB interval, objects collected by minor/major GC
 * included): allocated bytes per allocating function, per second of run. */
function allocationTop(h,n,seconds){const self=new Map();let total=0;
  const walk=node=>{const c=node.callFrame,key=`${c.functionName||'(anon)'} ${c.url.split('/').pop().split('?')[0]}:${c.lineNumber+1}`,b=node.selfSize;if(b){self.set(key,(self.get(key)??0)+b);total+=b;}for(const ch of node.children??[])walk(ch);};
  walk(h.head);
  return {seconds:+seconds.toFixed(1),totalMBps:+(total/2**20/seconds).toFixed(3),top:[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>({fn:k,KBps:+(v/1024/seconds).toFixed(1),pct:+(100*v/total).toFixed(1)}))};}
function slope(v){const n=v.length,mx=(n-1)/2,my=v.reduce((a,b)=>a+b,0)/n;let num=0,den=0;v.forEach((y,x)=>{num+=(x-mx)*(y-my);den+=(x-mx)**2;});return den?num/den:0;}
