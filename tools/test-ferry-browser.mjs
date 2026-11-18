/** Minimal ferry-browser smoke: published Pages catalog, port avatar, M map and preview. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {newCargoState,advanceCargo,CARGO_STORAGE_KEY} from '../src/archipelago/cargo-logistics.ts';

const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try{
  await mkdir('/tmp/little-world-browser',{recursive:true});
  const page=await browser.newPage({viewport:{width:960,height:640}});
  page.on('pageerror',err=>errors.push(err.message));
  // The pure logistics tests validate dispatch and receipt. The browser test starts with
  // already-delivered foreign cargo so it can verify the actual harbour panel quickly.
  const delivered=newCargoState();advanceCargo(delivered,55);
  await page.addInitScript(({key,value})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,value);
  },{key:CARGO_STORAGE_KEY,value:JSON.stringify(delivered)});
  await page.goto(base+'?metrics=1',{waitUntil:'domcontentloaded'});
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
  await page.waitForFunction(()=>window.littleWorldMetrics?.ferry!==undefined,{},{timeout:30000});
  const ferry=await page.evaluate(()=>window.littleWorldMetrics.ferry);
  assert.equal(ferry.islandId,'volcano-island');
  assert.equal(ferry.level,0);
  assert.equal(ferry.present,true);
  assert.ok(ferry.boat && ferry.boarding,'Ferry must have a navigable mooring and a shore boarding anchor');
  const response=await page.request.get(base+'archipelago/catalog.json');
  assert.equal(response.status(),200);
  assert.equal((await response.json()).islands.length,2,'Exactly two published compiled islands');
  await page.keyboard.press('KeyM');
  const map=page.locator('[data-panel="map"]');
  await map.waitFor();
  const icons=await map.locator('.ui-map-entry').allTextContents();
  assert.ok(icons.some(label=>label.includes('Bateau de voyage')),'The ferry appears on player map while docked');
  // The map marker opens schedules without granting remote departure rights.
  await map.getByRole('button',{name:'Options de carte'}).click();
  const entry=map.locator('.ui-map-entry').filter({hasText:'Bateau de voyage'});
  await entry.getByRole('button',{name:'Horaires',exact:true}).click();
  const panel=page.locator('[data-panel="ferry"]');
  await panel.waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  // Physical interaction with the ferryman from the quay.
  await page.evaluate(point=>window.littleWorldDebug.teleport(point.x,point.z,0),ferry.boarding);
  await page.waitForTimeout(500);
  const actual=await page.evaluate(()=>({position:window.littleWorldMetrics?.position,target:window.littleWorldMetrics?.target,boarding:window.littleWorldMetrics?.ferry?.boarding}));
  console.log('FERRY_BOARDING '+JSON.stringify(actual));
  const prompt=await page.locator('#action').textContent();
  assert.match(prompt??'',/rameur|Navette maritime/i,'Shore boarding interaction: '+JSON.stringify(actual));
  await page.keyboard.press('KeyE');
  await panel.waitFor({state:'visible'});
  assert.match(await panel.textContent(),/Île du volcan/);
  // ECO-7: if the new N1 merchant was placed, import trade is activated at
  // the stand (not by speaking to the rower). Legacy maps retain the old quay UI.
  const maritime=await page.evaluate(()=>window.littleWorldMetrics.maritimePort);
  if(maritime?.active){
    await page.keyboard.press('Escape');
    await page.evaluate(point=>window.littleWorldDebug.teleport(point.x,point.z,0),maritime.trade??maritime.stand);
    await page.waitForTimeout(350);
    assert.match(await page.locator('#action').textContent()??'',/Commercer/i);
    await page.keyboard.press('KeyE');
    const merchant=page.locator('[data-panel="maritime-trade"]');
    await merchant.waitFor({state:'visible'});
    await merchant.getByRole('button',{name:/Voir les importations/}).click();
  }else{
    const importsButton=panel.getByRole('button',{name:/Voir les importations/});
    assert.equal(await importsButton.isEnabled(),true,'Legacy quay import action remains accessible');
    await importsButton.click();
  }
  const imports=page.locator('[data-panel="imports"]');
  await imports.waitFor({state:'visible'});
  const rows=imports.locator('.ui-import-row');
  assert.equal(await rows.count(),2,'Only two foreign delivered lots on volcanic island');
  assert.match(await imports.textContent(),/forest-valley/);
  const logs=rows.filter({hasText:'Bûche'});
  await logs.getByRole('button',{name:'Acheter',exact:true}).click();
  await page.waitForFunction(()=>window.littleWorldMetrics?.inventory?.['wood:log']===1,
    {},{timeout:5000});
  assert.equal(await page.evaluate(()=>window.littleWorldMetrics.inventory.coin),33,
    'Imported log costs seven coins with freight');
  const ledger=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),CARGO_STORAGE_KEY);
  const remaining=ledger.importLots['volcano-island'].find(x=>x.itemId==='wood:log');
  assert.equal(remaining.quantity,4,'Import lot debited once after purchase');
  // Simulate an interrupted local gameplay save *after* the cargo ledger committed.
  // The durable receipt in the cargo ledger must recover the wallet on the next boot.
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>
    k.startsWith('little-world:game-save:v1:')&&k.endsWith(':slot-ferry-auto')),
    {},{timeout:10000});
  await page.evaluate(()=>{
    for(const key of Object.keys(localStorage))
      if(key.startsWith('little-world:game-save:v1:')&&key.endsWith(':slot-ferry-auto'))
        localStorage.removeItem(key);
  });
  // Crash/reload recovery: cargo and the post-payment bag must agree, without a second
  // purchase or a default 40-coin restart, even with the world slot missing.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
  await page.waitForFunction(()=>window.littleWorldMetrics?.inventory?.['wood:log']===1
    &&window.littleWorldMetrics?.inventory?.coin===33,{},{timeout:30000});
  const afterReload=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),CARGO_STORAGE_KEY);
  assert.equal(afterReload.importLots['volcano-island'].find(x=>x.itemId==='wood:log').quantity,4,
    'Reload never duplicates imported stock');
  assert.equal(afterReload.purchases.length,1,'Reload does not purchase twice');
  assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>
    k.startsWith('little-world:game-save:v1:')&&k.endsWith(':slot-ferry-auto'))),
    'World slot is reconstructed from the committed import receipt');
  // Camera orientation is intentionally NOT persisted as part of the wallet receipt:
  // opening ferry schedules from the map remains valid regardless of spawn heading.
  await page.keyboard.press('KeyM');
  await map.waitFor({state:'visible'});
  await map.getByRole('button',{name:'Options de carte'}).click();
  await map.locator('.ui-map-entry').filter({hasText:'Bateau de voyage'})
    .getByRole('button',{name:'Horaires',exact:true}).click();
  await panel.waitFor({state:'visible'});
  const trial=panel.getByRole('button',{name:/cinématique de voyage/i});
  await trial.click();
  await page.locator('.ui-ferry-cinematic').waitFor({state:'visible'});
  await page.screenshot({path:'/tmp/little-world-browser/ferry-cinematic.png'});
  await page.locator('.ui-ferry-cinematic').waitFor({state:'detached',timeout:7000});
  assert.equal(await page.evaluate(()=>window.littleWorldMetrics.ferry.islandId),'volcano-island','Preview never switches worlds or discards saves');
  assert.deepEqual(errors,[]);
  console.log('Ferry: published registry, map marker, shore interaction and preview validated');
}finally{await browser.close();}
