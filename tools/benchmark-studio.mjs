/** Studio 3D view cost, comparable across the old local view and the persistent viewport.
 * Reference scenario, same entity, 1440×900, SwiftShader (software: regression signal only,
 * not a GPU measurement; JS timings include software rasterisation).
 * Usage: node tools/benchmark-studio.mjs <base-url> <label> */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5173/little-world/',label=process.argv[3]??'run';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;window.__webglContexts=0;HTMLCanvasElement.prototype.getContext=function(type,...rest){if(String(type).startsWith('webgl')&&!this.__counted){this.__counted=true;window.__webglContexts++;}return original.call(this,type,...rest);};});
  await page.goto(base+'studio/');await page.getByRole('button',{name:'Ouvrir le scénario de référence'}).click();await page.waitForTimeout(1500);
  const modern=await page.locator('.viewport canvas').count()>0||await page.locator('#modules [data-module]').count()>0;
  const view3d=modern?'.viewport canvas':'#workspace canvas';
  const toMap=()=>page.getByRole('button',{name:'Carte globale',exact:true}).click();
  const to3d=async()=>{if(modern)await page.getByRole('button',{name:'Sélection',exact:true}).click();else await page.getByRole('button',{name:'Vue 3D locale',exact:true}).click();};
  const idle=()=>page.waitForFunction(sel=>{const c=document.querySelector(sel);return c&&!c.hidden&&c.dataset.idle==='true'&&(c.dataset.pending??'0')==='0'&&Number(c.dataset.renderCount)>2;},view3d,{timeout:120000,polling:20});
  await toMap();await page.waitForTimeout(800);
  await page.getByLabel('Rechercher une entité').fill('Panier de glands');await page.locator('.search-results button').first().click();await page.waitForTimeout(500);
  let t=performance.now();await page.getByRole('button',{name:'Voir en 3D',exact:true}).click();await idle();const openMs=performance.now()-t;
  const stats=async()=>page.evaluate(sel=>{const c=document.querySelector(sel),d=c.dataset;const note=document.querySelector('#workspace .map-note')?.textContent??'';const diag=d.diagnostics?JSON.parse(d.diagnostics):null;
    return {calls:Number(d.calls??(/(\d+) appels/.exec(note)?.[1]??NaN)),geometries:diag?.geometries??null,webglContexts:window.__webglContexts,heapMB:performance.memory?performance.memory.usedJSHeapSize/1048576:null};},view3d);
  const atOpen=await stats();
  const trips=[];for(let i=0;i<5;i++){await toMap();await page.waitForTimeout(300);t=performance.now();await to3d();await idle();trips.push(performance.now()-t);}
  const after=await stats();trips.sort((a,b)=>a-b);
  console.log(JSON.stringify({label,ui:modern?'persistent-viewport':'local-view',openMs:Math.round(openMs),returnTo3dMs:{median:Math.round(trips[2]),max:Math.round(trips[4])},drawCalls:atOpen.calls,geometries:atOpen.geometries,webglContextsAfter5Trips:after.webglContexts,heapMB:after.heapMB&&Math.round(after.heapMB)}));
}finally{await browser.close();}
