/** E2E of the THIRD published island, not a synthetic ?surfDemo fallback.
 * Verifies real authored A/B/C waves, physical N1 quay source and saves screenshots.
 * Uses CI SwiftShader for functional validation only. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {projectGeography} from '../src/studio-core/geo-context.ts';
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
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl|program/i.test(m.text()))report.errors.push(m.text().slice(0,400));});
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
 const source=await page.request.get(new URL('archipelago/worlds/surf-island/project.json',base).href);
 check(source.ok(),'Surf authoring source is published');
 const project=await source.json(),ground=projectGeography(project).ctx.height;
 const offer=project.libraries.questCatalog['quest:trois-vagues-chronos'];
 const guide=project.chunks[project.entityIndex[offer.giverId].ownerChunkId].entities[offer.giverId];
 await page.evaluate(({x,z})=>window.littleWorldDebug.teleport(x+1,z,0),guide.components.Transform.position);
 await page.waitForFunction(id=>window.littleWorldMetrics?.targetId===id,offer.giverId,{timeout:15000});
 await page.keyboard.press('KeyE');
 const dialogue=page.getByRole('dialog',{name:'Conversation'});
 await dialogue.getByRole('button',{name:'Mission : Les trois chronos de Céladon',exact:true}).click();
 await dialogue.getByText('Mission acceptée : Les trois chronos de Céladon.',{exact:true}).waitFor();
 await dialogue.getByRole('button',{name:'Fermer · Échap',exact:true}).click();
 await page.keyboard.press('KeyJ');
 await page.getByRole('button',{name:'Afficher la mission Les trois chronos de Céladon',exact:true}).click();
 const firstCourse=project.libraries.races[offer.steps[0].raceId];
 await page.getByRole('button',{name:'⌖ Voir sur la carte · Course : '+firstCourse.name,exact:true}).waitFor();
 check(true,'Céladon offers the three time trials and the journal points to course A');
 await page.keyboard.press('Escape');
 // Start swimming just above sea level. A ground teleport can put the hamster
 // tens of metres underwater, which introduces a long surfacing delay on SwiftShader.
 const enterWater=async({x,z})=>{
  const before=await page.evaluate(({x,z,altitude})=>{
   const frame=window.littleWorldMetrics.frameId;
   window.littleWorldDebug.teleport(x,z,0,altitude);
   return frame;
  },{x,z,altitude:Math.max(0,project.world.seaLevel+.1-ground(x,z))});
  await page.waitForFunction(frame=>window.littleWorldMetrics?.frameId>frame&&window.littleWorldMetrics.mode==='swim',
   before,{timeout:15000});
 };
 const b=layout.beaches.find(x=>x.name==='B');
 await enterWater(b.spawn);
 await page.waitForFunction(id=>window.littleWorldMetrics?.surf?.zoneId===id,b.zone,{timeout:10000});
 // The first B deploys the equipped board; the second boards it from the water.
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>window.littleWorldMetrics?.surfBoardPlaced!==null,{},{timeout:10000});
 const placedBoard=await page.evaluate(()=>window.littleWorldMetrics.surfBoardPlaced);
 check(Number.isFinite(placedBoard.x)&&Number.isFinite(placedBoard.z),'Board placed on valid wave-zone water');
 await enterWater(placedBoard);
 await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='swim',{},{timeout:15000});
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf',{},{timeout:10000});
 const surf=await page.evaluate(()=>window.littleWorldMetrics);
 check(surf.surf.equipped===true,'Surfboard was equipped through inventory');
 check(surf.surf.barrel?.enabled===true,'Beach B has playable curling surf');
 // Board recall: stow it, swim 40 m away, B brings the board next to the hamster, B boards it.
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='swim'&&window.littleWorldMetrics?.surfBoardPlaced!==null,{},{timeout:10000});
 const left=await page.evaluate(()=>window.littleWorldMetrics.surfBoardPlaced);
 const away={x:left.x,z:left.z-40}; // seaward, still inside zone B
 await enterWater(away);
 await page.waitForFunction(()=>['swim','dive'].includes(window.littleWorldMetrics?.mode),{},{timeout:10000});
 await page.keyboard.press('KeyB');
 await page.waitForTimeout(300);
 const recalled=await page.evaluate(()=>({board:window.littleWorldMetrics.surfBoardPlaced,pos:window.littleWorldMetrics.position}));
 check(recalled.board&&Math.hypot(recalled.board.x-recalled.pos[0],recalled.board.z-recalled.pos[2])<=2.5&&
  Math.hypot(recalled.board.x-left.x,recalled.board.z-left.z)>30,'B recalls a far board next to the hamster (old spot cleared)');
 await page.keyboard.press('KeyB');
 await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='surf',{},{timeout:10000});
 check(true,'The recalled board is boarded with the next B');
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
