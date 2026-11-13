/** E9 — geographic editing in a real browser (Chromium/SwiftShader: functional check only).
 * Rectangle region on the reference scene: select its content, fill a material while
 * protecting earlier corrections, flatten the relief in one transaction, then the touched
 * authored elements are checked and listed; 2D ↔ 3D keep the same history.
 * Usage: npm run test:geo-edit */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByRole('button',{name:'Scène de référence géographique'}).click();
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  const ready=()=>page.waitForFunction(()=>{const c=document.querySelector('#panel-host canvas');return c&&c.width>10&&c.dataset.mapPending==='0';},{},{timeout:120000});
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title');
  await page.getByRole('button',{name:'Carte globale',exact:true}).click();await ready();
  const canvas=page.locator('#panel-host canvas'),boxOf=await canvas.boundingBox();
  const view=async()=>JSON.parse(await canvas.getAttribute('data-view'));
  const screen=async(x,z)=>{const v=await view();return {x:boxOf.x+v.width/2+(x-v.cx)*v.ppm,y:boxOf.y+v.height/2+(z-v.cz)*v.ppm};};
  // Zoom on the village (200, 360).
  let p=await screen(200,360);await page.mouse.move(p.x,p.y);for(let i=0;i<9;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(25);}await ready();
  // Rectangle around the village (houses + paths).
  await page.locator('.layer-row[data-layer=material] .layer-name').click();await page.locator('button[data-tool=rect]').click();
  const a=await screen(150,320),b=await screen(250,400);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();
  check(await page.locator('.region-card[data-shape=rect]').count()===1,'Rectangle region with its actions');
  const select=page.getByRole('button',{name:/Sélectionner le contenu \((\d+)\)/});const n=Number((await select.textContent()).match(/\d+/)[0]);
  await select.click();await page.waitForFunction(()=>/éléments/.test(document.querySelector('#inspector h3')?.textContent??''));check(n>=4,`Region content selected from the map (${n} elements: houses and paths)`);
  await page.getByLabel('Protéger les corrections existantes').check();await page.locator('.legend-item[data-code=v]').click();
  await page.locator('button[data-tool=rect]').click();await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();
  await page.getByRole('button',{name:/^Remplir/}).click();await page.waitForFunction(()=>/Remplir matériaux/.test(document.querySelector('[data-action=undo]').title));check(true,'Material fill on a region is one operation');
  // Relief: flatten the village rectangle (one transaction), touched elements are checked.
  await page.locator('.layer-row[data-layer=altitude] .layer-name').click();await page.locator('button[data-tool=rect]').click();
  const c=await screen(120,300),d=await screen(280,420);await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(d.x,d.y,{steps:6});await page.mouse.up();
  await page.getByLabel('Hauteur (m)').fill('8');await page.getByLabel('Hauteur (m)').press('Tab');
  await page.getByRole('button',{name:'Élever la zone'}).click();await page.waitForFunction(()=>/Élever la zone/.test(document.querySelector('[data-action=undo]').title));check(true,'Relief raised over the region in one operation');
  await page.waitForSelector('.impact-card',{timeout:30000});const count=Number(await page.locator('.impact-card').getAttribute('data-count'));
  check(await page.locator('.impact-card').count()===1,`Touched elements checked after the relief change (${count} to verify)`);
  if(count){await page.locator('.impact-card .diagnostic').first().click();await page.waitForFunction(()=>!!document.querySelector('#inspector .selection-tag'));check(true,'A reported element is selected from the diagnostic');}
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>/Remplir matériaux/.test(document.querySelector('[data-action=undo]').title));check(true,'Undo of the region relief change');
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  check(/Remplir matériaux/.test(await undoTitle()),'Same history in the 3D view');
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
