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
 args:process.env.SURF_NATIVE_GPU==='1'?['--no-sandbox']:
  ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let count=0,capturePage=null;
function check(ok,message){assert.ok(ok,'Surf browser: '+message);console.log('OK: '+message);count++;}
try{
 const context=await browser.newContext({viewport:{width:1024,height:640}});
 const page=await context.newPage(),errors=[];
 capturePage=page;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl|program/i.test(m.text()))errors.push(m.text().slice(0,400));});
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
 await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>15,{},{timeout:120000});
 let initial=await page.evaluate(()=>window.littleWorldMetrics);
 check(initial.simulationHz===30,'fixed-step 30 Hz is preserved');
 check(initial.surf!==null,'a compatible ocean surf zone was located/compiled');
 check(initial.surf?.zoneId?.startsWith('surf:'),'a real surf-zone id is active');
 check(initial.surf?.wave?.height!==undefined,'game physics samples the swell');
 check(initial.surf?.patchTriangles>0,'GPU swell patch exists');
 check(initial.surf?.waterLodVertices>0,'a bounded water mesh is exposed');
 check(initial.surf?.zones>=1,'at least one authored or generated surf zone is present');
 check(initial.surf?.boardVisible,'surfboard visual follows the hamster');
 check(initial.surf?.barrel?.enabled===true,'a deterministic curling tube is enabled on the surf beach');
 check(initial.surf?.barrel?.stats?.triangles<=6000,'barrel mesh respects a strict low-poly budget (full crest, ≤ 4 crests)');
 const first=initial.surf.wave.height,observed=[first];
 for(let i=0;i<4;i++){
  await page.waitForTimeout(400);
  const current=await page.evaluate(()=>window.littleWorldMetrics);
  if(current.surf?.wave)observed.push(current.surf.wave.height);
 }
 check(Math.max(...observed)-Math.min(...observed)>.025,'swell advances at the fixed simulation tick');
 check(initial.surf.features>=0,'surf feature registry is available');
 // The board is a real hands-slot item, not a permanent debug selection.
 await page.keyboard.press('KeyI');
 const board=page.locator('.ui-bag-v3 [data-item="tool:surfboard"]').first();
 await board.waitFor({state:'visible',timeout:8000});
 await board.click();
 if(!(await page.evaluate(()=>window.littleWorldMetrics?.surf?.equipped)))
   await page.getByRole('button',{name:'Équiper',exact:true}).first().click();
 await page.keyboard.press('Escape');
 await page.locator('section.ui-panel[data-panel="inventory"]').waitFor({state:'hidden',timeout:5000});
 await page.waitForFunction(()=>window.littleWorldMetrics?.surf?.equipped===true,{},{timeout:5000});
 check((await page.evaluate(()=>window.littleWorldMetrics?.surf?.equipped))===true,
  'the player equipped an actual surfboard from their bag');
 // The player may have lost the initial demonstration wave while their bag
 // was open. Establish SURF explicitly before testing the B -> swim -> B cycle.
 if((await page.evaluate(()=>window.littleWorldMetrics?.mode))!=='surf'){
  // Current UX: without a floating board, the first B deploys the equipped board next to the
  // hamster and the second B boards it (same flow as test-surf-island-browser.mjs).
  await page.keyboard.press('KeyB');
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf'||window.littleWorldMetrics?.surfBoardPlaced!==null,{},{timeout:10000});
  if((await page.evaluate(()=>window.littleWorldMetrics?.mode))!=='surf')await page.keyboard.press('KeyB');
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf',{},{timeout:10000});
 }
 check((await page.evaluate(()=>window.littleWorldMetrics?.mode))==='surf',
  'actual surfing is active before stowing the board');
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>['swim','dive'].includes(window.littleWorldMetrics?.mode),{},{timeout:7000});
 let after=await page.evaluate(()=>window.littleWorldMetrics);
 check(after.mode==='swim'||after.mode==='dive','B stows the board and returns to swimming');
 await page.keyboard.press('KeyB');
 try{
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf',{},{timeout:7500});
 }catch(error){
  const state=await page.evaluate(()=>({
   mode:window.littleWorldMetrics?.mode,position:window.littleWorldMetrics?.position,
   velocity:window.littleWorldMetrics?.velocity,
   surf:window.littleWorldMetrics?.surf,
   water:window.littleWorldMetrics?.swim,
   equipment:window.littleWorldMetrics?.surf?.equipped,
  }));
  console.error('SURF_REBOARD_DIAGNOSTIC '+JSON.stringify(state));
  throw error;
 }
 await page.keyboard.down('KeyW');await page.waitForTimeout(900);await page.keyboard.up('KeyW');
 after=await page.evaluate(()=>window.littleWorldMetrics);
 check(['surf','air','swim'].includes(after.mode),'paddling does not crash or teleport player');
 check(after.position.every(Number.isFinite),'player position remains finite');
 check(errors.length===0,'no uncaught page errors: '+errors.join('; '));
 await page.screenshot({path:output+'/surf-demo.png'});
 const gpuName=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');if(!canvas)return 'none';
  const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  const debug=gl?.getExtension('WEBGL_debug_renderer_info');
  return String(debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER)||'unknown');
 });
 console.log('Surf WebGL renderer: '+gpuName);
 if(/swiftshader|llvmpipe|software|softpipe/i.test(gpuName))
  console.log('Surf software GPU only: performance not qualified for old 4–8 GB integrated-GPU PCs.');
 console.log(JSON.stringify({checks:count,url,surf:after.surf,position:after.position,errors}));
}catch(error){
 if(capturePage&&!capturePage.isClosed())await capturePage.screenshot({path:output+'/surf-failed.png'}).catch(()=>{});
 throw error;
}finally{await browser.close();}
