/** Studio lot 2 (E4 + E5): characters placed and configured in 3D, route drawn in the scene,
 * one-click collectable, biome and smoothing strokes, then tested in the game copy. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Village test');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const canvas=page.locator('.viewport canvas'),camera=async()=>JSON.parse(await canvas.getAttribute('data-camera'));
  const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:60000});
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title'),title=()=>page.locator('#inspector h3').first().textContent();
  await idle();const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.mouse.move(cx,cy);await page.keyboard.press('Digit7');await page.waitForTimeout(700);
  for(let i=0;i<30;i++){const z=(await camera()).zoom;if(z>=70&&z<=130)break;await page.mouse.wheel(0,z<70?100:-100);await page.waitForTimeout(60);}await idle();
  const at=(dx,dy)=>({x:cx+dx,y:cy+dy});

  // E5 — place a character from the Personnages tool, configure it in the inspector.
  await page.getByRole('button',{name:'Personnages',exact:true}).click();await page.getByLabel('Nom du nouveau personnage').fill('Noisette');
  const npc=at(-60,-40);await page.mouse.move(npc.x,npc.y,{steps:3});await page.mouse.click(npc.x,npc.y);
  await page.getByLabel('Nom du personnage',{exact:true}).waitFor();check((await page.getByLabel('Nom du personnage',{exact:true}).inputValue())==='Noisette','A character is placed directly in 3D and selected');
  await page.getByLabel('Activité',{exact:true}).selectOption('wander');await page.getByLabel('Rayon de promenade (m)').fill('6');await page.getByLabel('Chapeau',{exact:true}).check();
  await page.getByRole('button',{name:'Appliquer le personnage'}).click();await page.getByText(/Personnage appliqué/).waitFor();check(true,'Routine and appearance are configured from the inspector');
  // Route drawn in the scene: 3 clicks + Enter = one transaction.
  await page.getByRole('button',{name:'Tracer son trajet'}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.tool==='polyline');
  for(const [dx,dy]of [[-20,40],[40,60],[60,-10]]){const q=at(dx,dy);await page.mouse.click(q.x,q.y);await page.waitForTimeout(120);}
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.tool==='select');
  check((await undoTitle()).includes('Tracer le trajet'),'Enter commits the route as one transaction');
  await page.getByText(/Trajet : 4 point\(s\)/).waitFor();check(true,'Route (start + 3 clicks) is stored and shown in the inspector');
  // E5 — object + one-click collectable interaction from the inspector.
  await page.getByRole('button',{name:'Objets',exact:true}).click();await page.getByRole('button',{name:'Placer : Lanterne'}).click();const lamp=at(70,90);await page.mouse.move(lamp.x,lamp.y,{steps:3});await page.mouse.click(lamp.x,lamp.y);
  await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='Lanterne');await page.keyboard.press('Escape');
  await page.getByLabel('Ressource ramassée').fill('Lanterne');await page.getByRole('button',{name:'Rendre collectable'}).click();await page.getByText(/Objet collectable/).waitFor();
  check((await undoTitle()).includes('Rendre collectable'),'One-click collectable is an undoable transaction');
  // E4 — biome painting and smoothing, each stroke = one transaction.
  await page.getByRole('button',{name:'Biotopes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.tool==='forest');
  await page.mouse.move(cx-150,cy+150);await page.mouse.down();await page.mouse.move(cx-40,cy+150,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-action=undo]')?.title.includes('Peindre un biotope'));check(true,'Biome stroke is one transaction');
  await page.getByRole('button',{name:'Relief',exact:true}).click();await page.getByRole('button',{name:'Lisser',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.tool==='smooth');
  await page.mouse.move(cx+120,cy-150);await page.mouse.down();await page.mouse.move(cx+200,cy-150,{steps:8});
  const preview=await page.screenshot({path:out+'/editor-brush-preview.png'});void preview;await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('[data-action=undo]')?.title.includes('Lisser le relief'));check(true,'Smoothing stroke is one transaction');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-action=undo]')?.title.includes('Lisser'));check(true,'Smoothing undone');
  // Save, then play here next to the collectable, use it, and come back.
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await page.getByLabel('Rechercher une entité').fill('Lanterne');await page.locator('#tools .search-results button').first().click();await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='Lanterne');
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');await page.screenshot({path:out+'/editor-village.png'});
  const before=await camera();const popup=context.waitForEvent('page');await page.getByRole('button',{name:'Jouer ici'}).click();const game=await popup;game.on('pageerror',e=>errors.push(e.message));
  await game.waitForSelector('#start:not([disabled])',{timeout:60000});await game.locator('#start').click();
  await game.waitForFunction(()=>/Ramasser/.test(document.querySelector('#action')?.textContent??''),{},{timeout:20000});check(true,'In the game, the new collectable offers its interaction');
  await game.keyboard.press('KeyE');await game.waitForFunction(()=>!/Ramasser/.test(document.querySelector('#action')?.textContent??'')||document.querySelector('#action')?.classList.contains('hide'),{},{timeout:10000});check(true,'Pressing E collects it (prompt consumed)');
  await game.close();const after=await camera();check(Math.hypot(after.target.x-before.target.x,after.target.z-before.target.z)<1&&(await title())==='Lanterne','Back in the Studio: same camera and selection');
  check(errors.length===0,errors.join('\n'));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
