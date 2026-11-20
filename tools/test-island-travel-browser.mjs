/** ISL-2: real A -> B -> A travel against the compiled static Pages preview.
 * Each hop navigates to a new document: no two Three.js worlds remain in VRAM. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  await mkdir('/tmp/little-world-browser',{recursive:true});
  const ctx=await browser.newContext({viewport:{width:960,height:640}});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const ready=async(id)=>{
    await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
    await page.waitForFunction(id=>window.littleWorldMetrics?.ferry?.islandId===id,id,{timeout:90000});
    await page.waitForFunction(()=>window.littleWorldMetrics?.chunks?.pending===0,{},{timeout:90000});
  };
  const depart=async(destinationName)=>{
    const ferry=await page.evaluate(()=>window.littleWorldMetrics.ferry);
    assert.ok(ferry.present && ferry.boat && ferry.boarding,'Active ferry should be docked at the boarding point');
    await page.evaluate(point=>window.littleWorldDebug.teleport(point.x,point.z,0),ferry.boarding);
    await page.waitForFunction(()=>/rameur|Navette maritime/i.test(document.querySelector('#action')?.textContent??''),null,{timeout:10000});
    await page.keyboard.press('KeyE');
    const panel=page.locator('[data-panel="ferry"]');
    await panel.waitFor({state:'visible'});
    const card=panel.locator('.ui-ferry-card').filter({hasText:destinationName});
    const button=card.getByRole('button',{name:'Choisir cette île'});
    assert.equal(await button.isDisabled(),false,'Destination button must allow boarding from quay');
    await button.click();
  };
  const catalogResponse=await page.request.get(base+'archipelago/catalog.json');
  assert.ok(catalogResponse.ok());
  const catalog=await catalogResponse.json();
  const destinationId=process.env.FERRY_DESTINATION??'forest-valley';
  const destination=catalog.islands.find(island=>island.id===destinationId&&island.id!=='volcano-island');
  assert.ok(destination,'Pick a published ferry destination distinct from the volcano');
  const manifestResponse=await page.request.get(base+destination.manifest);
  assert.ok(manifestResponse.ok());
  const manifest=await manifestResponse.json();
  await page.goto(base+'?metrics=1',{waitUntil:'domcontentloaded'});
  await ready('volcano-island');
  const before=await page.evaluate(()=>window.littleWorldMetrics);
  assert.equal(before.ferry.worldId,'little-world-island','Reference world must remain unchanged');
  const beforeCoins=await page.evaluate(()=>window.littleWorldMetrics.inventory?.coin??0);
  const granted=await page.evaluate(()=>window.littleWorldDebug.grant('coin',5));
  assert.equal(granted,true,'Five coins can be added to the solo inventory');
  await page.waitForFunction(before=>window.littleWorldMetrics?.inventory?.coin===before+5,beforeCoins,{timeout:10000});
  const coins=await page.evaluate(()=>window.littleWorldMetrics.inventory.coin);
  assert.equal(coins,beforeCoins+5,'The frame metrics show the updated purse');
  await depart(destination.name);
  await page.waitForURL(url=>url.searchParams.get('world')===destination.manifest,{timeout:90000});
  await ready(destination.id);
  const arrived=await page.evaluate(()=>window.littleWorldMetrics);
  assert.equal(arrived.ferry.worldId,manifest.worldId);
  assert.equal(arrived.inventory.coin,coins,'Coins preserved when entering '+destination.id);
  assert.ok(arrived.terrainWork && arrived.chunks.visible>=0,'Destination world booted and rendered');
  const capture=destination.id==='forest-valley'?'forest':destination.id;
  await page.screenshot({path:'/tmp/little-world-browser/ferry-'+capture+'-arrival.png'});
  await depart('Île du volcan');
  await page.waitForURL(url=>url.searchParams.get('world')==='maps/island/manifest.json',{timeout:90000});
  await ready('volcano-island');
  const back=await page.evaluate(()=>window.littleWorldMetrics);
  assert.equal(back.inventory.coin,coins,'Coins preserved after return trip');
  assert.ok((await page.evaluate(()=>localStorage.getItem('little-world:game-save:v1:little-world-island:slot-ferry-auto')))!==null,'Origin state is stored in its separate save slot');
  assert.equal((await page.evaluate(()=>sessionStorage.getItem('little-world:ferry-transit:v1'))),null,'Transit checkpoint consumed exactly once');
  assert.deepEqual(errors,[],'No runtime exceptions');
  console.log(JSON.stringify({travel:'volcano → '+destination.id+' → volcano',coins,frames:back.frameId,errors},null,2));
}finally{await browser.close();}
