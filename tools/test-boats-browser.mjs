/** Docks and boats on the published island (doc 42 §boats): walk from the shore onto a dock (deck,
 * not water), the moored boats are part of the fleet, E boards the nearest one, it sails out of
 * the shallow port, E steps off (dock/shore within reach, otherwise swimming) and the boat stays
 * where it was left. Chromium/SwiftShader functional check.
 * Usage: WORLD_URL=<base> node tools/test-boats-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await (await browser.newContext({viewport:{width:960,height:600}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const m=()=>page.evaluate(()=>window.littleWorldMetrics);
  // Port of the north coast: dock tiles at x 300, z 1390 → 1408 (beach → sea), boats moored along it.
  await page.goto(base+'?metrics=1&spawn=300,1386&yaw=0',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#start:not([disabled])',{timeout:120000});await page.locator('#start').click();
  await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:120000});await page.waitForTimeout(800);
  const start=await m();check(start.boats.count>=9,'Fleet: the player boat and the moored boats ('+start.boats.count+')');
  // 1. Walk along the dock (north): on the deck, not in the water.
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.littleWorldMetrics?.position[2]>1403,{},{timeout:15000}).catch(()=>{});await page.keyboard.up('KeyW');await page.waitForTimeout(400);
  const deck=await m();check(deck.position[2]>1400&&deck.mode==='ground'&&deck.position[1]>.3,`Walking on the dock above the sea (z ${deck.position[2].toFixed(1)}, y ${deck.position[1].toFixed(2)}, ${deck.mode})`);
  await page.screenshot({path:'/tmp/little-world-browser/boats-dock.png'});
  // 2. Board the nearest moored boat with E.
  check(/bateau|Embarquer|Monter/i.test(deck.target??''),'A moored boat is offered: '+deck.target);
  await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.littleWorldMetrics?.boats.aboard,{},{timeout:5000}).catch(()=>{});
  const on=await m();check(on.boats.aboard&&on.boats.current!=='player-boat','Aboard a moored port boat ('+on.boats.current+')');
  // 3. Sail away from the shallow port (W), turning a little.
  // Turn toward the open sea (north, +Z) then go: the shallow port allows any move that gets deeper.
  const b0=on.boatPosition;
  for(const turn of ['KeyA','KeyD']){const before=(await m()).boatPosition;await page.keyboard.down(turn);await page.keyboard.down('KeyW');await page.waitForTimeout(3500);await page.keyboard.up(turn);await page.waitForTimeout(2500);await page.keyboard.up('KeyW');
    const now=(await m()).boatPosition;if(Math.hypot(now[0]-before[0],now[2]-before[2])>6)break;}
  await page.waitForTimeout(600);
  const sailed=await m(),moved=Math.hypot(sailed.boatPosition[0]-b0[0],sailed.boatPosition[2]-b0[2]);
  check(moved>6,'The moored boat sails out of the port ('+moved.toFixed(1)+' m)');
  await page.screenshot({path:'/tmp/little-world-browser/boats-sailing.png'});
  // 4. Step off: the boat stays there.
  const left=(await m()).boatPosition;
  await page.keyboard.press('KeyE');await page.waitForFunction(()=>!window.littleWorldMetrics?.boats.aboard,{},{timeout:5000}).catch(()=>{});await page.waitForTimeout(1000);
  const off=await m();check(!off.boats.aboard&&['swim','air','ground'].includes(off.mode),'Stepped off ('+off.mode+')');
  check(Math.hypot(off.boatPosition[0]-left[0],off.boatPosition[2]-left[2])<1,'The boat stays where it was left');
  check(errors.length===0,'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
