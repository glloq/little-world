/** Browser surf performance protocol. DOES NOT claim an iGPU benchmark unless a real
 * Intel/AMD integrated GPU is detected. Use SURF_NATIVE_GPU=1 on the target PC,
 * with CHROMIUM_PATH and SURF_URL as needed. Artifact: /tmp/little-world-browser.
 */
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir,totalmem} from 'node:os';
import {join} from 'node:path';
const dir=join(tmpdir(),'little-world-browser');mkdirSync(dir,{recursive:true});
const worldURL=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const base=process.env.SURF_URL??new URL('?surfDemo=1&metrics=1',worldURL).toString();
const native=process.env.SURF_NATIVE_GPU==='1';
const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:native?['--no-sandbox']:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let report=null,page=null;
try{
 const context=await browser.newContext({viewport:{width:1280,height:720}});
 page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
 await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>15,{},{timeout:120000});
 // For an authored A/B/C island the default player spawn is inland.
 // Explicitly visit a real beach and equip the board before recording FPS.
 const dedicated=await page.evaluate(()=>window.littleWorldMetrics?.surfWorld?.count===3);
 if(dedicated){
  const layoutResponse=await page.request.get(new URL('archipelago/worlds/surf-island/surf-layout.json',worldURL).toString());
  if(!layoutResponse.ok())throw Error('Benchmark: authored island layout missing');
  const layout=await layoutResponse.json(),beach=layout.beaches.find(b=>b.name==='B');
  if(!beach)throw Error('Benchmark: B beach missing');
  await page.evaluate(p=>window.littleWorldDebug.teleport(p.x,p.z,0),beach.spawn);
  await page.waitForFunction(id=>window.littleWorldMetrics?.surf?.zoneId===id,beach.zone,{timeout:12000});
  if(!await page.evaluate(()=>window.littleWorldMetrics?.surf?.equipped)){
   await page.keyboard.press('KeyI');
   const board=page.locator('.ui-bag-v3 [data-item="tool:surfboard"]').first();
   await board.waitFor({state:'visible',timeout:10000});
   await board.click();
   await page.getByRole('button',{name:'Équiper',exact:true}).first().click();
   await page.keyboard.press('Escape');
 await page.locator('[data-panel="inventory"]').waitFor({state:'hidden',timeout:5000});
  }
  await page.keyboard.press('KeyB');
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf',{},{timeout:12000});
 }
 const initialSurf=await page.evaluate(()=>window.littleWorldMetrics?.surf);
 if(!initialSurf?.wave)throw Error('Benchmark refused: player is not actually in a surf wave field');
 await page.screenshot({path:dir+'/surf-benchmark-start.png'});
 const hardware=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');
  const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
  const dbg=gl?.getExtension('WEBGL_debug_renderer_info');
  return {vendor:String(dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR)||'unknown'),
   renderer:String(dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER)||'unknown'),
   deviceMemoryGiB:navigator.deviceMemory??null,hardwareConcurrency:navigator.hardwareConcurrency??null};
 });
 await page.keyboard.down('KeyW');await page.keyboard.down('Shift');
 const samples=[];
 for(let i=0;i<90;i++){
  await page.waitForTimeout(110);
  const metric=await page.evaluate(()=>window.littleWorldMetrics);
  samples.push({time:Date.now(),frame:metric.frameId,simMs:metric.timings.simulationMs,
   updateMs:metric.timings.updateMs,renderMs:metric.timings.renderSubmitMs,
   calls:metric.calls,triangles:metric.triangles,renderRate:metric.renderRate,
   qualityLevel:metric.qualityLevel,surfLod:metric.surf?.waterLodTier??null,
   surfTriangles:metric.surf?.patchTriangles??0,mode:metric.mode,
   position:metric.position,gpu:metric.gpu});
 }
 await page.keyboard.up('Shift');await page.keyboard.up('KeyW');
 await page.screenshot({path:dir+'/surf-benchmark-end.png'});
 const first=samples[0],last=samples.at(-1),seconds=(last.time-first.time)/1000;
 const fps=(last.frame-first.frame)/seconds;
 const sorted=samples.map(x=>x.simMs+x.updateMs+x.renderMs).sort((a,b)=>a-b);
 const p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))];
 const surfSampleCount=samples.filter(x=>x.surfLod!==null).length;
 const software=/swiftshader|llvmpipe|softpipe|software|microsoft basic/i.test(hardware.renderer);
 const integrated=/intel.*(uhd|iris|hd graphics)|amd.*(radeon|vega|graphics)|radeon.*(integrated|graphics)/i
 .test(hardware.renderer);
 const ramGiB=totalmem()/1073741824;
 const hardwareEligible=native&&!software&&integrated;
 const targetHardwareEligible=hardwareEligible&&ramGiB>=3.5&&ramGiB<=8.5;
 report={schemaVersion:1,kind:'surf-performance-measurement',
  url:base,hardware,nativeRequested:native,softwareRenderer:software,
  qualifiedIntegratedGpu:targetHardwareEligible&&surfSampleCount>=samples.length*.8&&fps>=20&&p95<=50&&errors.length===0,
  surfActiveSamples:surfSampleCount,surfCoverage:samples.length?surfSampleCount/samples.length:0,
  physicalRamGiB:ramGiB,targetRam4to8GiB:ramGiB>=3.5&&ramGiB<=8.5,
  source:'Chromium Playwright captured live renderer statistics',
  fixedSimulationHz:30,wallSeconds:seconds,samples:samples.length,
  averagePresentedFps:fps,p95FrameWorkMs:p95,minPresentedFpsTarget:20,idealFpsTarget:30,
  maxCalls:Math.max(...samples.map(x=>x.calls)),
  maxTriangles:Math.max(...samples.map(x=>x.triangles)),
  surfZoneCount:(await page.evaluate(()=>window.littleWorldMetrics))?.surf?.zones??0,
  finalPosition:last.position,errors,samples};
 console.log(JSON.stringify({...report,samples:undefined},null,2));
 if(!targetHardwareEligible)console.log('NOT GPU-QUALIFIED: rerun SURF_NATIVE_GPU=1 on a real 4–8GB Intel/AMD integrated-GPU PC.');
 console.log('Surf benchmark artifacts: '+dir);
 if(errors.length)throw Error('Surf browser had '+errors.length+' page errors.');
}finally{
 if(report)writeFileSync(dir+'/surf-benchmark.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
