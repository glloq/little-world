/** Lot 1 checks for the 3 × 8 km island, runnable against the production preview:
 * published compiled world, far geography without holes, rotation, and the Studio
 * create → compiled test copy → return path. No source module is imported by pages.
 */
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];let checks=0;const check=(ok,label)=>{if(!ok)throw Error('FAILED: '+label);checks++;console.log('OK: '+label);};
/** Pixels clearly below the eye-level horizon must show land or sea on an island surrounded by ocean. */
async function belowHorizonBackground(page){
  const shot=await page.screenshot();
  return page.evaluate(async b64=>{
    const m=window.littleWorldMetrics,bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,'+b64)).blob());
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const {data,width,height}=ctx.getImageData(0,0,bitmap.width,bitmap.height);
    const [qx,qy,qz,qw]=m.camera.quaternion,fy=-(2*(qy*qz-qw*qx)),tanY=Math.tan(m.camera.fov*Math.PI/360),pitch=Math.asin(Math.max(-1,Math.min(1,fy)));
    const eye=Math.round(height/2+Math.tan(pitch)/tanY*height/2),bg=[(m.background>>16)&255,(m.background>>8)&255,m.background&255];
    let holes=0,total=0;for(let y=Math.max(0,eye+4);y<height;y+=2)for(let x=0;x<width;x+=2){const i=(y*width+x)*4;total++;if(Math.abs(data[i]-bg[0])<=3&&Math.abs(data[i+1]-bg[1])<=3&&Math.abs(data[i+2]-bg[2])<=3)holes++;}
    return {holes,total,eye};
  },shot.toString('base64'));
}
try{
  const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
  await page.goto(base+'?world=maps/island/manifest.json&metrics=1&spawn=0,1500&yaw=3.14159',{waitUntil:'networkidle'});
  await page.waitForSelector('#start:not([disabled])',{timeout:30000});await page.locator('#start').click();
  await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:30000});
  let m=await page.evaluate(()=>window.littleWorldMetrics);
  check(m.legacyTerrain===false&&m.horizon.blocks===24&&m.horizon.oceanVisible,'Published island opens through the compiled reader with its horizon and ocean');
  check(m.camera.far>Math.hypot(3000,8000),'Far plane covers the island diagonal (no fog)');
  check(m.chunks.active<120&&m.chunks.visible<=m.chunks.active,'Only a bounded set of detailed tiles is displayed ('+m.chunks.active+')');
  const drag=async(dx,dy,steps=6)=>{await page.mouse.move(480,320);await page.mouse.down();for(let i=1;i<=steps;i++){await page.mouse.move(480+dx*i/steps,320+dy*i/steps);await page.waitForTimeout(25);}await page.mouse.up();};
  await drag(0,600);await page.waitForTimeout(600);
  const before=await belowHorizonBackground(page);
  check(before.holes===0,`No background below the eye-level horizon (${before.holes}/${before.total})`);
  await page.screenshot({path:out+'/island-volcano.png'});
  // Fast U-turn: geography stays continuous immediately, detail completes afterwards.
  const replans=m.chunks.replans;await drag(997,0,2);await page.waitForTimeout(150);
  const during=await belowHorizonBackground(page);
  check(during.holes===0,`No hole right after a fast U-turn (${during.holes}/${during.total})`);
  await page.waitForFunction(()=>window.littleWorldMetrics?.chunks.pending===0,{},{timeout:30000});
  m=await page.evaluate(()=>window.littleWorldMetrics);
  check(m.chunks.replans>replans,'Rotation re-plans detail around the new view');
  await context.close();

  const studio=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  studio.on('pageerror',e=>errors.push(e.message));studio.on('dialog',d=>d.accept());
  await studio.goto(base+'studio/');await studio.getByLabel('Nom du projet').fill('Île navigateur');
  await studio.getByLabel('Modèle et dimensions').selectOption('island');await studio.getByRole('button',{name:'Créer le projet',exact:true}).click();
  await studio.locator('#workspace canvas').waitFor();check(await studio.locator('#breadcrumbs').textContent()==='Île navigateur / map','Studio creates a 3 × 8 km island project');
  await studio.screenshot({path:out+'/island-studio-map.png'});
  const popup=studio.context().waitForEvent('page');await studio.getByRole('button',{name:'Tester la copie'}).click();const game=await popup;
  game.on('pageerror',e=>errors.push(e.message));await game.waitForLoadState();
  check(new URL(game.url()).searchParams.has('studioBuild'),'Test copy opens a compiled build, not a V2 snapshot');
  await game.waitForSelector('#start:not([disabled])',{timeout:30000});await game.locator('#start').click();
  await game.waitForFunction(()=>document.querySelector('#coords')?.textContent?.includes('Z'),{},{timeout:30000});
  const z=Number(/Z (-?\d+)/.exec(await game.locator('#coords').textContent())?.[1]);
  check(z>3000,'Island test copy starts on the southern beach (Z '+z+')');
  await game.screenshot({path:out+'/island-playtest.png'});await game.close();
  check(await studio.locator('#breadcrumbs').textContent()==='Île navigateur / map','Returning keeps the Studio context');
  check(errors.length===0,errors.join('\n'));
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
