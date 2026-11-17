/** Island-wide user profile, preference precedence and resource lifecycle. No new authored data. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.argv[2]??'http://127.0.0.1:5173/little-world/',out=process.argv[3]??'/tmp/hybrid-map';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[],snapshots=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 let ownership=null;
 if(process.env.HYBRID_STATIC!=='1'){
 await page.goto(base+'tools/impostors/bake.html');await page.route('**/impostors/trees.*.png',async route=>{await new Promise(r=>setTimeout(r,150));await route.continue();});
 ownership=await page.evaluate(async base=>{
  const THREE=await import(base+'node_modules/.vite/deps/three.js'),{createImpostorSectors}=await import(base+'src/render/impostor-sectors.ts');const root=new THREE.Group(),first=createImpostorSectors(root,'trees');
  first.setEnabled(true);first.setEnabled(false);first.setEnabled(true);
  const wait=async f=>{for(let i=0;i<500&&!f();i++)await new Promise(r=>setTimeout(r,10));if(!f())throw Error('late atlas timeout');};await wait(()=>first.ready);
  const second=createImpostorSectors(root,'trees');second.setEnabled(true);await wait(()=>second.ready);first.setEnabled(false);const sharedAlive=second.ready&&second.cache.bytes>0;second.setEnabled(false);const released=second.cache.bytes===0;first.dispose();second.dispose();return {sharedAlive,released};
 },base);assert.deepEqual(ownership,{sharedAlive:true,released:true});await page.unroute('**/impostors/trees.*.png');
 }
 const url=new URL('?metrics=1&spawn=-700,1020&dist=50',base).href;
 const start=async u=>{await page.goto(u);await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>3,null,{timeout:120000});};
 const state=()=>page.evaluate(()=>window.littleWorldMetrics.hybrid.trees.state),record=async label=>{snapshots.push({label,...await page.evaluate(()=>({hybrid:window.littleWorldMetrics.hybrid,calls:window.littleWorldMetrics.calls,triangles:window.littleWorldMetrics.triangles,dressing:window.littleWorldMetrics.dressing.cells,position:window.littleWorldMetrics.position}))});};
 async function select(value){await page.getByRole('button',{name:'Menu (Échap)',exact:true}).click();await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByLabel('Végétation lointaine',{exact:true}).selectOption(value);await page.locator('.ui-panel[data-panel="settings"]').getByRole('button',{name:'Fermer · Échap'}).click();}
 await start(url);assert.equal(await state(),'off');await select('hybrid');await page.waitForFunction(()=>window.littleWorldMetrics.hybrid.trees.state==='ready'&&window.littleWorldMetrics.hybrid.trees.instances>0,null,{timeout:90000});await record('enabled-through-settings');assert.equal(snapshots.at(-1).hybrid.trees.sectorM,512);
 await start(url);await page.waitForFunction(()=>window.littleWorldMetrics.hybrid.trees.state==='ready',null,{timeout:90000});await record('persisted-after-reload');
 // A diagnostic override must not overwrite the browser preference.
 await start(url+'&impostors=off');assert.equal(await state(),'off');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('little-world:ui-preferences:v1')).distantRendering),'hybrid');assert.equal(await page.evaluate(()=>window.littleWorldMetrics.hybrid.cache.bytes),0);await record('explicit-geometry-override');
 await start(url);await page.waitForFunction(()=>window.littleWorldMetrics.hybrid.trees.state==='ready',null,{timeout:90000});await select('geometry');await page.waitForFunction(()=>window.littleWorldMetrics.hybrid.trees.state==='off'&&window.littleWorldMetrics.hybrid.cache.bytes===0,null,{timeout:30000});await record('disabled-and-released');
 await select('hybrid');await page.waitForFunction(()=>window.littleWorldMetrics.hybrid.trees.state==='ready',null,{timeout:90000});
 // Traverse the published island: forests, village, coast, mountain and return. Every
 // waypoint stays local: no load of the whole map, no atlas/page per geographic region.
 for(const [x,z]of [[-700,1020],[-420,350],[0,0],[650,-450],[850,650],[-700,1020]]){
  await page.evaluate(([x,z])=>window.littleWorldDebug.teleport(x,z,0),[x,z]);await page.waitForTimeout(1200);await record('island:'+x+','+z);
  const m=snapshots.at(-1);assert.ok(m.hybrid.cache.bytes<=12*1024*1024);assert.ok(m.hybrid.trees.cachedSectors<=32);assert.ok(m.hybrid.trees.instances<=4096);
 }
 await page.screenshot({path:out+'/island-hybrid.png'});assert.deepEqual(errors,[]);await writeFile(out+'/profile.json',JSON.stringify({ownership,checks:'settings, persistence, query precedence, release/reload, island waypoints',snapshots,errors},null,2)+'\n');console.log('PASS: island profile, persistence, overrides, release and bounded streaming');
}finally{await browser.close();}
