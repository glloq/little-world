/** E2E of the THIRD published island, not a synthetic ?surfDemo fallback.
 * Verifies real authored A/B/C waves, physical N1 quay source and saves screenshots.
 * Uses CI SwiftShader for functional validation only. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const url=new URL('?world=archipelago/worlds/surf-island/manifest.json&metrics=1',base).toString();
const output='/tmp/little-world-browser';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page=null;const report={url,checks:[],beaches:[],errors:[]};
function check(ok,label){assert.ok(ok,label);report.checks.push(label);console.log('SURF ISLAND OK: '+label);}
try{
 const context=await browser.newContext({viewport:{width:1280,height:720}});
 page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 const layoutURL=new URL('archipelago/worlds/surf-island/surf-layout.json',base).toString();
 const response=await page.request.get(layoutURL);
 check(response.ok(),'Published surf layout exists');
 const layout=await response.json();
 check(layout.beaches.length===3,'A/B/C authored beaches are published');
 check(layout.port?.shore&&layout.port?.boat&&layout.port?.trade,'Real N1 port is published');
 const manifestResponse=await page.request.get(new URL('archipelago/worlds/surf-island/manifest.json',base).toString());
 check(manifestResponse.ok(),'Surf compiled manifest exists');
 const manifest=await manifestResponse.json();
 check(manifest.worldId==='little-world-surf-island','Dedicated world ID is correct');
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
 await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>15,{},{timeout:120000});
 let m=await page.evaluate(()=>window.littleWorldMetrics);
 check(m.simulationHz===30,'Physics stays at fixed 30 Hz');
 check(m.surfWorld?.count===3,'Runtime loads three independent wave zones');
 const actualZoneIds=m.surfWorld.zones.map(z=>z.id);
 for(const b of layout.beaches)check(actualZoneIds.includes(b.zone),'Zone '+b.name+' compiled and loaded');
 // The bag is the actual inventory V3, not a test-only action that skips equipment.
 await page.keyboard.press('KeyI');
 const board=page.locator('.ui-bag-v3 [data-item="tool:surfboard"]').first();
 await board.waitFor({state:'visible',timeout:10000});
 await board.click();
 await page.getByRole('button',{name:'Équiper',exact:true}).first().click();
 await page.keyboard.press('Escape');
 await page.locator('section.ui-panel[data-panel="inventory"]').waitFor({state:'hidden',timeout:5000});
 await page.waitForTimeout(400);
 for(const b of layout.beaches){
  const zone=layout.beaches.find(x=>x.name===b.name),bounds=m.surfWorld.zones.find(x=>x.id===b.zone);
  const yaw=0;
  // The developer hook uses the same terrain and player simulation. It is not
  // exposed to normal gameplay without ?metrics=1.
  await page.evaluate(p=>window.littleWorldDebug.teleport(p.x,p.z,0),b.spawn);
  await page.waitForFunction(expected=>window.littleWorldMetrics?.surf?.zoneId===expected,b.zone,{timeout:15000});
  await page.waitForTimeout(650);
  const current=await page.evaluate(()=>window.littleWorldMetrics);
  check(current.surf?.wave?.height!==undefined,'Live wave sampling in beach '+b.name);
  check(current.surf?.waterLodVertices>0,'GPU tessellation loaded on beach '+b.name);
  check(current.surf?.zoneId===b.zone,'Correct wave zone selected at beach '+b.name);
  check(current.position.every(Number.isFinite),'Finite character position on beach '+b.name);
  check(current.surfWorld.count===3,'No zone was lost while travelling');
  await page.screenshot({path:output+'/surf-island-'+b.name+'.png'});
  report.beaches.push({name:b.name,zone:current.surf.zoneId,position:current.position,
   waterTriangles:current.surf.patchTriangles,barrel:current.surf.barrel?.enabled??false});
 }
 const b=layout.beaches.find(x=>x.name==='B');
 await page.evaluate(p=>window.littleWorldDebug.teleport(p.x,p.z,0),b.spawn);
 await page.waitForFunction(id=>window.littleWorldMetrics?.surf?.zoneId===id,b.zone,{timeout:10000});
 // The first B deploys the equipped board; the second boards it from the water.
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>window.littleWorldMetrics?.surfBoardPlaced!==null,{},{timeout:10000});
 const board=await page.evaluate(()=>window.littleWorldMetrics.surfBoardPlaced);
 check(Number.isFinite(board.x)&&Number.isFinite(board.z),'Board placed on valid wave-zone water');
 await page.evaluate(p=>window.littleWorldDebug.teleport(p.x,p.z,0),board);
 await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='swim',{},{timeout:10000});
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf',{},{timeout:10000});
 const surf=await page.evaluate(()=>window.littleWorldMetrics);
 check(surf.surf.equipped===true,'Surfboard was equipped through inventory');
 check(surf.surf.barrel?.enabled===true,'Beach B has playable curling surf');
 check(report.errors.length===0,'No uncaught browser errors');
 await page.screenshot({path:output+'/surf-island-B-riding.png'});
 report.done=true;console.log('SURF_ISLAND_BROWSER '+JSON.stringify({...report,beaches:report.beaches}));
}catch(error){
 if(page&&!page.isClosed())await page.screenshot({path:output+'/surf-island-failed.png'}).catch(()=>{});
 console.error('SURF_ISLAND_FAIL '+String(error));
 throw error;
}finally{
 writeFileSync(output+'/surf-island-browser-report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
