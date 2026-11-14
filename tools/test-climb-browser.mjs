/** Cliff climbing in a real browser on the published island (Chromium/SwiftShader, functional):
 * the player stands at the foot of a cliff found in the island source (same relief as the game),
 * holds « forward » → mode « climb », height gained, stamina used, ridge reached on the ground.
 * Usage: WORLD_URL=<base> node tools/test-climb-browser.mjs */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const {parseProject}=await import('../src/studio-core/schema.ts');
const {projectGeography}=await import('../src/studio-core/geo-context.ts');
const project=parseProject(JSON.parse(await readFile(new URL('../maps/island.project.json',import.meta.url),'utf8')));
const {ctx}=projectGeography(project),h=(x,z)=>ctx.height(x,z),grad=(x,z,e=.5)=>{const gx=(h(x+e,z)-h(x-e,z))/(2*e),gz=(h(x,z+e)-h(x,z-e))/(2*e);return {s:Math.hypot(gx,gz),gx,gz};};
// A cliff 6–20 m high above walkable ground (east cliff of the island), steeper than the 50° walk limit.
let site=null;
for(let x=830;x<=1530&&!site;x+=4)for(let z=550;z<=1250&&!site;z+=4){
  const g=grad(x,z);if(g.s<1.5)continue;const ux=g.gx/g.s,uz=g.gz/g.s,fx=x-ux*3,fz=z-uz*3;
  if(grad(fx,fz).s>.6||h(fx,fz)<ctx.seaLevel+1)continue;
  let top=null;for(let d=0;d<40;d++){const sx=x+ux*d,sz=z+uz*d;if(grad(sx,sz).s<.8){top=h(sx,sz);break;}}
  if(top!==null&&top-h(fx,fz)>6&&top-h(fx,fz)<20)site={fx,fz,yaw:Math.atan2(ux,uz),foot:h(fx,fz),top};
}
assert.ok(site,'a climbable cliff on the island');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage({viewport:{width:1000,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const m=()=>page.evaluate(()=>window.littleWorldMetrics);
  await page.goto(`${base}?world=maps/island/manifest.json&metrics=1&spawn=${site.fx.toFixed(2)},${site.fz.toFixed(2)}&yaw=${site.yaw.toFixed(3)}`,{waitUntil:'networkidle'});
  await page.locator('#start').click();await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:60000});await page.waitForTimeout(800);
  const start=await m();check(start.mode==='ground'&&start.stamina===100,`At the foot of a ${(site.top-site.foot).toFixed(1)} m cliff, full stamina`);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='climb',{},{timeout:15000});check(true,'Pushing into the cliff starts climbing');
  await page.waitForTimeout(1500);const mid=await m();
  check(mid.position[1]>start.position[1]+1.5&&mid.stamina<100,`Height gained while climbing (+${(mid.position[1]-start.position[1]).toFixed(1)} m, stamina ${mid.stamina.toFixed(0)})`);
  check(await page.locator('.ui-stamina:not(.hide)').count()===1,'Stamina meter shown while climbing');
  await page.screenshot({path:'/tmp/little-world-browser/climb.png'}).catch(()=>{});
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='ground',{},{timeout:60000});await page.keyboard.up('KeyW');
  const end=await m();check(end.position[1]>site.top-2.5,`Ridge reached on foot (${end.position[1].toFixed(1)} m ≥ top ${site.top.toFixed(1)} m)`);
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
