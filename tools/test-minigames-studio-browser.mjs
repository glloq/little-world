/** Doc 107 Studio check (real Chromium): project with mini-games → Studio « Mini-jeux » panel
 * (list, rule edit through the shared history, Undo, preview) → save → « Jouer ici » → the
 * compiled game loads the mini-game host. Usage: WORLD_URL=… node tools/test-minigames-studio-browser.mjs */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject} from '../src/studio-core/schema.ts';
import {createMiniGame,putMiniGame} from '../src/studio-core/minigame-authoring.ts';
import {writeProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const project=createProject({name:'Minigames QA world',width:600,length:600,projectId:'minigames-qa-studio',worldId:'minigames-qa'});
  putMiniGame(project,createMiniGame(project,'football',{x:0,z:-40},'Stade témoin'));
  putMiniGame(project,createMiniGame(project,'minigolf',{x:40,z:-40},'Golf témoin'));
  const zip=Buffer.from(writeProjectArchive(project));
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('studio/',base).href);
  await page.locator('#project-file').setInputFiles({name:'minigames.zip',mimeType:'application/zip',buffer:zip});
  await page.locator('.viewport canvas').waitFor({timeout:45000});
  await page.getByRole('button',{name:'Mini-jeux',exact:true}).click();
  await page.getByRole('heading',{name:'Mini-jeux de l’île'}).waitFor();
  const tools=()=>page.locator('#tools').textContent();
  check(/Stade témoin · Football/.test(await tools())&&/Golf témoin · Mini-golf/.test(await tools()),'panel lists both instances');
  await page.getByText('Stade témoin · Football').click();
  const score=page.getByLabel('Score à atteindre').first();
  await score.fill('5');await score.press('Tab');
  await page.waitForFunction(()=>document.querySelector('#tools input[aria-label="Score à atteindre"]')?.value==='5');
  check(true,'rule edited through a Studio transaction');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(()=>document.querySelector('#tools input[aria-label="Score à atteindre"]')?.value==='3',{},{timeout:10000}).catch(()=>{});
  const after=await page.evaluate(()=>document.querySelector('#tools input[aria-label="Score à atteindre"]')?.value);
  check(after==='3','Undo restores the rule (shared history)');
  await page.getByText('Stade témoin · Football').click();await page.getByRole('button',{name:'Voir'}).first().click();await page.waitForTimeout(2500);
  if(process.argv[2])await page.screenshot({path:process.argv[2]+'/studio-minigames.png'});
  await page.getByRole('button',{name:'Créer au centre de la vue'}).click();
  await page.waitForFunction(()=>/Football 1|Football \d/.test(document.querySelector('#tools')?.textContent??''),{},{timeout:10000});
  check(/3 mini-jeu/.test(await tools()),'new football instance created at the view centre (several instances of a variant)');
  await page.waitForFunction(()=>!!document.querySelector('.viewport canvas'));
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='Sauvegardé localement',{},{timeout:15000});
  const popup=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Jouer ici'}).click();
  const game=await popup;game.on('pageerror',e=>errors.push('game: '+e.message));
  await game.locator('#start-overlay').waitFor({state:'hidden',timeout:90000});
  await game.waitForFunction(()=>!!document.querySelector('.minigame-hud'),{},{timeout:30000});
  check(true,'« Jouer ici » build loads the mini-game host from the Studio project');
  check(errors.length===0,'no page error: '+errors.join(' | '));
  console.log(`MINIGAMES STUDIO CHECK OK (${checks} checks)`);
}finally{await browser.close();}
