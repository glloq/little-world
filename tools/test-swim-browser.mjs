/** Swimming and diving on the published island (Chromium/SwiftShader, functional):
 * the hamster swims IN the water (feet ~0.5 m under the surface, head out), Space dives, moving
 * forward with the camera tilted down (click-drag) goes deeper, Space again comes back up.
 * Screenshots in /tmp/little-world-browser/swim-*.png. Usage: WORLD_URL=<base> node tools/test-swim-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const {parseProject}=await import('../src/studio-core/schema.ts');
const {projectGeography}=await import('../src/studio-core/geo-context.ts');
const project=parseProject(JSON.parse(await readFile(new URL('../maps/island.project.json',import.meta.url),'utf8')));
const {ctx}=projectGeography(project),sea=project.world.seaLevel;
// A beach with deep sea (≥ 5 m) 25 m to the north: walk in, then dive.
let spot=null;for(let x=-1500;x<=900&&!spot;x+=25)for(let z=900;z<1450;z+=1)if(Math.abs(x+200)>60){const h=ctx.height(x,z);if(h>sea+.3&&h<sea+3&&ctx.height(x+16,z+20)<sea-4&&ctx.height(x+8,z+10)<sea-1){spot={x,z};break;}}
assert.ok(spot,'a beach with deep water');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await (await browser.newContext({viewport:{width:960,height:600}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const m=()=>page.evaluate(()=>window.littleWorldMetrics);
  // Heading north-east: the player's boat moors straight north of the spawn (and boats are solid).
  await page.goto(`${base}?metrics=1&spawn=${spot.x},${spot.z}&yaw=0.7`,{waitUntil:'domcontentloaded'});
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});await page.locator('#start-overlay').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:120000});await page.waitForTimeout(600);
  // 1. Walk into the sea: swimming IN the water.
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='swim',{},{timeout:15000}).catch(()=>{});
  // Swim out to deep water (the beach shelves gently; diving needs depth).
  await page.waitForTimeout(6000);await page.keyboard.up('KeyW');await page.waitForTimeout(1200);
  const swim=await m(),depth=swim.swim.water-swim.position[1];
  check(swim.mode==='swim'&&depth>.35&&depth<.65,`Swimming in the water: feet ${depth.toFixed(2)} m under the surface (head out)`);
  await page.screenshot({path:out+'/swim-surface.png'});
  // 2. Space: dive.
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='dive',{},{timeout:5000}).catch(()=>{});await page.waitForTimeout(600);
  const dive=await m();check(dive.mode==='dive'&&dive.swim.diving&&dive.swim.water-dive.position[1]>1.2,'Space: the hamster dives ('+(dive.swim.water-dive.position[1]).toFixed(2)+' m deep)');
  // 3. Tilt the camera down (click-drag up) and swim forward: deeper.
  const c={x:480,y:300};await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x,c.y-260,{steps:8});await page.mouse.up();
  const tilted=await m();check(tilted.swim.pitch>.6,'Camera tilted down (pitch '+tilted.swim.pitch.toFixed(2)+')');
  await page.keyboard.down('KeyW');await page.waitForTimeout(1800);await page.keyboard.up('KeyW');await page.waitForTimeout(300);
  const deep=await m();check(deep.position[1]<dive.position[1]-1,`Forward with the camera down dives deeper (${(deep.position[1]-dive.position[1]).toFixed(2)} m)`);
  await page.screenshot({path:out+'/swim-deep.png'});
  // 4. Space again: back to the surface.
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='swim',{},{timeout:8000}).catch(()=>{});await page.waitForTimeout(500);
  const up=await m();check(up.mode==='swim'&&!up.swim.diving,'Space again: back at the surface');
  check(errors.length===0,'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
