/** Minimal ferry-browser smoke: published Pages catalog, port avatar, M map and preview. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try{
  await mkdir('/tmp/little-world-browser',{recursive:true});
  const page=await browser.newPage({viewport:{width:960,height:640}});
  page.on('pageerror',err=>errors.push(err.message));
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
  assert.equal((await response.json()).islands.length,1,'No fictitious second island');
  await page.keyboard.press('KeyM');
  const map=page.locator('[data-panel="map"]');
  await map.waitFor();
  const icons=await map.locator('.ui-map-entry').allTextContents();
  assert.ok(icons.some(label=>label.includes('Bateau de voyage')),'The ferry appears on player map while docked');
  // The map marker opens schedules without granting remote departure rights.
  const entry=map.locator('.ui-map-entry').filter({hasText:'Bateau de voyage'});
  await entry.getByRole('button',{name:'Horaires du bateau de voyage'}).click();
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
  const trial=panel.getByRole('button',{name:/cinématique de voyage/i});
  await trial.click();
  await page.locator('.ui-ferry-cinematic').waitFor({state:'visible'});
  await page.screenshot({path:'/tmp/little-world-browser/ferry-cinematic.png'});
  await page.locator('.ui-ferry-cinematic').waitFor({state:'detached',timeout:7000});
  assert.equal(await page.evaluate(()=>window.littleWorldMetrics.ferry.islandId),'volcano-island','Preview never switches worlds or discards saves');
  assert.deepEqual(errors,[]);
  console.log('Ferry: published registry, map marker, shore interaction and preview validated');
}finally{await browser.close();}
