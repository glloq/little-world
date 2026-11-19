/** Real-browser smoke acceptance of the phase-1/2 instrument UI and Web Audio.
 * WORLD_URL=http://127.0.0.1:5173/little-world/ node tools/test-instruments-browser.mjs
 */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1360,height:860}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'?beta=1&metrics');
 await page.locator('#start-overlay').waitFor({state:'hidden'});
 await page.locator('#viewport canvas').click();
 await page.waitForFunction(()=>window.littleWorldMetrics?.audio?.state==='running');
 // The beta regression world intentionally has no coin economy / STARTING_KIT.
 // Seed the real gameplay inventory through the existing metrics-only developer
 // command, rather than assuming every published world grants free instruments.
 const granted=await page.evaluate(()=>{
   const grant=window.littleWorldDebug?.grant;
   if(typeof grant!=='function')return false;
   return grant('instrument:flute',1)===true&&grant('instrument:ocarina',1)===true;
 });
 assert.ok(granted,'both instruments granted through the real inventory runtime');
 await page.keyboard.press('KeyI');
 const bag=page.locator('.ui-panel[data-panel="inventory"]');
 await bag.getByRole('button',{name:/Flûte douce, quantité/}).click();
 // Direct Play also equips the selected instrument.
 await bag.getByRole('button',{name:'Jouer'}).click();
 const panel=page.locator('.ui-panel[data-panel="instrument"]');
 await panel.waitFor({state:'visible'});
 const hud=page.getByRole('button',{name:'Jouer de la musique (P)'});
 assert.equal(await hud.isVisible(),true,'equipped instrument shows a music HUD shortcut');
 assert.ok((await page.locator('.ui-tool').textContent())?.includes('Flûte douce'));
 assert.equal(await panel.locator('.lw-note-grid').count(),15);
 assert.equal(await panel.locator('select').count(),0,'no instrument picker in music panel');
 await page.keyboard.down('Digit1');await page.keyboard.down('Digit2');
 await page.waitForFunction(()=>window.littleWorldMetrics?.audio?.musicVoices>=2);
 await page.keyboard.up('Digit1');await page.keyboard.up('Digit2');
 await page.waitForFunction(()=>window.littleWorldMetrics?.audio?.musicVoices===0,{},{timeout:2500});
 await panel.getByRole('button',{name:'Piano'}).click();
 assert.equal(await panel.locator('.lw-note-white').count(),15);
 assert.equal(await panel.locator('.lw-note-black').count(),10);
 await panel.getByRole('button',{name:'+1 octave'}).click();
 assert.ok(await panel.locator('[data-midi="72"]').count()>0,'octave increases by 12 semitones');
 await page.keyboard.press('KeyP');
 await panel.waitFor({state:'hidden'});
 await page.waitForFunction(()=>window.littleWorldMetrics?.audio?.musicVoices===0);
 await page.keyboard.press('KeyP');
 await panel.waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await panel.waitFor({state:'hidden'});
 await hud.click();
 await panel.waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await page.keyboard.press('KeyI');
 await bag.waitFor({state:'visible'});
 await bag.getByRole('button',{name:/Ocarina, quantité/}).click();
 await bag.getByRole('button',{name:'Jouer'}).click();
 await panel.waitFor({state:'visible'});
 assert.ok((await panel.locator('.lw-instrument-head').textContent())?.includes('Ocarina'));
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>window.littleWorldMetrics?.audio?.musicVoices===0);
 assert.deepEqual(errors,[]);
 console.log('OK: one-click bag Play/equip, HUD, P toggle, 15-note grid, live notes, piano, octave, cleanup');
}finally{await browser.close();}
