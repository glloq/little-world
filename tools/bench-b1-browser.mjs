/** B1 scene in Chromium (SwiftShader = CPU rasteriser: relative/regression figures only, NOT a
 * GPU measurement; `submit` is CPU time to submit WebGL work, not GPU time).
 * Places: surface near the mine, inside the mine (level 3), on the farm, at the lake.
 * Usage: node tools/bench-b1-browser.mjs > result.json */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {readdir,stat} from 'node:fs/promises';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pct=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return s.length?+s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2):null;};
const rows=[];
async function sample(page,label,seconds=5){
  const s=await page.evaluate(seconds=>new Promise(resolve=>{const out={interval:[],submit:[],calls:[],tris:[]};let last=performance.now(),seen=-1;const end=last+seconds*1000;
    const step=now=>{const m=window.littleWorldMetrics;if(m&&m.frameId!==seen){seen=m.frameId;out.interval.push(now-last);last=now;out.submit.push(m.timings.renderSubmitMs);out.calls.push(m.calls);out.tris.push(m.triangles);}
      if(now<end)requestAnimationFrame(step);else resolve({...out,act:m.activities,geometries:m.geometries});};requestAnimationFrame(step);}),seconds);
  rows.push({place:label,frames:s.interval.length,intervalP50:pct(s.interval,.5),intervalP95:pct(s.interval,.95),intervalP99:pct(s.interval,.99),submitCpuP50:pct(s.submit,.5),drawCallsP50:pct(s.calls,.5),trianglesP50:pct(s.tris,.5),geometries:s.geometries,mineChunks:s.act?.mineChunks,mineQuads:s.act?.mineQuads,farmInstances:s.act?.farmInstances});
  console.error(JSON.stringify(rows.at(-1)));
}
try{
  for(const [label,spawn,walk] of [['surface (mine entrance)','172.5,22',false],['mine level 3','172.5,22',true],['farm plots','-164,135',false],['lake shore','20,8',false]]){
    const page=await browser.newPage({viewport:{width:960,height:540}});
    await page.goto(`${base}?world=maps/b1-demo/manifest.json&metrics&yaw=0&spawn=${spawn}`);await page.locator('#start:not([disabled])').click({timeout:120000});
    await page.waitForFunction(()=>window.littleWorldMetrics?.activities,{},{timeout:120000});await page.waitForTimeout(2500);
    if(walk){await page.keyboard.down('KeyW');for(let i=0;i<200;i++){await page.waitForTimeout(200);if(await page.evaluate(()=>window.littleWorldMetrics.activities.space?.levelId==='level-3'))break;}await page.keyboard.up('KeyW');await page.waitForTimeout(1500);}
    await sample(page,label);await page.close();
  }
  let bytes=0,files=0;for(const f of await readdir(new URL('../public/maps/b1-demo/chunks',import.meta.url))){bytes+=(await stat(new URL('../public/maps/b1-demo/chunks/'+f,import.meta.url))).size;files++;}
  console.log(JSON.stringify({renderer:'Chromium SwiftShader (CPU)',note:'submit = temps CPU de soumission WebGL, pas un temps GPU',authoredChunks:{files,bytes},rows},null,1));
}finally{await browser.close();}
