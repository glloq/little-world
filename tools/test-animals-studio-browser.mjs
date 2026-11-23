/** Doc 110 Studio check (real Chromium): « Animaux » module → create a mount and a team at the
 * view centre → runtime preview and animation → inspector edit + Undo through the shared history
 * → save → « Jouer ici » → the compiled game loads the animal host with the same ids.
 * Usage: WORLD_URL=… node --experimental-strip-types tools/test-animals-studio-browser.mjs [screenshot dir] */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject} from '../src/studio-core/schema.ts';
import {createCharacter} from '../src/studio-core/character-authoring.ts';
import {writeProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const project=createProject({name:'Animals QA world',width:600,length:600,projectId:'animals-qa-studio',worldId:'animals-qa'});
  createCharacter(project,{id:'npc-carter',name:'Charretier',x:6,z:6,species:'hamster'});
  const zip=Buffer.from(writeProjectArchive(project));
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('studio/',base).href);
  await page.locator('#project-file').setInputFiles({name:'animals.zip',mimeType:'application/zip',buffer:zip});
  await page.locator('.viewport canvas').waitFor({timeout:45000});
  await page.getByRole('button',{name:'Animaux',exact:true}).click();
  await page.getByRole('heading',{name:'Animaux',exact:true}).waitFor();
  const tools=()=>page.locator('#tools').textContent();
  check(/Dans ce projet \(0\)/.test(await tools()),'a project without animals lists none');
  const create=async preset=>{await page.getByLabel('Modèle',{exact:true}).selectOption(preset);await page.getByRole('button',{name:'Créer au centre de la vue'}).click();};
  await create('mount');
  await page.waitForFunction(()=>/Dans ce projet \(1\)/.test(document.querySelector('#tools')?.textContent??''),{},{timeout:10000});
  check(/monture · saddle/.test(await tools()),'a saddled mount is created at the view centre');
  await page.waitForFunction(()=>/Animal \/ harde/.test(document.querySelector('#inspector')?.textContent??''),{},{timeout:10000});
  check(/Propriété et accès/.test(await page.locator('#inspector').textContent()),'the new animal is selected and its contextual inspector opens');
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.animalPreview==='1',{},{timeout:20000});
  check(true,'the Studio previews it with the runtime model');
  const name=page.locator('#inspector input[aria-label="Nom"]').first();
  await name.fill('Caramel');await name.press('Tab');
  await page.waitForFunction(()=>/Caramel · monture/.test(document.querySelector('#tools')?.textContent??''),{},{timeout:10000});
  await page.keyboard.press('Control+z');
  await page.waitForFunction(()=>!/Caramel · monture/.test(document.querySelector('#tools')?.textContent??''),{},{timeout:10000});
  check(true,'inspector edit is one undoable transaction');
  await page.keyboard.press('Control+y');
  await page.waitForFunction(()=>/Caramel · monture/.test(document.querySelector('#tools')?.textContent??''),{},{timeout:10000});
  // Equipment change through the inspector: the mount becomes a caravan team (role follows).
  await page.locator('#inspector select[aria-label="Équipement"]').selectOption('caravan');
  await page.waitForFunction(()=>/Caramel · transport · caravan/.test(document.querySelector('#tools')?.textContent??''),{},{timeout:10000});
  check(/rayon de braquage/.test(await page.locator('#inspector').textContent()),'equipment is interchangeable; the inspector shows the team footprint');
  await page.locator('#inspector select[aria-label="Propriétaire"]').selectOption('npc-carter');
  await page.locator('#inspector select[aria-label="Cavalier / conducteur (PNJ)"]').selectOption('npc-carter');
  await page.waitForFunction(()=>/Pause à chaque extrémité/.test(document.querySelector('#inspector')?.textContent??''),{},{timeout:10000});
  check(/Trajet praticable|⛔|⚠/.test(await page.locator('#inspector').textContent()),'assigning an NPC driver creates a route that is validated');
  await page.getByLabel('Animation',{exact:true}).selectOption('walk');await page.getByRole('button',{name:'Lire l’aperçu'}).click();
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.animalPreviewMode==='walk',{},{timeout:10000});
  check(true,'animation preview plays the runtime walk');
  await create('herd');
  await page.waitForFunction(()=>/Dans ce projet \(2\)/.test(document.querySelector('#tools')?.textContent??''),{},{timeout:10000});
  check(/harde de 5/.test(await tools()),'a wild herd zone is created');
  await page.waitForTimeout(1500);
  if(process.argv[2])await page.screenshot({path:process.argv[2]+'/studio-animals.png'});
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='Sauvegardé localement',{},{timeout:15000});
  const popup=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Jouer ici'}).click();
  const game=await popup;game.on('pageerror',e=>errors.push('game: '+e.message));
  await game.locator('#start-overlay').waitFor({state:'hidden',timeout:90000});
  await game.goto(game.url()+'&metrics=1');
  await game.locator('#start-overlay').waitFor({state:'hidden',timeout:90000});
  await game.waitForFunction(()=>window.littleWorldDebug?.animals,{},{timeout:60000});
  const played=await game.evaluate(()=>{const sim=window.littleWorldDebug.animals.sim;return {ids:[...sim.animals.keys()],vehicles:sim.stats.vehicles,team:[...sim.animals.values()].find(a=>a.vehicleId)?.author};});
  check(played.ids.some(id=>id.startsWith('animal:capybara-'))&&played.ids.some(id=>id.includes('harde')),'« Jouer ici » loads the authored animals with their stable ids ('+played.ids.length+')');
  check(played.vehicles===1&&played.team.riderId==='npc-carter'&&played.team.ownerId==='npc-carter'&&played.team.loadout==='caravan','owner, driver, equipment and route survive compilation');
  if(process.argv[2])await game.screenshot({path:process.argv[2]+'/studio-animals-play.png'});
  check(errors.length===0,'no page error ('+errors.slice(0,3).join(' | ')+')');
  console.log(`Animals Studio checks passed (${checks}).`);
}finally{await browser.close();}
