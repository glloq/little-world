/** Capture REAL Little World + Three.js mine hub (no image generation).
 * Reproducible browser viewpoint in the B1 authored mine, before art approval.
 * Output: PNG and JSON counters in /tmp/little-world-mine-preview. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {playerUi} from './ui-test-helpers.mjs';
import {mineHubLayout} from '../src/mine/mine-hub.ts';
const output=process.env.MINE_CAPTURE_DIR??'/tmp/little-world-mine-preview';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const project=JSON.parse(await readFile(
  new URL('../tests/fixtures/legacy-maps/authoring/b1-demo.project.json',import.meta.url),'utf8'));
const zone=project.libraries.zones['zone-mine'],hub=mineHubLayout(zone,0);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??
  (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir(output,{recursive:true});
try{
  const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});
  await context.addInitScript(()=>localStorage.setItem('little-world-quality','high'));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?world=maps/b1-demo/manifest.json&metrics&yaw=0&pitch=0.14&dist=2.1&spawn=-40,296');
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
  await page.waitForFunction(()=>window.littleWorldMetrics?.activities,{},{timeout:30000});
  const ui=playerUi(page),SLOT='little-world:game-save:v1:little-world-b1-demo:slot-1';
  async function moveTo(x,z){
    await ui.save();
    await page.evaluate(([key,x,y,z,space])=>{
      const raw=JSON.parse(localStorage.getItem(key));
      if(!raw)throw Error('B1 save slot unavailable');
      raw.position={x,y,z};raw.space=space;localStorage.setItem(key,JSON.stringify(raw));
    },[SLOT,x,hub.floorY,z,{zoneId:zone.id,levelId:hub.levelId}]);
    await ui.load();
    await page.waitForFunction(id=>window.littleWorldMetrics?.activities?.space?.levelId===id,hub.levelId);
    await page.waitForTimeout(2200);
  }
  // Looking forward through the hall: stand left, gallery ahead, lift right.
  await moveTo(hub.shaft.x-1.35,hub.shaft.z-.7);
  await page.screenshot({path:output+'/01-entree-mine-hall-jeu-reel.png'});
  // Closer to the extraction gallery to inspect the 3D ore signs and timber arch.
  await moveTo(hub.gallery.x,hub.shaft.z+1.55);
  await page.screenshot({path:output+'/02-entree-niveau1-jeu-reel.png'});
  const metrics=await page.evaluate(()=>{
    const v=window.littleWorldMetrics;
    return {position:v.position,activities:v.activities,calls:v.calls,triangles:v.triangles};
  });
  await writeFile(output+'/capture-report.json',JSON.stringify({
    type:'actual-gameplay-render',renderer:'Chromium + SwiftShader',
    branch:process.env.GITHUB_REF_NAME??'feat/mine-hub-levels-v1',
    commit:process.env.GITHUB_SHA??null,hub,metrics,errors,
    viewpoints:[{filename:'01-entree-mine-hall-jeu-reel.png',description:'Vue rapprochée depuis le hall, face à la galerie'},
      {filename:'02-entree-niveau1-jeu-reel.png',description:'Entrée de galerie et ressources au niveau 1'}]
  },null,2));
  assert.equal(errors.length,0,errors.join('; '));
  console.log('Captured actual 3D game mine hub',hub.levelId,'at',output);
  await context.close();
}finally{await browser.close();}
