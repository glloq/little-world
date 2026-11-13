/** G2 — layered 2D map editor in a real browser (Chromium/SwiftShader: functional check only).
 * Layers panel, tool palette per layer, one stroke = one transaction, undo/redo, lock,
 * polygon fill + restoration preview, 2D ↔ 3D round trip. Usage: npm run test:geomap */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(v,message)=>{assert.ok(v,message);checks++;console.log('OK:',message);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Carte par couches');await page.getByLabel('Modèle et dimensions').selectOption('island');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  const ready=()=>page.waitForFunction(()=>{const c=document.querySelector('#panel-host canvas');return c&&c.width>10&&c.dataset.mapPending==='0';},{},{timeout:120000});
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title');
  await page.getByRole('button',{name:'Carte globale',exact:true}).click();await ready();
  check(await page.locator('.layer-row').count()===8,'Eight geographic layers listed');
  const canvas=page.locator('#panel-host canvas'),box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  // Zoom on the centre of the island.
  await page.mouse.move(cx,cy+120);for(let i=0;i<8;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(25);}await ready();
  check(/4 m\/px|2 m\/px|1 m\/px/.test(await page.locator('.map-note').textContent()),'Progressive detail level follows the zoom');
  // Tool palette adapts to the layer.
  await page.locator('.layer-row[data-layer=slope] .layer-name').click();
  check(await page.locator('button[data-tool]').count()===2,'Computed slope layer offers navigation tools only');
  await page.locator('.layer-row[data-layer=altitude] .layer-name').click();
  check(await page.locator('button[data-tool=raise]').count()===1&&await page.locator('button[data-tool=paint]').count()===0,'Altitude layer offers relief tools');
  await page.locator('.layer-row[data-layer=material] .layer-name').click();
  check(await page.locator('button[data-tool=paint]').count()===1&&await page.locator('.legend-item').count()===11,'Material layer offers brushes and its 11 values');
  // One stroke = one transaction.
  await page.locator('button[data-tool=paint]').click();await page.locator('.legend-item[data-code=s]').click();
  const stroke=async(dx)=>{await page.mouse.move(cx-120+dx,cy);await page.mouse.down();for(let i=1;i<=15;i++)await page.mouse.move(cx-120+dx+i*16,cy+i*4);await page.mouse.up();};
  await stroke(0);await page.waitForFunction(()=>/Peindre matériaux/.test(document.querySelector('[data-action=undo]').title));
  check(/Peindre matériaux/.test(await undoTitle()),'A whole brush stroke is one undoable operation');
  await ready();await page.mouse.move(cx-120+8*16,cy+8*4);await page.waitForTimeout(150);
  check(/Sable/.test(await page.locator('.map-readout').textContent()),'Painted value read back at the cursor (same engine as the game)');
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>!/Peindre/.test(document.querySelector('[data-action=undo]').title));await ready();
  await page.mouse.move(cx-120+8*16+1,cy+8*4);await page.waitForTimeout(150);
  check(!/Sable/.test(await page.locator('.map-readout').textContent()),'Undo restores the generated material');
  await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>/Peindre/.test(document.querySelector('[data-action=undo]').title));check(true,'Redo re-applies the stroke');
  // Locking forbids edits.
  await page.locator('.layer-row[data-layer=material] .layer-icon').first().click();
  check(await page.locator('button[data-tool=paint]').isDisabled(),'Locked layer disables editing tools');
  await page.locator('.layer-row[data-layer=material] .layer-icon').first().click();
  // Polygon region: fill with preview, then restore generation.
  await page.locator('.layer-row[data-layer=biome] .layer-name').click();await page.locator('button[data-tool=polygon]').click();
  for(const [x,y]of [[cx+40,cy-60],[cx+140,cy-60],[cx+140,cy+40]])await page.mouse.click(x,y);
  await page.mouse.dblclick(cx+40,cy+40);
  check(await page.locator('.region-card').count()===1,'Closed polygon shows region actions with a preview');
  await page.getByRole('button',{name:/^Remplir/}).click();await page.waitForFunction(()=>/Remplir biomes/.test(document.querySelector('[data-action=undo]').title));check(true,'Polygon fill is one operation');
  for(const [x,y]of [[cx+30,cy-70],[cx+150,cy-70],[cx+150,cy+50]])await page.mouse.click(x,y);await page.keyboard.press('Enter');
  const restore=page.getByRole('button',{name:/Rétablir la génération \(biomes, [1-9]\d* cellule/});check(await restore.count()===1,'Restoration preview counts the corrections it will remove');
  await restore.click();await page.waitForFunction(()=>/Rétablir la génération/.test(document.querySelector('[data-action=undo]').title));check(true,'Local restoration is one operation');
  // 2D ↔ 3D keeps history and context.
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  check(/Rétablir la génération/.test(await undoTitle()),'History is shared with the 3D view');
  await page.getByRole('button',{name:'Carte globale',exact:true}).click();await ready();
  check(await page.locator('.layer-row.active').getAttribute('data-layer')==='biome','Active layer and layer settings persist across 2D/3D switches');
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');check(true,'Edits saved locally');
  // G3 — relief shapes on an archipelago project.
  await page.getByRole('button',{name:'Mes projets',exact:true}).click();await page.getByLabel('Nom du projet').fill('Archipel formes');await page.getByLabel('Modèle et dimensions').selectOption('archipelago');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  await page.getByRole('button',{name:'Carte globale',exact:true}).click();await ready();
  const before=await page.evaluate(()=>Number(document.querySelector('.viewport canvas').dataset.generatorRevision??0));
  await page.locator('.layer-row[data-layer=altitude] .layer-name').click();await page.locator('button[data-tool=shape]').click();
  check(await page.locator('[data-add]').count()===8,'Shape tool offers islets and the seven relief forms');
  await page.locator('[data-add=hill]').click();const c2=await canvas.boundingBox();await page.mouse.click(c2.x+c2.width/2+20,c2.y+c2.height/2);
  await page.waitForFunction(()=>/Ajouter : Colline/.test(document.querySelector('[data-action=undo]').title));check(await page.locator('.shape-card').count()===1,'Placed hill is selected with its parameters');
  const hand=await page.locator('.shape-card').textContent();check(/Rayon/.test(hand)&&/Rugosité/.test(hand),'Hill parameters exposed');
  await page.mouse.move(c2.x+c2.width/2+20,c2.y+c2.height/2);await page.mouse.down();for(let i=1;i<=8;i++)await page.mouse.move(c2.x+c2.width/2+20+i*4,c2.y+c2.height/2+i*3);await page.mouse.up();
  await page.waitForFunction(()=>/Déplacer une forme/.test(document.querySelector('[data-action=undo]').title));check(true,'Dragging a shape is one operation');
  await page.getByRole('button',{name:'Varier (aperçu)'}).click();check(await page.locator('.thumb-pair canvas').count()===2,'Variation shows current vs candidate before commit');
  await page.getByRole('button',{name:'Appliquer cette variante'}).click();await page.waitForFunction(()=>/Varier une forme/.test(document.querySelector('[data-action=undo]').title));check(true,'Variation applied as one operation');
  await page.getByText('Presets de relief',{exact:true}).click();await page.locator('[data-preset=chain]').click();check(await page.locator('.presets .relief-thumb').count()===1,'Preset preview before applying');
  await page.getByRole('button',{name:'Appliquer ce relief'}).click();await page.waitForFunction(()=>/Appliquer un preset de relief/.test(document.querySelector('[data-action=undo]').title));await ready();check(true,'Preset applied as one operation');
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>/Varier une forme/.test(document.querySelector('[data-action=undo]').title));check(true,'Undo restores the previous relief');
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true',{},{timeout:120000});
  check(await page.evaluate(()=>Number(document.querySelector('.viewport canvas').dataset.generatorRevision??0))>before,'3D view rebuilt the relief after shape edits');
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
