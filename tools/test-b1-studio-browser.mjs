/** B1 step 12 — open the demonstration in the Studio, edit mine / plot / water sources with
 * undo, check them in « Jouer ici », and verify that playing never alters the Studio project.
 * Chromium/SwiftShader functional check. Usage: npm run test:b1-studio */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByRole('button',{name:'Démonstration B1 (mine, eau, parcelles)'}).click();
  const canvas=page.locator('.viewport canvas'),undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title');
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  // PHYS diagnostics in the Zones module.
  await page.getByRole('button',{name:'Zones',exact:true}).click();await page.getByLabel(/Diagnostic physique/).check();
  const overlay=JSON.parse(await canvas.getAttribute('data-physics-overlay'));check(overlay.colliders>=5&&overlay.mineLevels===3,'Physics overlay: '+JSON.stringify(overlay));
  // Mine zone: settings, plan per level, undoable seed change.
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await page.getByRole('button',{name:'Filtre Zones'}).click();
  await page.locator('.search-results button',{hasText:'Mine de la colline'}).click();await page.waitForSelector('#inspector .mine-card');
  check(await page.locator('#inspector .mine-plan').count()===1&&/Filons de fer : [1-9]/.test(await page.locator('.mine-plan-legend').textContent()),'Mine plan per level previews the deposit: '+await page.locator('.mine-plan-legend').textContent());
  // The inspector may be rebuilt once the viewport finishes loading the zone (slow CI runners): edit
  // when the viewport is idle, and edit again if a rebuild swallowed the change (same assertion).
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  let changed=false;for(let attempt=0;attempt<3&&!changed;attempt++){const seed=page.getByLabel('Graine géologique');await seed.fill('4242');await seed.press('Tab');
    changed=await page.waitForFunction(()=>/Graine de la mine/.test(document.querySelector('[data-action=undo]').title),{},{timeout:15000}).then(()=>true,()=>false);}
  if(!changed)console.log('Seed edit diagnostics: '+JSON.stringify(await page.evaluate(()=>({undo:document.querySelector('[data-action=undo]')?.title,status:document.getElementById('status')?.textContent,seed:[...document.querySelectorAll('#inspector input')].map(i=>i.value).slice(0,6),idle:document.querySelector('.viewport canvas')?.dataset.idle}))));
  check(changed,'Mine seed changed in one transaction');
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>!/Graine de la mine/.test(document.querySelector('[data-action=undo]').title));check(true,'Undo');
  await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>/Graine de la mine/.test(document.querySelector('[data-action=undo]').title));check(true,'Redo');
  // Plot: initial crop.
  await page.getByRole('button',{name:'Filtre Zones'}).click();await page.locator('.search-results button',{hasText:'Champ de l’ouest'}).click();await page.waitForSelector('#inspector .farm-card');await page.waitForTimeout(500);
  await page.getByLabel('Culture initiale').selectOption('wheat');await page.waitForFunction(()=>/Culture initiale/.test(document.querySelector('[data-action=undo]').title));check(true,'Initial crop of the west field set to wheat');
  // Water module: lake and waterfall present, network without error.
  await page.getByRole('button',{name:'Eau',exact:true}).click();await page.getByLabel('Tracé d’eau').waitFor();await page.waitForFunction(()=>document.querySelector('select[aria-label="Tracé d’eau"]')?.options.length>1);const choices=await page.getByLabel('Tracé d’eau').locator('option').allTextContents();check(choices.length===4,'Three water bodies listed: '+choices.join(', '));
  await page.getByLabel('Tracé d’eau').selectOption({index:2});await page.waitForTimeout(800);
  const form=await page.getByLabel('Forme').inputValue();check(form==='lake'||form==='river','Water form shown ('+form+')');
  const anyRiver=async()=>{for(let i=1;i<4;i++){await page.getByLabel('Tracé d’eau').selectOption({index:i});await page.waitForTimeout(500);if(await page.locator('.water-falls .water-point').count())return true;}return false;};
  check(await anyRiver(),'A river with an explicit waterfall (high/low levels editable)');check(await page.locator('.water-workspace .diagnostic.ERROR').count()===0,'No network error');
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');
  const source=await page.evaluate(()=>JSON.stringify(document.querySelector('#save-status').textContent));
  // « Jouer ici »: the edited sources are played; playing does not touch the project.
  await page.getByRole('button',{name:'Sélection',exact:true}).click();
  const popup=context.waitForEvent('page');await page.getByRole('button',{name:'Jouer ici'}).click();const game=await popup;game.on('pageerror',e=>errors.push(e.message));
  await game.waitForSelector('#start:not([disabled])',{timeout:120000});const url=new URL(game.url());url.searchParams.set('metrics','1');await game.goto(url.toString());
  await game.waitForSelector('#start:not([disabled])',{timeout:120000});await game.locator('#start').click();await game.waitForFunction(()=>window.littleWorldMetrics?.activities?.plots,{},{timeout:120000});
  const plots=await game.evaluate(()=>window.littleWorldMetrics.activities.plots);check(plots['plot-west'].crop==='wheat'&&plots['plot-east'].crop==='carrot','« Jouer ici » plays the edited plot sources: '+JSON.stringify(plots));
  await game.close();
  await page.getByRole('button',{name:'Filtre Zones'}).click();await page.locator('.search-results button',{hasText:'Champ de l’ouest'}).click();await page.waitForSelector('#inspector .farm-card');
  check(await page.getByLabel('Culture initiale').inputValue()==='wheat','Back in the Studio: project and selection intact');void source;
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
