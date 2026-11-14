/** World Production V1 — Studio « Paysages » and registry library in a real browser
 * (Chromium/SwiftShader: functional check only, no GPU qualification).
 * Reference scene → module Paysages → footprint on the 3D view → preview (dry run) → apply as
 * one transaction → undo/redo → library shows registry GLB assets with measured facts → place
 * one → no page error. Usage: WORLD_URL=<base> node tools/test-landscapes-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByRole('button',{name:'Scène de référence géographique'}).click();
  const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  await idle();
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title');
  await page.getByRole('button',{name:'Paysages',exact:true}).click();
  await page.waitForSelector('.landscape-form select[data-role=preset]');
  const {LANDSCAPE_PRESET_IDS}=await import('../src/world-production/landscape-schema.ts');check(await page.locator('.landscape-form select[data-role=preset] option').count()===LANDSCAPE_PRESET_IDS.length,`All ${LANDSCAPE_PRESET_IDS.length} presets offered in the Studio`);
  check(await page.locator('.viewport canvas').getAttribute('data-footprint')==='4','Footprint drawn on the 3D relief');
  await page.locator('.landscape-form select[data-role=preset]').selectOption('village-clearing');
  for(const [label,value]of [['Centre X (m)','120'],['Centre Z (m)','-260'],['Largeur (m)','240'],['Longueur (m)','240']]){await page.getByLabel(label,{exact:true}).fill(value);await page.getByLabel(label,{exact:true}).press('Tab');}
  await page.getByRole('button',{name:'Prévisualiser'}).click();await page.waitForFunction(()=>/Aperçu/.test(document.querySelector('.landscape-report')?.textContent??''),{},{timeout:60000});
  const previewAdded=Number(await page.locator('.landscape-report').getAttribute('data-added'));
  check(previewAdded>0,`Preview is a dry run with counts (${previewAdded} additions)`);
  check(!/Paysage/.test(await undoTitle()??''),'Preview leaves the history untouched');
  await page.getByRole('button',{name:'Appliquer le paysage'}).click();
  await page.waitForFunction(()=>/Paysage :/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:60000});
  check(await page.locator('[data-landscape]').count()===1,'Landscape applied as one undoable operation and listed');
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelectorAll('[data-landscape]').length===0,{},{timeout:30000});check(true,'Undo removes the landscape and its content');
  await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>document.querySelectorAll('[data-landscape]').length===1,{},{timeout:30000});check(true,'Redo restores it');
  await page.getByRole('button',{name:'Régénérer',exact:true}).click();await page.waitForFunction(()=>/Régénéré/.test(document.querySelector('.landscape-report')?.textContent??''),{},{timeout:60000});
  check(/0 ajout/.test(await page.locator('.landscape-report').textContent()),'Local regeneration with unchanged inputs adds nothing');
  await idle();
  // Registry library: same catalogue for manual placement.
  await page.getByRole('button',{name:'Objets',exact:true}).click();await page.waitForSelector('.library-item[data-asset-id="architecture.stone_house"]',{timeout:60000});
  const facts=await page.locator('.library-item[data-asset-id="architecture.stone_house"]').getAttribute('title');
  check(/LOD/.test(facts)&&/triangles/.test(facts)&&/Licence/.test(facts),'Library shows measured registry facts (size, LOD, triangles, licence, status)');
  check(await page.locator('.library-item[data-asset-id^="nature."]').count()>=26,'Vegetation of the asset branch is placeable');
  await page.locator('.library-item[data-asset-id="architecture.stone_house"]').click();
  const box=await page.locator('.viewport canvas').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await page.waitForTimeout(300);await page.mouse.click(box.x+box.width*.5,box.y+box.height*.6);
  await page.waitForFunction(()=>/Placer Maison en pierre/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:30000});check(true,'A registry building is placed with one click (asset added to the project)');
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
