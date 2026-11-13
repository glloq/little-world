import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const verify=(yes,message)=>{assert.ok(yes,message);checks++;};
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'?beta=1&metrics');await page.getByRole('button',{name:'Explorer la vallée'}).click();await page.waitForFunction(()=>window.littleWorldMetrics?.environment);
 await page.getByText('Heure et météo',{exact:true}).click();await page.getByLabel('Vitesse du monde').selectOption('0');await page.waitForFunction(()=>window.littleWorldMetrics?.environment.rate===0);const paused=await page.evaluate(()=>window.littleWorldMetrics.environment.time);await page.waitForTimeout(400);verify(await page.evaluate(()=>window.littleWorldMetrics.environment.time)===paused,'Pause uses the common logical clock');
 await page.getByLabel('Vitesse du monde').selectOption('240');await page.waitForFunction(t=>window.littleWorldMetrics.environment.time>t+10,paused);verify(true,'Time acceleration uses logical simulation');
 await page.getByRole('button',{name:'Sac · Sauvegardes'}).click();await page.locator('.game-slot-row').first().getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.getByText('Partie sauvegardée.',{exact:true}).waitFor();const raw=await page.evaluate(()=>JSON.parse(localStorage.getItem('little-world:game-save:v1:little-world-beta:slot-1')));raw.time=600;
 await page.getByLabel('Importer une sauvegarde').setInputFiles({name:'evening.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.getByText('Slot importé. Chargez-le pour reprendre.',{exact:true}).waitFor();await page.locator('.game-slot-row').first().getByRole('button',{name:'Charger',exact:true}).click();await page.getByText('Partie restaurée.',{exact:true}).waitFor();await page.getByRole('button',{name:'Reprendre l’exploration'}).click();await page.waitForFunction(()=>{const e=window.littleWorldMetrics?.environment;return e&&e.time>=600&&e.time<610&&e.rate===1;});verify(true,'Restoring a slot restores shared time and resets debug speed');
 const e=await page.evaluate(()=>window.littleWorldMetrics.environment);verify(['clear','cloudy','rain'].includes(e.weather)&&e.rainParticles<=192,'Weather and cosmetic rain budget are observable');
 await page.getByLabel('Vitesse du monde').selectOption('0');await mkdir('/tmp/little-world-browser',{recursive:true});await page.screenshot({path:'/tmp/little-world-browser/beta-night.png'});verify(errors.length===0,errors.join('\n'));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
