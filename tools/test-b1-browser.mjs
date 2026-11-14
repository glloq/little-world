/** B1 acceptance walk on the compiled demonstration world (Chromium/SwiftShader: functional
 * check only, not a GPU benchmark). Steps 1–11 of the campaign:
 * obstacles → water in and out → mine entrance → down two levels → dig iron and stone →
 * climb back to the surface → sow and water a plot → accelerate world time → harvest →
 * save, reload the page, load → mine dug, resources exhausted, plots and inventory restored.
 * Moving between sites uses the save file itself (position/space edited, then loaded), as the
 * gameplay test does; everything else is driven by the real keys. Usage: npm run test:b1 */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {readFile,mkdir} from 'node:fs/promises';
import {playerUi} from './ui-test-helpers.mjs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const project=JSON.parse(await readFile(new URL('../maps/b1-demo.project.json',import.meta.url),'utf8')),mine=project.libraries.zones['zone-mine'].mine;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
const SLOT='little-world:game-save:v1:little-world-b1-demo:slot-1';
try{
  const page=await browser.newPage({viewport:{width:1100,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const url=base+'?world=maps/b1-demo/manifest.json&metrics&yaw=0&spawn=-40,296';
  const boot=async()=>{await page.goto(url);await page.locator('#start:not([disabled])').click({timeout:120000});await page.waitForFunction(()=>window.littleWorldMetrics?.activities,{},{timeout:120000});await page.waitForTimeout(800);};
  const m=()=>page.evaluate(()=>{const v=window.littleWorldMetrics;return {pos:v.position,mode:document.querySelector('#status')?.textContent,act:v.activities};});
  const msg=()=>page.locator('.ui-notifications').textContent();
  const ui=playerUi(page),save=()=>ui.save(),load=()=>ui.load(),inventory=()=>ui.bag();
  /** Teleport through the save file (position + active space), then load it. */
  async function moveTo(x,y,z,space=null){await save();await page.evaluate(([k,x,y,z,space])=>{const raw=JSON.parse(localStorage.getItem(k));raw.position={x,y,z};raw.space=space;localStorage.setItem(k,JSON.stringify(raw));},[SLOT,x,y,z,space]);await load();await page.waitForTimeout(600);}
  async function hold(key,until,seconds=20){await page.keyboard.down(key);let v;for(let i=0;i<seconds*5;i++){await page.waitForTimeout(200);v=await m();if(until(v))break;}await page.keyboard.up(key);return v;}
  await boot();
  // 1. Obstacles: the crate row stops the squirrel, which stays on the ground.
  const blocked=await hold('KeyW',v=>v.pos[2]>299.5,4);check(blocked.pos[2]<299.1&&blocked.pos[2]>297,'A solid crate stops the walk at z = '+blocked.pos[2].toFixed(2));
  // 2. Water: into the lake (swimming), then back out on foot.
  await moveTo(20,40,4);const swim=await hold('KeyS',v=>/Nage|Plongée/.test(v.mode),20);check(/Nage/.test(swim.mode),'Enters the lake and swims ('+swim.mode+')');
  const dry=await hold('KeyW',v=>/Au sol/.test(v.mode),25);check(/Au sol/.test(dry.mode),'Walks back out of the water');
  // 3–4. Mine: entrance, then down two levels by the stairs.
  await moveTo(172.5,45,22);const inside=await hold('KeyW',v=>v.act.space?.levelId==='level-3',40);
  check(inside.act.space?.levelId==='level-3'&&Math.abs(inside.pos[1]-mine.levels[2].floorY)<.05,'Entered the mine and went down to level 3 (y '+inside.pos[1].toFixed(1)+')');
  const card=page.locator('.ui-activity-card');await page.waitForFunction(()=>/\(3\/3\)/.test(document.querySelector('.ui-activity-card[data-kind=mine]')?.textContent??''),null,{timeout:5000}).catch(()=>{});const mineCard=await card.textContent();
  check(/\(3\/3\)/.test(mineCard)&&/\d+ m/.test(mineCard),'Mine card: level 3/3 and way out with distance ('+mineCard+')');
  await page.screenshot({path:out+'/b1-level3.png'});
  // 5. Dig: iron at the end of the gallery, then rock (stone), walking into each new cell.
  await hold('KeyW',v=>v.pos[2]>71.5,6);const digs=[];
  for(let i=0;i<3;i++){await page.keyboard.press('KeyF');await page.waitForTimeout(500);digs.push(await msg());await hold('KeyW',()=>false,.6);}
  const bag=await inventory();check(/Minerai de fer/.test(bag)&&/Pierre/.test(bag),'Two mined resources in the bag: '+digs.join(' | '));
  const dug=(await m()).act.excavated;check(dug>=3,'Excavated cells: '+dug);
  // 6. Climb back: stairs up twice, then out through the entrance.
  const surface=await hold('KeyS',v=>v.act.space===null,60);check(surface.act.space===null&&Math.abs(surface.pos[2]-28.5)<2,'Back on the surface outside the entrance ('+surface.pos.map(n=>n.toFixed(1))+')');
  // 7–9. Farm: choose carrots, sow, water, accelerate the world clock, harvest.
  await moveTo(-164,40,118);await page.keyboard.press('KeyC');await page.waitForTimeout(300);check(/Carotte/.test(await msg()),'Crop chosen with C');
  await page.waitForFunction(()=>document.querySelector('.ui-activity-card')?.dataset.kind==='farm');check(await page.waitForFunction(()=>[...document.querySelectorAll('.ui-activity-card .ui-chip')].find(b=>b.textContent==='Carotte')?.getAttribute('aria-pressed')==='true',{},{timeout:5000}).then(()=>true,()=>false),'Plot card shows the chosen crop as pressed');
  const other=card.locator('.ui-chip[aria-pressed=false]').first(),otherName=await other.textContent();await other.click();await page.waitForFunction(n=>[...document.querySelectorAll('.ui-activity-card .ui-chip')].find(b=>b.textContent===n)?.getAttribute('aria-pressed')==='true',otherName);
  await card.getByRole('button',{name:'Carotte'}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.ui-activity-card .ui-chip')].find(b=>b.textContent==='Carotte')?.getAttribute('aria-pressed')==='true');check(true,'Crop chips select through the farm runtime ('+otherName+' then Carotte)');
  await page.keyboard.press('KeyF');await page.waitForTimeout(300);check(/Semis/.test(await msg()),'Sown');
  await page.keyboard.press('KeyF');await page.waitForTimeout(300);check(/arrosée/.test(await msg()),'Watered from the irrigation point');
  await page.locator('.environment-controls summary').click();await page.getByLabel('Vitesse du monde').selectOption('240');
  let plot;for(let i=0;i<60;i++){await page.waitForTimeout(1500);plot=(await m()).act.plots['plot-west'];if(plot.stage==='mature')break;if(plot.moisture<.45){await page.keyboard.press('KeyF');}}
  await page.getByLabel('Vitesse du monde').selectOption('1');check(plot.stage==='mature','Carrots grew to maturity with the world clock ('+JSON.stringify(plot)+')');
  await page.keyboard.press('KeyF');await page.waitForTimeout(400);check(/\+\d+ Carotte/.test(await msg()),'Harvested (inventory gain notification): '+(await msg()));
  const before=await m();const beforeBag=await inventory();check(/Carotte/.test(beforeBag),'Carrots in the bag');
  // 10–11. Save, reload the page, load: everything restored.
  await save();const raw=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SLOT);check(raw.schemaVersion===2&&Object.keys(raw.mines).length===1&&raw.farms['plot-west'],'Versioned save with mine differences and plot states');
  await boot();await load();await page.waitForFunction(n=>window.littleWorldMetrics?.activities?.excavated===n,before.act.excavated,{timeout:5000}).catch(()=>{});const after=await m();
  check(after.act.excavated===before.act.excavated,'Dug cells restored after reload ('+after.act.excavated+')');
  check(after.act.plots['plot-west'].stage==='empty'&&after.act.plots['plot-east'].crop==='carrot','Plots restored (harvested west, east still growing)');
  const restoredBag=await inventory();check(/Minerai de fer/.test(restoredBag)&&/Carotte/.test(restoredBag),'Inventory restored');
  // An exhausted ore never comes back: going back to the dug iron cell, it is open (no wall to dig).
  await moveTo(172.5,mine.levels[2].floorY+.2,70.5,{zoneId:'zone-mine',levelId:'level-3'});const again=await hold('KeyW',v=>v.pos[2]>73.2,4);check(again.pos[2]>72.4,'The exhausted iron cell stays open after reload (z '+again.pos[2].toFixed(2)+')');
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
