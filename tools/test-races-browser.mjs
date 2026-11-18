/** Studio V3 -> compiled preview -> game Courses panel; real Chromium UI, no networking. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject} from '../src/studio-core/schema.ts';
import {authoredRaceFromTrace,putAuthoredRace} from '../src/studio-core/race-authoring.ts';
import {writeProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const project=createProject({name:'Race QA world',width:600,length:600,projectId:'race-qa-studio',worldId:'race-qa'});
 const race=authoredRaceFromTrace(project.world,{
   id:'race:studio-smoke',name:'Circuit Studio témoin',kind:'roll',
   points:[{x:0,z:-60},{x:0,z:-20},{x:10,z:35}],height:()=>5
 });
 putAuthoredRace(project,race);
 const zip=Buffer.from(writeProjectArchive(project));
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('studio/',base).href);
 await page.locator('#project-file').setInputFiles({name:'races.zip',mimeType:'application/zip',buffer:zip});
 await page.locator('.viewport canvas').waitFor({timeout:45000});
 await page.getByRole('button',{name:'Courses',exact:true}).click();
 await page.getByRole('heading',{name:'Circuits fixes du monde'}).waitFor();
 assert.match(await page.locator('#tools').textContent(),/Circuit Studio témoin/);
 // An editable gate height is owned by the shared Studio history, not the runtime.
 await page.getByText('Réglage des 3 checkpoints').click();
 const width=page.getByLabel('Largeur (m)').first();
 await width.fill('11');
 await width.press('Tab');
 await page.waitForFunction(()=>document.querySelector('#tools input[aria-label="Largeur (m)"]')?.value==='11');
 await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='Sauvegardé localement',{},{timeout:15000});
 const popPromise=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Jouer ici'}).click();
 const game=await popPromise;
 await game.locator('#start-overlay').waitFor({state:'hidden',timeout:60000});
 await game.getByRole('navigation',{name:'Accès rapide'}).getByRole('button',{name:/Courses/}).click();
 await game.getByRole('heading',{name:'Circuits fixes de l’île'}).waitFor();
 assert.match(await game.locator('.ui-panel[data-panel="races"]').textContent(),/Circuit Studio témoin/);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('RACE STUDIO / BUILD / PLAY CHECK OK');
}finally{await browser.close();}
