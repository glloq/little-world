/** Browser acceptance for the opt-in surf prototype.
 * Uses the published island without altering the Studio project or registry.
 * Usage: WORLD_URL=http://127.0.0.1:5173/little-world/ npm run test:surf
 * Set SURF_URL to a compiled island with known deep-water surf zone when necessary.
 * SwiftShader is a functional fallback, NOT a benchmark of an actual integrated GPU.
 */
import {chromium} from 'playwright';
import {existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const url=process.env.SURF_URL??new URL('?metrics=1&surfDemo=1',base).toString();
const output='/tmp/little-world-browser';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let count=0;
function check(ok,message){assert.ok(ok,'Surf browser: '+message);console.log('OK: '+message);count++;}
try{
 const context=await browser.newContext({viewport:{width:1024,height:640}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
 await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>15,{},{timeout:120000});
 let initial=await page.evaluate(()=>window.littleWorldMetrics);
 check(initial.simulationHz===30,'fixed-step 30 Hz is preserved');
 check(initial.surf!==null,'a compatible ocean surf zone was located/compiled');
 check(initial.surf?.zoneId?.startsWith('surf:'),'a real surf-zone id is active');
 check(initial.surf?.wave?.height!==undefined,'game physics samples the swell');
 check(initial.surf?.patchTriangles>0,'GPU swell patch exists');
 check(initial.surf?.boardVisible,'surfboard visual follows the hamster');
 const first=initial.surf.wave.height,observed=[first];
 for(let i=0;i<4;i++){
  await page.waitForTimeout(400);
  const current=await page.evaluate(()=>window.littleWorldMetrics);
  if(current.surf?.wave)observed.push(current.surf.wave.height);
 }
 check(Math.max(...observed)-Math.min(...observed)>.025,'swell advances at the fixed simulation tick');
 check(initial.surf.features>=0,'surf feature registry is available');
 await page.keyboard.press('KeyB');
 await page.waitForTimeout(450);
 let after=await page.evaluate(()=>window.littleWorldMetrics);
 check(after.mode==='swim'||after.mode==='dive','B stows the board and returns to swimming');
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf',{},{timeout:6000});
 await page.keyboard.down('KeyW');await page.waitForTimeout(900);await page.keyboard.up('KeyW');
 after=await page.evaluate(()=>window.littleWorldMetrics);
 check(['surf','air','swim'].includes(after.mode),'paddling does not crash or teleport player');
 check(after.position.every(Number.isFinite),'player position remains finite');
 check(errors.length===0,'no uncaught page errors: '+errors.join('; '));
 await page.screenshot({path:output+'/surf-demo.png'});
 console.log(JSON.stringify({checks:count,url,surf:after.surf,position:after.position,errors}));
}finally{await browser.close();}
