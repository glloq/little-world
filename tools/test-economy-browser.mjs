/** Game economy in a real browser on the published island (Chromium/SwiftShader, functional):
 * forest counter → buy an axe with the starting purse → fell a tree in front (several F strikes)
 * → logs in the bag → sell them back → coins updated; quest NPCs and counters exist in the world.
 * Positions come from the island source and the same deterministic dressing generator as the game.
 * Usage: WORLD_URL=<base> node tools/test-economy-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const {parseProject}=await import('../src/studio-core/schema.ts');
const {projectGeography}=await import('../src/studio-core/geo-context.ts');
const {generateDressingCell,ITEM_STRIDE,DRESSING_CELL_M}=await import('../src/geography/dressing.ts');
const {SPECIES}=await import('../src/world-production/biotopes.ts');
const project=parseProject(JSON.parse(await readFile(new URL('../maps/island.project.json',import.meta.url),'utf8')));
const entities=Object.values(project.chunks).flatMap(c=>Object.values(c.entities));
const counter=entities.find(e=>e.components.State?.initial?.shop==='forest');assert.ok(counter,'forest counter in the island');
const cp=counter.components.Transform.position;
const characters=entities.filter(e=>e.kind==='character'),quests=Object.keys(project.libraries.objectives).length;
// Nearest broadleaf tree to the counter (same generator as the game).
const {ctx}=projectGeography(project),W=3000,L=8000,inside=(x,z)=>Math.abs(x)<=W/2&&Math.abs(z)<=L/2;let tree=null,best=Infinity;
for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const c=generateDressingCell(ctx,project.world.seed,Math.floor(cp.x/DRESSING_CELL_M)+dx,Math.floor(cp.z/DRESSING_CELL_M)+dz,inside),a=c.items.oak;
  for(let i=0;i<a.length;i+=ITEM_STRIDE)if(SPECIES[a[i+6]]?.id==='nature.broadleaf_round'){const d=Math.hypot(a[i]-cp.x,a[i+2]-cp.z);if(d<best){best=d;tree={x:a[i],z:a[i+2]};}}}
assert.ok(tree,'a tree near the camp');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
check(characters.length>=20&&quests>=8,`Island inhabited: ${characters.length} NPCs, ${quests} quests`);
try{
  const page=await browser.newPage({viewport:{width:1100,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const m=()=>page.evaluate(()=>window.littleWorldMetrics);
  const open=async(x,z,yaw)=>{await page.goto(`${base}?world=maps/island/manifest.json&metrics=1&spawn=${x.toFixed(1)},${z.toFixed(1)}&yaw=${yaw.toFixed(3)}`,{waitUntil:'networkidle'});await page.locator('#start').click();await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:60000});await page.waitForTimeout(800);};
  // 1. Counter: stand 1.8 m in front of it, facing it.
  const fx=cp.x,fz=cp.z-1.8;await open(fx,fz,Math.atan2(cp.x-fx,cp.z-fz));
  check((await m()).inventory.coin===40,'New game starts with 40 coins');
  await page.waitForFunction(()=>/Commercer/.test(window.littleWorldMetrics?.target??''),{},{timeout:15000});check(true,'Counter is the target: « Commercer »');
  await page.keyboard.press('KeyE');await page.waitForSelector('.ui-shop-row[data-item="tool:axe"]',{timeout:10000});check(true,'Shop panel lists the axe');
  await page.locator('.ui-shop-row[data-item="tool:axe"] button',{hasText:'Acheter'}).click();
  await page.waitForFunction(()=>window.littleWorldMetrics?.inventory?.['tool:axe']===1,{},{timeout:5000});check((await m()).inventory.coin===15,'Axe bought: 40 − 25 = 15 coins');
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  // Selling: logs (given by the developer hook of metrics mode) are bought back by the counter.
  await page.evaluate(()=>window.littleWorldDebug.grant('wood:log',4));await page.keyboard.press('KeyE');await page.waitForSelector('.ui-shop-row[data-item="wood:log"]');
  await page.locator('.ui-shop-row[data-item="wood:log"] button',{hasText:'Tout vendre'}).click();
  await page.waitForFunction(()=>!window.littleWorldMetrics?.inventory?.['wood:log'],{},{timeout:5000});check((await m()).inventory.coin===15+12,'4 logs sold at 3 coins each');
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  // 2. Fell a tree: stand 1.4 m from it, facing it.
  const ang=Math.atan2(cp.x-tree.x,cp.z-tree.z),sx=tree.x+Math.sin(ang)*1.4,sz=tree.z+Math.cos(ang)*1.4;
  await open(sx,sz,Math.atan2(tree.x-sx,tree.z-sz));
  const before=await m();check(/Abattre/.test(before.target??''),'Tree in front: « Abattre »');const treeKey=before.targetId;
  await page.keyboard.press('KeyF');await page.waitForTimeout(400);check(!((await m()).inventory['wood:log']>0),'Without an axe, nothing is cut');
  await page.evaluate(()=>window.littleWorldDebug.grant('tool:axe',1));
  await page.keyboard.down('KeyF');await page.waitForFunction(()=>window.littleWorldMetrics?.inventory?.['wood:log']>0,{},{timeout:30000}).finally(()=>page.keyboard.up('KeyF'));
  check((await m()).inventory['wood:log']>=2,'Tree felled with several strikes: logs in the bag ('+(await m()).inventory['wood:log']+')');
  await page.waitForTimeout(600);check((await m()).targetId!==treeKey,'Felled tree is no longer a target ('+treeKey+')');
  // 3. Hidden chest in a wood: E opens it once (coins granted, state persisted in the save).
  const chest=entities.find(e=>e.id==='ls-woodland-1.treasure'),chp=chest.components.Transform.position;
  await open(chp.x,chp.z-1.6,0);const coins0=(await m()).inventory.coin;
  await page.waitForFunction(()=>/coffre/i.test(window.littleWorldMetrics?.target??''),{},{timeout:15000});check(true,'Hidden chest is the target: « Ouvrir le coffre »');
  await page.keyboard.press('KeyE');await page.waitForFunction(c=>window.littleWorldMetrics?.inventory?.coin>c,coins0,{timeout:10000});
  const gained=(await m()).inventory.coin-coins0;check(gained>=15,`Chest opened: +${gained} coins`);
  await page.waitForTimeout(500);await page.keyboard.press('KeyE');await page.waitForTimeout(800);check((await m()).inventory.coin===coins0+gained,'An opened chest gives nothing more');
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
