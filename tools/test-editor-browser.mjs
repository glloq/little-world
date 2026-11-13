/** Studio 3D editor (E1–E3, plus brush/navigation coexistence) on the 3 × 8 km island.
 * Runs against the dev server or the production preview: pages import no source module. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Éditeur île');await page.getByLabel('Modèle et dimensions').selectOption('island');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const canvas=page.locator('.viewport canvas'),idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:60000});
  const camera=async()=>JSON.parse(await canvas.getAttribute('data-camera')),diag=async()=>JSON.parse(await canvas.getAttribute('data-diagnostics')),title=()=>page.locator('#inspector h3').first().textContent();
  const undoLabel=()=>page.getByRole('button',{name:'Annuler',exact:true}).getAttribute('title');
  const saved=async()=>{await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');};
  await idle();check((await page.locator('#breadcrumbs').textContent())==='Éditeur île / scene','A new project opens in the 3D editing space');
  const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;

  // E1 — free flight across several sectors, streaming follows the camera.
  const start=await camera();await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.keyboard.down('KeyD');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(2200);await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyD');await page.mouse.up({button:'right'});
  await idle();const flown=await camera();
  check(Math.hypot(flown.target.x-start.target.x,flown.target.z-start.target.z)>128&&flown.mode==='free','Right button + D + Shift flies across several 64 m sectors ('+Math.round(Math.hypot(flown.target.x-start.target.x,flown.target.z-start.target.z))+' m)');
  const terrain=(await diag()).terrain;check(terrain.active>0&&terrain.pending===0,'Terrain detail was streamed around the new position');
  // Orbit, zoom to cursor, top view and focus transitions.
  await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx+120,cy+40,{steps:6});await page.mouse.up({button:'right'});
  const before=await camera();await page.mouse.move(cx+150,cy+100);await page.mouse.wheel(0,-300);await page.waitForTimeout(400);const zoomed=await camera();
  check(Math.hypot(zoomed.x-before.x,zoomed.y-before.y,zoomed.z-before.z)>1,'Wheel zooms towards the cursor');
  await page.keyboard.press('Digit7');await page.waitForTimeout(700);check((await camera()).mode==='top','7 switches to the orthographic top view');
  await page.keyboard.press('Digit7');await page.waitForTimeout(700);check((await camera()).mode==='orbit','7 again returns to orbit');
  await page.mouse.down({button:'middle'});await page.mouse.move(cx-90,cy,{steps:5});await page.mouse.up({button:'middle'});const panned=await camera();check(Math.hypot(panned.target.x-zoomed.target.x,panned.target.z-zoomed.target.z)>.5,'Middle button pans the view');
  // Return to a comfortable framing for authoring.
  await page.keyboard.press('Digit7');await page.waitForTimeout(700);await page.mouse.move(cx,cy);
  for(let i=0;i<30;i++){const z=(await camera()).zoom;if(z>=60&&z<=140)break;await page.mouse.wheel(0,z<60?100:-100);await page.waitForTimeout(60);}
  const topView=await camera();check(topView.mode==='top'&&topView.zoom>=60&&topView.zoom<=140,'Top view framed for placement ('+Math.round(topView.zoom)+' m)');await idle();

  // E3 — library placement with rotation before validation, repeatable, Escape to finish.
  await page.getByRole('button',{name:'Objets',exact:true}).click();await page.getByRole('button',{name:'Placer : Lanterne'}).click();
  const A={x:cx-160,y:cy},B={x:cx+160,y:cy};
  await page.mouse.move(A.x,A.y,{steps:3});await page.keyboard.press('r');await page.mouse.click(A.x,A.y);await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.models==='1');
  await page.mouse.move(B.x,B.y,{steps:3});await page.mouse.click(B.x,B.y);await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.models==='2');
  check(true,'Two lanterns placed from the library with successive clicks');
  check(Math.abs(Number(await page.getByLabel('Lacet (Y)').inputValue())-15)<.01,'The chosen rotation applies to successive placements');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.tool==='select');check(true,'Escape leaves placement for selection');
  // E2 — click, Shift multi-selection, Escape and empty click.
  const selectA=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='Votre monde');await page.mouse.click(A.x,A.y);await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='Lanterne');};
  await selectA();
  check(Math.abs(Number(await page.getByLabel('Lacet (Y)').inputValue())-15)<.01,'Placement rotation (R before click) is stored');
  const idA=(await page.locator('#inspector .selection-tag').textContent()).split('· ')[1];
  await page.keyboard.down('Shift');await page.mouse.click(B.x,B.y);await page.keyboard.up('Shift');await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='2 éléments');check(true,'Shift+click builds a multi-selection');
  check((await page.locator('#viewport-status').textContent()).includes('2 sélectionné'),'Status bar shows the selection count');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='Votre monde');check(true,'Escape clears the selection');
  await selectA();await page.mouse.click(box.x+30,box.y+box.height-30);await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='Votre monde');check(true,'Clicking empty ground deselects');
  await page.getByLabel('Rechercher une entité').fill('Lanterne');check((await page.locator('#tools .search-results button').count())===2,'Search lists both lanterns');
  await page.getByRole('button',{name:'Filtre PNJ'}).click();check((await page.locator('#tools .search-results button').count())===0,'Type filter excludes objects from PNJ');await page.getByRole('button',{name:'Filtre Tous'}).click();

  // E3 — gizmo translation: one drag = one transaction, undo restores exactly.
  await selectA();await idle();
  const xBefore=Number(await page.getByLabel('Position X (m)').inputValue());
  const handle=await page.evaluate(async encoded=>{const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const px=ctx.getImageData(0,0,c.width,c.height).data,r=document.querySelector('.viewport canvas').getBoundingClientRect(),hits=[];for(let y=Math.ceil(r.top);y<r.bottom;y+=1)for(let x=Math.ceil(r.left);x<r.right;x+=1){const i=(y*c.width+x)*4;if(px[i]>220&&px[i+1]<60&&px[i+2]<60)hits.push({x,y});}if(!hits.length)return null;const right=Math.max(...hits.map(p=>p.x)),cluster=hits.filter(p=>p.x>right-10);return {x:cluster.reduce((s,p)=>s+p.x,0)/cluster.length,y:cluster.reduce((s,p)=>s+p.y,0)/cluster.length};},(await page.screenshot()).toString('base64'));
  check(!!handle,'The X translation handle is visible');
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+60,handle.y,{steps:8});await page.mouse.up();
  await page.waitForFunction(x=>Math.abs(Number(document.querySelector('input[aria-label="Position X (m)"]')?.value)-x)>.5,xBefore);check((await undoLabel()).includes('Déplacer'),'Gizmo drag committed one "Déplacer" transaction');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(x=>Math.abs(Number(document.querySelector('input[aria-label="Position X (m)"]')?.value)-x)<.001,xBefore);check(true,'Undo restores the position exactly');
  await page.getByRole('button',{name:'Refaire',exact:true}).click();await page.waitForFunction(x=>Math.abs(Number(document.querySelector('input[aria-label="Position X (m)"]')?.value)-x)>.5,xBefore);check(true,'Redo re-applies the gizmo transform');
  // Move across sectors from the inspector: stable ID, new owner sector.
  const field=page.getByLabel('Position X (m)');await field.fill(String(xBefore+260));await field.press('Tab');await page.waitForFunction(x=>Math.abs(Number(document.querySelector('input[aria-label="Position X (m)"]')?.value)-x)<.01,xBefore+260);
  check((await page.locator('#inspector .selection-tag').textContent()).includes(idA),'Moving 260 m across sectors keeps the same V3 ID');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(x=>Math.abs(Number(document.querySelector('input[aria-label="Position X (m)"]')?.value)-x)>.5,xBefore+260);
  // Duplicate / delete.
  await page.keyboard.press('Control+d');await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.models==='3');await page.waitForFunction(id=>{const t=document.querySelector('#inspector .selection-tag')?.textContent??'';return t.includes('·')&&!t.includes(id);},idA);check(true,'Ctrl+D duplicates and selects the copy');
  await page.keyboard.press('Delete');await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.models==='2');check(true,'Delete removes the selection');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.models==='3');check(true,'Deletion is undoable');

  // E4 basics — a brush stroke is one transaction and never blocks the camera.
  await page.getByRole('button',{name:'Relief',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.tool==='raise');
  const camBefore=await camera();await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx+80,cy,{steps:5});await page.mouse.up({button:'right'});
  check(JSON.stringify(await camera())!==JSON.stringify(camBefore)&&!(await undoLabel()).includes('Sculpter'),'With a brush active the right button still orients the camera, without editing');
  await page.mouse.move(cx-100,cy+120);await page.mouse.down();await page.mouse.move(cx+100,cy+120,{steps:10});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-action=undo]')?.title.includes('Sculpter'));check(true,'A continuous stroke is one "Sculpter le relief" transaction');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();

  // Tool switching does not leak listeners, tools or GPU objects.
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await idle();const d0=await diag(),camLoop=await camera();
  for(let i=0;i<12;i++){for(const name of ['Objets','Relief','Biotopes','Sélection'])await page.getByRole('button',{name,exact:true}).click();if(i%4===0){await page.getByRole('button',{name:'Carte globale',exact:true}).click();await page.getByRole('button',{name:'Sélection',exact:true}).click();}}
  await page.mouse.move(cx,cy);await idle();const d1=await diag();
  check(d1.toolActivations-d1.toolDeactivations===1&&d1.sceneChildren===d0.sceneChildren&&Math.abs(d1.geometries-d0.geometries)<=4,`No accumulation after 48 tool changes (scene ${d0.sceneChildren}→${d1.sceneChildren}, geometries ${d0.geometries}→${d1.geometries})`);
  const camAfter=await camera();check(Math.hypot(camAfter.target.x-camLoop.target.x,camAfter.target.z-camLoop.target.z)<.01&&camAfter.mode===camLoop.mode&&d1.models===3,'Camera, scene and models are preserved across tools and panels');

  // Save, reload, reopen: objects, camera and selection come back.
  await page.getByLabel('Rechercher une entité').fill('Lanterne');await page.locator('#tools .search-results button').first().click();await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='Lanterne');await page.waitForTimeout(900);const camSaved=await camera();await saved();
  await page.reload();await page.getByRole('button',{name:'Ouvrir le monde'}).first().click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.models==='3',{},{timeout:30000});
  const restored=await camera();check(Math.hypot(restored.target.x-camSaved.target.x,restored.target.z-camSaved.target.z)<1&&restored.mode===camSaved.mode,'Reload restores camera target and mode');
  check((await title())==='Lanterne','Reload restores the selection');
  // Export ZIP keeps complete transforms.
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter ZIP'}).click();const archive=readProjectArchive(new Uint8Array(await readFile(await (await download).path())));
  const lantern=Object.values(archive.chunks).flatMap(c=>Object.values(c.entities)).find(e=>e.id===idA);
  check(lantern&&Math.abs(lantern.components.Transform.rotation.y-Math.sin(Math.PI/24))<1e-6,'Exported ZIP contains the authored rotation');
  // Play here, then back to the Studio with camera and selection.
  const popup=context.waitForEvent('page');await page.getByRole('button',{name:'Jouer ici'}).click();const game=await popup;game.on('pageerror',e=>errors.push(e.message));
  await game.waitForSelector('#start:not([disabled])',{timeout:60000});check(new URL(game.url()).searchParams.has('studioBuild'),'Play here opens the compiled test copy');
  await game.locator('#start').click();await game.waitForFunction(()=>/X -?\d+/.test(document.querySelector('#coords')?.textContent??''));
  const [gx,gz]=[...(await game.locator('#coords').textContent()).matchAll(/-?\d+/g)].map(m=>Number(m[0]));check(Math.hypot(gx-camSaved.target.x,gz-camSaved.target.z)<40,'The game starts where the author was looking');
  await game.screenshot({path:out+'/editor-playtest.png'});await game.close();
  const back=await camera();check(Math.hypot(back.target.x-camSaved.target.x,back.target.z-camSaved.target.z)<1&&(await title())==='Lanterne','Returning to the Studio keeps camera and selection');
  await page.screenshot({path:out+'/editor-scene.png'});
  check(errors.length===0,errors.join('\n'));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
