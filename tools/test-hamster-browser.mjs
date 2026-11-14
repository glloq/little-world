/** Hamster player character in a real browser on the published island (Chromium/SwiftShader,
 * functional, doc 43): the hamster is the player; X rolls into a ball (faster than running) and
 * back; Space twice glides; the axe is shown and swung when felling (logs gained); the fishing rod,
 * line and float are shown when casting. Screenshots in /tmp/little-world-browser/hamster-*.png.
 * Usage: WORLD_URL=<base> node tools/test-hamster-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const {parseProject}=await import('../src/studio-core/schema.ts');
const {projectGeography}=await import('../src/studio-core/geo-context.ts');
const {generateDressingCell,ITEM_STRIDE,DRESSING_CELL_M}=await import('../src/geography/dressing.ts');
const {SPECIES}=await import('../src/world-production/biotopes.ts');
const project=parseProject(JSON.parse(await readFile(new URL('../maps/island.project.json',import.meta.url),'utf8')));
const {ctx}=projectGeography(project),b=project.world.bounds,inside=(x,z)=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
// A broadleaf tree on open ground near the town, and a flat open meadow for rolling.
let tree=null;for(let cz=Math.floor(300/DRESSING_CELL_M);cz<=Math.floor(700/DRESSING_CELL_M)&&!tree;cz++)for(let cx=Math.floor(-600/DRESSING_CELL_M);cx<=Math.floor(-200/DRESSING_CELL_M)&&!tree;cx++){const c=generateDressingCell(ctx,project.world.seed,cx,cz,inside),a=c.items.oak;
  for(let i=0;i<a.length;i+=ITEM_STRIDE)if(SPECIES[a[i+6]]?.id==='nature.broadleaf_round'){tree={x:a[i],z:a[i+2]};break;}}
assert.ok(tree,'a tree for the axe');
// A shore spot: dry ground with sea 3.5 m further north (fishing in front).
let shore=null;for(let x=-1500;x<=900&&!shore;x+=20)for(let z=900;z<1450;z+=1)if(Math.abs(x+200)>60){const h=ctx.height(x,z),w=ctx.height(x,z+3.5);if(h>project.world.seaLevel+.4&&h<project.world.seaLevel+6&&w<project.world.seaLevel-.6){shore={x,z};break;}}
assert.ok(shore,'a shore spot for fishing');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage({viewport:{width:1000,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const m=()=>page.evaluate(()=>window.littleWorldMetrics);
  const open=async(query)=>{await page.goto(`${base}?metrics=1${query}`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Explorer l’île'}).click({timeout:60000});await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:60000});await page.waitForTimeout(600);};
  // 1. The hamster is the player.
  await open('');const start=await m();check(start.character&&start.character.state==='IDLE','The hamster is the player character (state IDLE)');
  // 2. Roll (inland from the start beach): X, hold forward → ball faster than running; X → back on foot.
  await open('&spawn=60,1180&yaw=3.1416');const road=await m();
  await page.keyboard.press('KeyX');await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='roll',{},{timeout:5000});check(true,'X rolls the hamster into a ball');
  await page.keyboard.down('KeyW');await page.waitForTimeout(2600);const rolling=await m();await page.screenshot({path:out+'/hamster-roll.png'});await page.keyboard.up('KeyW');
  const v=Math.hypot(rolling.position[0]-road.position[0],rolling.position[2]-road.position[2]);
  check(rolling.character.state==='ROLL_LOOP'&&v>8,`Rolling animation and distance (${v.toFixed(1)} m in 2.6 s)`);
  await page.keyboard.press('KeyX');await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='ground',{},{timeout:5000});await page.waitForTimeout(500);
  check((await m()).character.state!=='ROLL_LOOP','X again: back on its paws');
  // 3. Glide: jump then Space again in the air.
  await page.keyboard.press('Space');await page.waitForTimeout(220);await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='glide',{},{timeout:3000}).catch(()=>{});const g=await m();
  check(g.mode==='glide'&&/GLIDE/.test(g.character.state),'Space twice: membranes open and glide ('+g.character.state+')');await page.screenshot({path:out+'/hamster-glide.png'});
  // 4. Felling: the axe is shown and swung, logs gained.
  const ang=Math.atan2(-1,0),sx=tree.x+Math.sin(ang)*1.3,sz=tree.z+Math.cos(ang)*1.3;
  await open(`&world=maps/island/manifest.json&spawn=${sx.toFixed(2)},${sz.toFixed(2)}&yaw=${Math.atan2(tree.x-sx,tree.z-sz).toFixed(3)}`);
  await page.evaluate(()=>window.littleWorldDebug.grant('tool:axe',1));
  await page.keyboard.press('KeyF');await page.waitForFunction(()=>window.littleWorldMetrics?.character.action==='TOOL_SWING_HORIZONTAL',{},{timeout:5000}).catch(()=>{});const swing=await m();await page.screenshot({path:out+'/hamster-axe.png'});
  check(swing.character.action==='TOOL_SWING_HORIZONTAL'&&swing.character.tool==='axe','F on a tree: horizontal swing with the axe in the paw ('+swing.character.action+', '+swing.character.tool+', '+JSON.stringify(swing.info??null)+')');
  await page.keyboard.down('KeyF');await page.waitForFunction(()=>window.littleWorldMetrics?.inventory?.['wood:log']>0,{},{timeout:30000}).finally(()=>page.keyboard.up('KeyF'));
  check((await m()).inventory['wood:log']>0,'Logs gained through the existing gathering logic');
  await page.waitForTimeout(800);check((await m()).character.tool===null,'Axe put away after the action');
  // 5. Fishing at the start beach: rod, cast, line and float.
  // Spawn away from the shore (the player's boat moors seaward of the spawn), then go to the shore spot.
  await open(`&spawn=${shore.x+40},${shore.z-60}&yaw=0`);await page.evaluate(({x,z})=>{window.littleWorldDebug.grant('tool:fishing-rod',1);window.littleWorldDebug.teleport(x,z,0);},shore);
  await page.waitForFunction(()=>/Pêcher|Lancer/.test(window.littleWorldMetrics?.target??''),{},{timeout:15000});
  await page.waitForTimeout(400);await page.keyboard.press('KeyE');await page.waitForTimeout(200);const cast=await m();
  check(cast.character.action==='FISH_CAST'&&cast.character.tool==='fishing-rod','E at the water: cast with the rod in the paws');
  await page.waitForTimeout(1200);const wait=await m();await page.screenshot({path:out+'/hamster-fishing.png'});
  check(wait.character.fishingLine&&wait.character.tool==='fishing-rod','Line and float out while waiting ('+wait.character.action+')');
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
