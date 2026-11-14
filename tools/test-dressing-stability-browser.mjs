/** Near objects stay drawn (doc 42 §3 quinquies): after a long trip across the island (teleport hops
 * of 48 m, like gliding or rolling, enough to fill the dressing cell cache), the trees and rocks
 * around the player are the same as on a fresh load and none of them vanishes while standing still
 * or walking. Regression of the cache eviction that dropped the NEAREST cells first.
 * Chromium/SwiftShader functional check. Usage: WORLD_URL=<base> node tools/test-dressing-stability-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
const TARGET=[-700,1020],TREES_OR_ROCKS=k=>!/^(ground|deadwood|gather|shrub):/.test(k);
async function open(page,query){await page.goto(base+'?metrics=1&'+query,{waitUntil:'domcontentloaded'});await page.waitForSelector('#start:not([disabled])',{timeout:120000});await page.locator('#start').click();
  await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0&&window.littleWorldMetrics?.dressing?.pending===0,{},{timeout:120000});await page.waitForTimeout(1200);}
const near=(page,r)=>page.evaluate(r=>window.littleWorldDebug.drawnNear(r),r);
try{
  const errors=[];
  // Reference: fresh load at the target.
  const fresh=await (await browser.newContext({viewport:{width:800,height:500}})).newPage();fresh.on('pageerror',e=>errors.push(e.message));
  await open(fresh,`spawn=${TARGET}&yaw=0`);const expected=(await near(fresh,45)).filter(TREES_OR_ROCKS).sort();await fresh.close();
  check(expected.length>=8,'Fresh load: '+expected.length+' trees and rocks within 45 m of the target');
  // Long trip, then the same spot.
  const page=await (await browser.newContext({viewport:{width:800,height:500}})).newPage();page.on('pageerror',e=>errors.push(e.message));
  await open(page,'spawn=-600,600&yaw=0');
  const route=[[-600,600],[-600,-500],[600,-500],[600,700],TARGET];
  for(let k=0;k+1<route.length;k++){const [ax,az]=route[k],[bx,bz]=route[k+1],n=Math.ceil(Math.hypot(bx-ax,bz-az)/48),h=Math.atan2(bx-ax,bz-az);
    for(let i=0;i<=n;i++)await page.evaluate(([x,z,h])=>window.littleWorldDebug.teleport(x,z,h),[ax+(bx-ax)*i/n,az+(bz-az)*i/n,h]).then(()=>page.waitForTimeout(120));}
  await page.waitForFunction(()=>window.littleWorldMetrics?.dressing?.pending===0,{},{timeout:60000});await page.waitForTimeout(1500);
  const cells=await page.evaluate(()=>window.littleWorldMetrics.dressing.cells);check(cells>=900,'Cache filled by the trip ('+cells+' cells)');
  const after=(await near(page,45)).filter(TREES_OR_ROCKS).sort();
  check(JSON.stringify(after)===JSON.stringify(expected),`After 4 km of travel the same ${after.length} trees and rocks are drawn around the player (fresh: ${expected.length})`);
  // Standing still 4 s: nothing within 45 m vanishes.
  let vanished=0;let prev=new Set(after);for(let s=0;s<20;s++){await page.waitForTimeout(200);const now=new Set((await near(page,45)).filter(TREES_OR_ROCKS));for(const k of prev)if(!now.has(k))vanished++;prev=now;}
  check(vanished===0,'Standing still: no near tree or rock vanishes ('+vanished+')');
  // Walking 6 s: no tree or rock still within 35 m disappears.
  await page.keyboard.down('KeyW');let lost=0,last=null;const t0=Date.now();
  while(Date.now()-t0<6000){const s=await page.evaluate(()=>({p:window.littleWorldMetrics.position,k:window.littleWorldDebug.drawnNear(60)}));
    if(last){const now=new Set(s.k);for(const key of last)if(TREES_OR_ROCKS(key)&&!now.has(key)){const [,x,z]=key.split(':').map(Number);if(Math.hypot(x-s.p[0],z-s.p[2])<35)lost++;}}last=s.k;await page.waitForTimeout(100);}
  await page.keyboard.up('KeyW');
  check(lost===0,'Walking: no tree or rock within 35 m disappears ('+lost+')');
  check(errors.length===0,'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
