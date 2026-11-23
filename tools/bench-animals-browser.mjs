/** Before/after measurement of the animal system in the real game (?animalBench=N).
 * Reports draw calls, triangles, JS heap, presented FPS and the animal host's own CPU time.
 * SwiftShader numbers detect regressions only: they do not qualify integrated GPUs.
 * Usage: WORLD_URL=… node tools/bench-animals-browser.mjs [counts, default 0,1,5,10,30] */
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const counts=(process.argv[2]??'0,1,5,10,30').split(',').map(Number);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-precise-memory-info']});
const rows=[];
try{
  for(const count of counts){
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    await page.goto(base+'?world=maps/island/manifest.json&metrics=1'+(count?'&animalBench='+count:''),{waitUntil:'networkidle'});
    await page.locator('#start-overlay').waitFor({state:'hidden',timeout:90000});
    await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:90000});
    if(count)await page.waitForFunction(n=>window.littleWorldDebug?.animals?.view.stats.shown>=Math.min(n,window.littleWorldDebug.animals.sim.stats.animals),count,{timeout:60000});
    await page.waitForTimeout(3000);
    rows.push(await page.evaluate(async count=>{
      const host=window.littleWorldDebug?.animals,cost={tick:0,ticks:0,present:0,presents:0};
      if(host){const tick=host.tick,present=host.present;
        host.tick=(...a)=>{const t=performance.now();const r=tick(...a);cost.tick+=performance.now()-t;cost.ticks++;return r;};
        host.present=(...a)=>{const t=performance.now();const r=present(...a);cost.present+=performance.now()-t;cost.presents++;return r;};}
      let frames=0,run=true;const loop=()=>{frames++;if(run)requestAnimationFrame(loop);};requestAnimationFrame(loop);
      const start=performance.now();await new Promise(r=>setTimeout(r,8000));run=false;
      const seconds=(performance.now()-start)/1000,m=window.littleWorldMetrics;
      return {animals:host?.sim.stats.animals??0,requested:count,rigs:host?.view.stats.rigs??0,vehicles:host?.view.stats.vehicles??0,drawCalls:m.calls,triangles:m.triangles,
        rafFps:Number((frames/seconds).toFixed(1)),heapMB:Number((performance.memory.usedJSHeapSize/1048576).toFixed(1)),
        simMsPerTick:cost.ticks?Number((cost.tick/cost.ticks).toFixed(3)):0,viewMsPerFrame:cost.presents?Number((cost.present/cost.presents).toFixed(3)):0};
    },count));
    await page.close();
  }
  console.table(rows);
  console.log(JSON.stringify({renderer:'SwiftShader (CPU rasteriser)',note:'regression reference only; integrated GPU NOT_VERIFIED',rows}));
}finally{await browser.close();}
