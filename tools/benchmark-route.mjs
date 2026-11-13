#!/usr/bin/env node
/** Reproducible route benchmark (HZ-0 / R-01 / Q-01 baseline).
 * Same scenario, seed, viewport, quality and scripted route for every run:
 * settle → idle → 360° drag rotation → run forward → fast U-turn → horizon sweep.
 * Records presentation intervals (p50/p95/p99, long frames), renderer counters,
 * terrain streaming counters when exposed, and a pixel "hole" metric: the share of
 * background-coloured pixels in the lower band of the screen while looking at the
 * horizon. SwiftShader numbers are regression signals only, never GPU qualification;
 * the JS duration of renderer.render() is CPU submission, not GPU time.
 *
 * Usage: node tools/benchmark-route.mjs <base-url> <output-dir>
 *   BENCHMARK_SCENARIOS=valley-start,terrain-2km,island-3x8
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const base=new URL(process.argv[2]??'http://127.0.0.1:5173/little-world/');
const output=resolve(process.argv[3]??'../little-world-artifacts/route');
const viewport={width:960,height:640};
const launchArgs=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const scenarios=[
  {name:'valley-start',kind:'v2-preview',width:200,length:600},
  {name:'terrain-2km',kind:'v2-preview',width:2000,length:2000},
  {name:'island-3x8',kind:'url',query:{world:'maps/island/manifest.json'}},
  {name:'island-3x8-128',kind:'url',query:{world:'maps/island-128/manifest.json'}},
].filter(s=>!process.env.BENCHMARK_SCENARIOS||process.env.BENCHMARK_SCENARIOS.split(',').includes(s.name));

const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:null;
function summarize(intervals){
  const sorted=[...intervals].sort((a,b)=>a-b),mean=intervals.reduce((a,b)=>a+b,0)/Math.max(1,intervals.length);
  return {frames:intervals.length,meanMs:mean,p50Ms:percentile(sorted,.5),p95Ms:percentile(sorted,.95),p99Ms:percentile(sorted,.99),maxMs:sorted.at(-1)??null,
    over50Ms:intervals.filter(v=>v>50).length,over100Ms:intervals.filter(v=>v>100).length,fps:1000/mean};
}
async function holeFraction(page){
  // Reference = background colour sampled in the top row while looking slightly upward.
  const shot=await page.screenshot({type:'png'});
  return page.evaluate(async b64=>{
    const blob=await (await fetch('data:image/png;base64,'+b64)).blob(),bitmap=await createImageBitmap(blob);
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
    const {data,width,height}=ctx.getImageData(0,0,bitmap.width,bitmap.height);
    const at=(x,y)=>{const i=(y*width+x)*4;return [data[i],data[i+1],data[i+2]];};
    const ref=at(Math.floor(width/2),2);let holes=0,total=0;
    for(let y=Math.floor(height*.62);y<height;y+=2)for(let x=0;x<width;x+=2){
      const c=at(x,y);total++;if(Math.abs(c[0]-ref[0])<=3&&Math.abs(c[1]-ref[1])<=3&&Math.abs(c[2]-ref[2])<=3)holes++;
    }
    return holes/total;
  },shot.toString('base64'));
}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:launchArgs});
const run={recordedAt:new Date().toISOString(),base:base.href,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).length,browserVersion:browser.version(),viewport,quality:'medium',launchArgs,
  notes:['SwiftShader software rendering: regression signal only, not an integrated-GPU qualification.',
    'Intervals are presentation intervals observed by requestAnimationFrame; renderSubmitMs is JS submission time, not GPU time.',
    'holeFraction = share of background-coloured pixels in the lower 38% of the frame (below the eye-level horizon) at the lowest camera pitch (8 headings).',
    'Route timing is wall-clock; frame counts per phase vary with throughput.'],scenarios:[]};
await mkdir(output,{recursive:true});
try{
  for(const scenario of scenarios){
    const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
    const begin=performance.now();
    await page.goto(base.href,{waitUntil:'networkidle'});
    await page.evaluate(async({baseHref,scenario})=>{
      localStorage.setItem('little-world-quality','medium');
      if(scenario.kind==='v2-preview'){const module=await import(new URL('src/world-data.ts',baseHref).href);const world=module.defaultWorld();world.config.width=scenario.width;world.config.length=scenario.length;sessionStorage.setItem('little-world-preview',JSON.stringify(world));}
    },{baseHref:base.href,scenario});
    const url=new URL(base);url.searchParams.set('metrics','1');
    if(scenario.kind==='v2-preview')url.searchParams.set('preview','1');else for(const [k,v] of Object.entries(scenario.query))url.searchParams.set(k,v);
    await page.goto(url.href,{waitUntil:'networkidle'});
    await page.locator('#start').click();
    const bootMs=performance.now()-begin;
    // Settle: queue drained, or 25 s timeout recorded as such.
    const settled=await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:25000}).then(()=>true,()=>false);
    const settleMs=performance.now()-begin-bootMs;
    await page.waitForTimeout(800);
    await page.evaluate(()=>{
      const state=window.__routeSampler={intervals:[],samples:[],phase:'idle',stop:false};let last=null,lastFrame=-1;
      function frame(now){if(state.stop)return;const m=window.littleWorldMetrics;if(m&&m.frameId!==lastFrame){lastFrame=m.frameId;if(last!==null){state.intervals.push(now-last);
        state.samples.push({phase:state.phase,calls:m.calls,triangles:m.triangles,geometries:m.geometries,chunks:m.chunks,horizon:m.horizon??null,terrainWork:m.terrainWork??null,timings:m.timings});}last=now;}
        requestAnimationFrame(frame);}requestAnimationFrame(frame);
    });
    const phase=name=>page.evaluate(n=>{window.__routeSampler.phase=n;},name);
    const box=await page.locator('canvas').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
    async function drag(dx,dy,steps,stepMs){await page.mouse.move(cx,cy);await page.mouse.down();for(let i=1;i<=steps;i++){await page.mouse.move(cx+dx*i/steps,cy+dy*i/steps);await page.waitForTimeout(stepMs);}await page.mouse.up();}
    await phase('idle');await page.waitForTimeout(2000);
    await phase('rotate360');await drag(1995,0,40,100);
    await phase('run');await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');await page.waitForTimeout(6000);await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    await phase('uturn');await drag(997,0,4,40);await page.keyboard.down('KeyW');await page.waitForTimeout(3000);await page.keyboard.up('KeyW');
    await phase('horizon');await drag(0,600,10,30);const holes=[];
    for(let i=0;i<8;i++){await page.waitForTimeout(700);holes.push(await holeFraction(page));if(i===0)await page.screenshot({path:resolve(output,`${scenario.name}-horizon.png`)});await drag(249,0,4,30);}
    const sampled=await page.evaluate(()=>{const s=window.__routeSampler;s.stop=true;return {intervals:s.intervals,samples:s.samples};});
    const byPhase={};for(const name of ['idle','rotate360','run','uturn','horizon']){const idx=sampled.samples.map((s,i)=>s.phase===name?i:-1).filter(i=>i>=0);byPhase[name]=summarize(idx.map(i=>sampled.intervals[i]));}
    const mean=k=>sampled.samples.reduce((a,s)=>a+(k(s)??0),0)/Math.max(1,sampled.samples.length);
    const max=k=>sampled.samples.reduce((a,s)=>Math.max(a,k(s)??0),0);
    const result={...scenario,bootMs,settled,settleMs,overall:summarize(sampled.intervals),byPhase,
      drawCallsMean:mean(s=>s.calls),drawCallsMax:max(s=>s.calls),trianglesMean:mean(s=>s.triangles),trianglesMax:max(s=>s.triangles),geometriesMax:max(s=>s.geometries),
      chunksActiveMax:max(s=>s.chunks?.active),chunksResidentMax:max(s=>s.chunks?.resident),chunksPendingMax:max(s=>s.chunks?.pending),chunksVisibleMean:mean(s=>s.chunks?.visible),
      terrainBytesMax:max(s=>s.chunks?.bytes),terrainBuildMsMax:max(s=>s.terrainWork?.lastMs),terrainBuiltTotal:sampled.samples.at(-1)?.chunks?.built??null,
      updateMsMean:mean(s=>s.timings?.updateMs),renderSubmitMsMean:mean(s=>s.timings?.renderSubmitMs),simulationMsMean:mean(s=>s.timings?.simulationMs),
      horizon:sampled.samples.at(-1)?.horizon??null,holeFraction:{mean:holes.reduce((a,b)=>a+b,0)/holes.length,max:Math.max(...holes),samples:holes},
      heapMB:await page.evaluate(()=>performance.memory?performance.memory.usedJSHeapSize/1048576:null),errors};
    run.scenarios.push(result);
    console.log(JSON.stringify({name:scenario.name,p50:result.overall.p50Ms,p95:result.overall.p95Ms,p99:result.overall.p99Ms,over100:result.overall.over100Ms,calls:result.drawCallsMean,tris:result.trianglesMean,active:result.chunksActiveMax,resident:result.chunksResidentMax,holes:result.holeFraction,errors}));
    await context.close();
  }
}finally{await browser.close();await writeFile(resolve(output,'results.json'),JSON.stringify(run,null,2)+'\n');}
console.log('Results: '+resolve(output,'results.json'));
