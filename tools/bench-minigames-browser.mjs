/** Doc 107 browser measurement (Chromium; SwiftShader in CI = regression signal only, NOT a
 * GPU qualification). Same island, same spot (the demo football pitch), three scenarios:
 *   base   — no ?minigames: mini-game code never loaded;
 *   ready  — ?minigames=demo, standing on the pitch, no session (READY, no simulation);
 *   active — a football session with the ball kicked every 3 s.
 * Reports load time (navigation → playable, sectors loaded) and PerfSampler p50/p95 of
 * frame and simulation time over the last frames. Usage: WORLD_URL=… node tools/bench-minigames-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',seconds=Number(process.env.BENCH_SECONDS??15);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function open(query){
  const page=await browser.newPage({viewport:{width:1000,height:640}}),t0=Date.now();
  await page.goto(base+'?world=maps/island/manifest.json&metrics=1'+query,{waitUntil:'networkidle'});
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:90000});
  await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:90000});
  return {page,loadMs:Date.now()-t0};
}
const teleport=(page,x,z,h)=>page.evaluate(([x,z,h])=>window.littleWorldDebug.teleport(x,z,h),[x,z,h]);
async function sample(page){await page.waitForTimeout(seconds*1000);const m=await page.evaluate(()=>window.littleWorldMetrics);return {frameMs:m.perf.frameMs,simulationMs:m.perf.simulationMs,samples:m.perf.samples,calls:m.calls,triangles:m.triangles};}
const rows=[];
try{
  // Locate the demo football pitch once.
  let pitch;
  {const {page}=await open('&minigames=demo');await page.waitForFunction(()=>window.littleWorldMetrics?.minigames?.instances.length>=1,{},{timeout:30000});
   pitch=(await page.evaluate(()=>window.littleWorldMetrics.minigames.instances.find(i=>i.variant==='football').area));await page.close();}
  const spot=[pitch.x-Math.sin(pitch.heading)*3,pitch.z-Math.cos(pitch.heading)*3,pitch.heading];
  for(const scenario of ['base','ready','active']){
    const {page,loadMs}=await open(scenario==='base'?'':'&minigames=demo');
    await teleport(page,...spot);await page.waitForTimeout(3000);
    if(scenario==='active'){
      await page.keyboard.down('KeyF');await page.waitForTimeout(150);await page.keyboard.up('KeyF');
      const kick=setInterval(()=>{void(async()=>{await teleport(page,pitch.x-Math.sin(pitch.heading)*1.05,pitch.z-Math.cos(pitch.heading)*1.05,pitch.heading).catch(()=>{});await page.keyboard.down('KeyF').catch(()=>{});await page.waitForTimeout(600).catch(()=>{});await page.keyboard.up('KeyF').catch(()=>{});})();},3000);
      const r=await sample(page);clearInterval(kick);
      const g=await page.evaluate(()=>window.littleWorldMetrics.minigames);
      rows.push({scenario,loadMs,...r,minigames:{active:g.active,loaded:g.loaded,views:g.views}});
    }else{
      const r=await sample(page),g=await page.evaluate(()=>window.littleWorldMetrics.minigames);
      rows.push({scenario,loadMs,...r,minigames:g?{active:g.active,loaded:g.loaded,views:g.views}:null});
    }
    await page.close();
  }
  console.log(JSON.stringify({renderer:'SwiftShader (CPU) — regression signal, not GPU qualification',seconds,rows},null,1));
}finally{await browser.close();}
