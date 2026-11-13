/** E10 — runtime lighting scenarios in Chromium (SwiftShader = CPU rasteriser: regression and
 * relative cost only, NOT an integrated-GPU measurement). For 0/20/100/500 sources × village /
 * dispersed × day / night × static / moving camera, records frame interval, CPU update time,
 * WebGL submission time (CPU, ≠ GPU time), draw calls, dynamic lights, halos, shader programs,
 * light update CPU time. GPU timer queries are reported when the extension exists.
 * Usage: node tools/bench-lights-browser.mjs [--quick] > result.json */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',quick=process.argv.includes('--quick');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=[];
const pct=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return s.length?+s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2):null;};
try{
  for(const count of quick?[0,500]:[0,20,100,500])for(const layout of ['cluster','spread'])for(const night of [0,1]){
    if(count===0&&layout==='spread')continue;
    const page=await browser.newPage({viewport:{width:960,height:540}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}?metrics&lightBench=${count}&lightLayout=${layout}&night=${night}`);await page.locator('#start:not([disabled])').click({timeout:60000});
    await page.waitForFunction(()=>window.littleWorldMetrics?.lights,{},{timeout:60000});await page.waitForTimeout(2500);
    const gpuTimer=await page.evaluate(()=>{const c=document.createElement('canvas').getContext('webgl2');return !!c?.getExtension('EXT_disjoint_timer_query_webgl2');});
    for(const camera of ['static','moving']){
      if(camera==='moving')await page.keyboard.down('KeyW');
      const sample=await page.evaluate(seconds=>new Promise(resolve=>{const out={interval:[],update:[],submit:[],lightMs:[],calls:[],active:[],glow:[],programs:new Set()};let last=performance.now(),seen=-1;const end=last+seconds*1000;
        const step=now=>{const m=window.littleWorldMetrics;if(m&&m.frameId!==seen){seen=m.frameId;out.interval.push(now-last);last=now;out.update.push(m.timings.updateMs);out.submit.push(m.timings.renderSubmitMs);out.lightMs.push(m.lights.updateMs);out.calls.push(m.calls);out.active.push(m.lights.active);out.glow.push(m.lights.glow);out.programs.add(m.programs);}
          if(now<end)requestAnimationFrame(step);else resolve({...out,programs:[...out.programs],sources:m.lights.sources,pool:m.lights.pool,reselections:m.lights.reselections});};requestAnimationFrame(step);}),quick?3:5);
      if(camera==='moving')await page.keyboard.up('KeyW');
      rows.push({sources:count,layout,night:!!night,camera,frames:sample.interval.length,intervalP50:pct(sample.interval,.5),intervalP95:pct(sample.interval,.95),updateCpuP50:pct(sample.update,.5),submitCpuP50:pct(sample.submit,.5),submitCpuP95:pct(sample.submit,.95),
        lightUpdateUsP95:+(pct(sample.lightMs,.95)*1000).toFixed(1),drawCallsP50:pct(sample.calls,.5),maxDynamic:Math.max(...sample.active),halosMax:Math.max(...sample.glow),pool:sample.pool,shaderPrograms:sample.programs,gpuTimer,errors:errors.length});
      console.error(JSON.stringify(rows.at(-1)));
    }
    await page.close();
  }
  console.log(JSON.stringify({renderer:'Chromium SwiftShader (CPU)',note:'submit = temps CPU de soumission WebGL, pas un temps GPU',rows},null,1));
}finally{await browser.close();}
