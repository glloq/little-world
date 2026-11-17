/** Real keyboard + drag steering through the published V3 reader; no actor teleport hook. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out=process.env.ARTIFACTS_DIR??'/tmp/little-world-motion';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const record={checks:[],errors:[],samples:{}};
try{
 const studio=await browser.newPage({viewport:{width:1280,height:800}});await studio.goto(new URL('studio/?testFixtures=1',base).href);await studio.getByRole('button',{name:'Scène de référence Déplacements',exact:true}).click();await studio.waitForFunction(()=>{const c=document.querySelector('.viewport canvas');return c&&c.dataset.pending==='0'&&Number(c.dataset.models)===4;},{},{timeout:60000});record.checks.push('Scène V3 ouverte depuis le Studio avec ses quatre structures');await studio.close();
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>record.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)record.errors.push(r.status()+' '+r.url());});
 const url=new URL(base);url.search='?world=maps/motion-reference/manifest.json&spawn=90,-84&yaw=0&pitch=.32&metrics=1';
 await page.goto(url.href);await page.locator('#start').click();
 const ticks=async n=>{const t=await page.evaluate(()=>window.littleWorldMetrics.movement.tick);await page.waitForFunction(t=>window.littleWorldMetrics.movement.tick>=t,t+n,{timeout:30000});};
 const sample=()=>page.evaluate(()=>{const m=window.littleWorldMetrics;return {mode:m.mode,position:m.position,velocity:m.velocity,flight:m.flight,tick:m.movement.tick,fov:m.camera.fov,calls:m.calls,triangles:m.triangles};});
 await ticks(2);await page.screenshot({path:out+'/scene.png'});await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await ticks(60);
 let s=await sample();assert.equal(s.mode,'roll');assert.ok(Math.hypot(s.velocity[0],s.velocity[2])>4);record.samples.roll=s;record.checks.push('Roulade intégrée avec Shift');
 await page.keyboard.press('Space');await ticks(3);await page.keyboard.press('Space');await ticks(5);
 await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');s=await sample();assert.equal(s.mode,'glide');record.samples.deploy=s;record.checks.push('Saut puis ouverture avec élan');
 await ticks(50);assert.equal((await sample()).mode,'glide','clear the cliff rim before diving');
 const canvas=page.locator('#viewport canvas');await canvas.scrollIntoViewIfNeeded();
 await page.mouse.move(640,500);await page.mouse.down();await page.mouse.move(640,245,{steps:12});await page.mouse.up();await ticks(40);
 s=await sample();assert.equal(s.mode,'glide');assert.ok(s.velocity[1]<-4,'camera-down drag causes a dive');assert.ok(Math.hypot(...s.velocity)>Math.hypot(...record.samples.deploy.velocity));record.samples.dive=s;record.checks.push('Piqué à la souris : descente et accélération');
 await page.screenshot({path:out+'/dive.png'});
 await page.mouse.move(640,150);await page.mouse.down();await page.mouse.move(640,780,{steps:12});await page.mouse.up();await ticks(40);
 s=await sample();assert.equal(s.mode,'glide');assert.ok(s.velocity[1]>0,'camera-up drag causes a temporary climb');record.samples.pullUp=s;record.checks.push('Cabré à la souris : remontée temporaire');
 await page.screenshot({path:out+'/pull-up.png'});
 await page.mouse.move(640,400);await page.mouse.down();await page.mouse.move(790,400);await page.mouse.up();await ticks(15);s=await sample();assert.ok(s.flight.heading<-.15&&s.velocity[0]<0,'horizontal camera drag steers flight');record.samples.turn=s;record.checks.push('Virage progressif piloté par la caméra');
 const heading=s.flight.heading;await page.keyboard.down('KeyD');await ticks(8);await page.keyboard.up('KeyD');s=await sample();assert.ok(s.flight.heading<heading-.1,'D steers toward screen-right, consistently with mouse drag');record.samples.keyboardTurn=s;record.checks.push('Commande D cohérente avec la droite écran en planage');
 // The menu preference changes only presentation; the physics keeps running after resume.
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Paramètres',exact:true}).click();
 const effects=page.getByLabel('Effets visuels de vitesse (champ de vision)');await effects.uncheck();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('little-world:ui-preferences:v1')).speedEffects),false);
 const paused=(await sample()).tick;await page.waitForFunction(()=>Math.abs(window.littleWorldMetrics.camera.fov-66)<.05,{},{timeout:15000});assert.equal((await sample()).tick,paused);
 record.checks.push('Effets désactivés : FOV revenu à 66°, préférence conservée et simulation en pause');
 assert.deepEqual(record.errors,[]);console.log(JSON.stringify(record,null,2));
}finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify(record,null,2)+'\n');}
