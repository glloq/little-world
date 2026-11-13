/** Studio geography costs on a new 3 × 8 km island project (same flow before/after):
 * opening the global map, 2D → 3D switch, returning to the map. SwiftShader software
 * rendering: regression signal only. Usage: node tools/benchmark-geography.mjs <base> <label> */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const base=process.argv[2]??'http://127.0.0.1:5173/little-world/',label=process.argv[3]??'run';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/'+(process.env.QUERY??''));await page.getByLabel('Nom du projet').fill('Bench géo');await page.getByLabel('Modèle et dimensions').selectOption('island');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const idle3d=()=>page.waitForFunction(()=>{const c=document.querySelector('.viewport canvas');return c&&!c.closest('[hidden]')&&c.dataset.idle==='true'&&c.dataset.pending==='0';},{},{timeout:120000,polling:20});
  await idle3d();
  const mapReady=()=>page.waitForFunction(()=>{const c=document.querySelector('#panel-host canvas');return c&&c.width>10&&(c.dataset.mapPending??'0')==='0';},{},{timeout:120000,polling:20});
  const runs=[];
  for(let i=0;i<3;i++){
    let t=performance.now();await page.getByRole('button',{name:'Carte globale',exact:true}).click();await mapReady();const open=performance.now()-t;
    t=performance.now();await page.getByRole('button',{name:'Sélection',exact:true}).click();await idle3d();const to3d=performance.now()-t;runs.push({open,to3d});
  }
  const median=k=>runs.map(r=>r[k]).sort((a,b)=>a-b)[1];
  console.log(JSON.stringify({label,openMapMs:Math.round(median('open')),firstOpenMapMs:Math.round(runs[0].open),map2dTo3dMs:Math.round(median('to3d')),heapMB:await page.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null)}));
}finally{await browser.close();}
