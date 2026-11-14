#!/usr/bin/env node
/** World Production V1 — reproducible control viewpoints (WP-5/WP-7).
 * Opens a compiled world at fixed spawn / yaw / pitch / distance, waits until the terrain
 * queue and the dressing queue are drained (GLB species loaded), then writes one PNG per view
 * plus the renderer counters (calls, triangles, dressing instances per LOD). Captures prove
 * reproducibility, not artistic approval. SwiftShader = regression signal, not a GPU bench.
 * Usage: node tools/capture-world-views.mjs <base-url> <output-dir> [views.json]
 *   VIEWS=name1,name2 to filter; CHROMIUM_PATH to choose the browser binary; FORMAT=jpeg,
 *   WIDTH/HEIGHT for the viewport; QUALITY=high|medium|low for the presentation profile. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const base=new URL(process.argv[2]??'http://127.0.0.1:5173/little-world/');
const output=resolve(process.argv[3]??'docs/captures');
const viewsFile=process.argv[4]??new URL('./world-views.json',import.meta.url).pathname;
const views=JSON.parse(await readFile(viewsFile,'utf8')).filter(v=>!process.env.VIEWS||process.env.VIEWS.split(',').includes(v.name));
const viewport={width:Number(process.env.WIDTH??1280),height:Number(process.env.HEIGHT??720)};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir(output,{recursive:true});
const report=[];
try{
  for(const v of views){
    const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
    await page.goto(base.href,{waitUntil:'networkidle'});
    await page.evaluate(q=>localStorage.setItem('little-world-quality',q),process.env.QUALITY??'high');
    const url=new URL(base);url.searchParams.set('metrics','1');url.searchParams.set('world',v.world);url.searchParams.set('spawn',`${v.x},${v.z}`);
    for(const k of ['yaw','pitch','dist'])if(v[k]!==undefined)url.searchParams.set(k,String(v[k]));
    if(v.night)url.searchParams.set('night','1');
    await page.goto(url.href,{waitUntil:'networkidle'});await page.locator('#start').click();
    const t0=performance.now();
    const settled=await page.waitForFunction(()=>{const m=window.littleWorldMetrics;return m&&m.chunks.pending===0&&(!m.dressing||m.dressing.pending===0&&m.dressing.species.state!=='loading');},{},{timeout:45000}).then(()=>true,()=>false);
    await page.waitForTimeout(1500);
    const metrics=await page.evaluate(()=>{const m=window.littleWorldMetrics;return {calls:m.calls,triangles:m.triangles,position:m.position,dressing:m.dressing?{instances:m.dressing.instances,calls:m.dressing.calls,triangles:m.dressing.triangles,cells:m.dressing.cells,species:m.dressing.species}:null,horizon:m.horizon?{triangles:m.horizon.triangles}:null};});
    const jpeg=process.env.FORMAT==='jpeg',file=resolve(output,`${v.name}.${jpeg?'jpg':'png'}`);await page.screenshot({path:file,...(jpeg?{type:'jpeg',quality:78}:{})});
    report.push({name:v.name,label:v.label,settled,settleMs:Math.round(performance.now()-t0),metrics,errors});
    console.log(v.name,settled?'ok':'TIMEOUT',JSON.stringify({calls:metrics.calls,triangles:metrics.triangles,lod0:metrics.dressing?.species.lod0,lod1:metrics.dressing?.species.lod1}),errors.length?errors.slice(0,3):'');
    await context.close();
  }
}finally{await browser.close();}
await writeFile(resolve(output,'views-report.json'),JSON.stringify({recordedAt:new Date().toISOString(),base:base.href,viewport,renderer:'Chromium headless + SwiftShader (logiciel) — non qualifiant GPU',views:report},null,2)+'\n');
