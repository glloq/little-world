/** Studio inspector: a value being typed survives an inspector re-render.
 * One action triggers several debounced inspector renders (selection, transaction, viewport
 * refresh; up to ≈ 310 ms later). Before the fix, a late render replaced the field being edited:
 * focus and typed value were lost and no transaction was created. Usage: npm run test:inspector-edit */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Inspecteur stable');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const canvas=page.locator('.viewport canvas'),tool=t=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,t);
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:60000});const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.getByRole('button',{name:'Lumières',exact:true}).click();await tool('select');await page.getByRole('button',{name:'Placer une lumière'}).click();await tool('place');
  for(const dx of [-80,80]){await page.mouse.move(cx+dx,cy);await page.mouse.click(cx+dx,cy);}
  await page.waitForFunction(()=>JSON.parse(document.querySelector('.viewport canvas').dataset.lights??'{}').sources===2);await page.keyboard.press('Escape');await tool('select');
  // Count inspector renders (its children replaced).
  await page.evaluate(()=>{window.__renders=0;new MutationObserver(m=>{if(m.some(r=>r.addedNodes.length))window.__renders++;}).observe(document.querySelector('#inspector'),{childList:true});});
  const renders=()=>page.evaluate(()=>window.__renders);
  for(const [row,value] of [[0,'40'],[1,'55']]){
    // Select a light, then type as soon as its card appears (later renders are still pending).
    await page.locator('.light-row').nth(row).click();await page.waitForSelector('#inspector .light-card');
    const field=page.getByLabel('Intensité (cd)');await field.click();await page.keyboard.press('Control+a');await page.keyboard.type(value);const before=await renders();
    // Zoom the camera with the wheel while typing: focus stays in the field, but the camera state is
    // stored in the shared selection context, which re-renders the inspector (real trigger, no test hook).
    await page.mouse.move(cx,cy+120);for(let i=0;i<3;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(80);}
    await page.waitForFunction(n=>window.__renders>n,before,{timeout:3000}).catch(()=>{});await page.waitForTimeout(500);
    const state=await page.evaluate(()=>({focused:document.activeElement?.getAttribute('aria-label'),value:document.activeElement?.value,connected:document.activeElement?.isConnected}));
    check((await renders())>before,`Inspector re-rendered while typing (light ${row+1})`);
    check(state.focused==='Intensité (cd)'&&state.value===value,`Focus and typed value kept across the render (${JSON.stringify(state)})`);
    await page.keyboard.press('Tab');await page.waitForFunction(()=>/Intensité de la lumière/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:5000}).catch(()=>{});
    check(/Intensité de la lumière/.test(await page.locator('[data-action=undo]').getAttribute('title')),'Tab commits the edit as one transaction');
    await page.waitForFunction(v=>[...document.querySelectorAll('#inspector input')].find(i=>i.getAttribute('aria-label')==='Intensité (cd)')?.value===v,value,{timeout:5000});check(true,'The committed value is displayed after the transaction');
  }
  check(errors.length===0,errors.join('\n')||'No page errors');console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
