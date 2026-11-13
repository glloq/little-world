/** Studio lot 3 (E6): paths, rivers and activity zones drawn and edited in the 3D view. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Monde tracé');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const canvas=page.locator('.viewport canvas'),camera=async()=>JSON.parse(await canvas.getAttribute('data-camera')),data=k=>canvas.getAttribute('data-'+k);
  const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:60000});
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title'),tool=t=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,t);
  await idle();const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,at=(dx,dy)=>({x:cx+dx,y:cy+dy});
  await page.mouse.move(cx,cy);await page.keyboard.press('Digit7');await page.waitForTimeout(700);
  for(let i=0;i<30;i++){const z=(await camera()).zoom;if(z>=70&&z<=130)break;await page.mouse.wheel(0,z<70?100:-100);await page.waitForTimeout(60);}await idle();
  const draw=async(points)=>{for(const [dx,dy]of points){const q=at(dx,dy);await page.mouse.click(q.x,q.y);await page.waitForTimeout(120);}await page.keyboard.press('Enter');await tool('select');};
  // Path: draw, then move one of its points after creation.
  await page.getByRole('button',{name:'Chemins et rivières',exact:true}).click();await page.getByRole('button',{name:'Nouveau chemin'}).click();await tool('polyline');
  await draw([[-120,-80],[-60,-40],[-20,-60]]);await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.paths==='1');
  check((await undoTitle()).includes('Tracer un chemin')&&(await page.locator('#breadcrumbs').textContent()).endsWith('/ paths'),'A path is drawn in 3D (one transaction) and the tool returns to its panel');
  await page.getByRole('button',{name:'Éditer les points'}).first().click();await tool('polyline');const p0=at(-120,-80);
  await page.mouse.move(p0.x,p0.y);await page.mouse.down();await page.mouse.move(p0.x,p0.y+70,{steps:6});await page.mouse.up();await page.keyboard.press('Enter');await tool('select');
  await page.waitForFunction(()=>document.querySelector('[data-action=undo]')?.title.includes('Modifier un chemin'));check(true,'A point of an existing path is dragged and saved');
  // River: drawn from the source downstream, rendered as water.
  await page.getByRole('button',{name:'Nouvelle rivière'}).click();await tool('polyline');await draw([[-140,80],[-100,120],[-60,140]]);
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.waterCount==='1');check((await undoTitle()).includes('Tracer une rivière'),'A river is drawn in 3D and rendered');
  // Zones: farm plot and mine contours, validated by the V3 zone contract.
  await page.getByRole('button',{name:'Zones',exact:true}).click();await page.getByRole('button',{name:'Nouvelle parcelle agricole'}).click();await tool('polyline');
  await draw([[30,30],[130,30],[130,110],[30,110]]);await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.zones==='1');
  check(/Parcelle agricole · \d+ m²/.test(await page.locator('.feature-row strong').first().textContent()),'A farm plot contour is drawn and listed with its area');
  await page.getByRole('button',{name:'Nouvelle mine'}).click();await tool('polyline');
  for(const [dx,dy]of [[60,-140],[120,-60],[60,-60],[120,-140]]){const q=at(dx,dy);await page.mouse.click(q.x,q.y);await page.waitForTimeout(120);}
  await page.waitForFunction(()=>/croise/.test(document.querySelector('.viewport canvas')?.dataset.polylineRemark??''));check(true,'A self-intersecting contour is reported while drawing');
  await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');const q=at(60,-60);await page.mouse.click(q.x,q.y);await page.waitForTimeout(120);await page.keyboard.press('Enter');await tool('select');
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.zones==='2');check(true,'Backspace removes points; a valid mine contour is saved');
  await page.getByLabel('Nom de la zone').last().fill('Mine du volcan');await page.getByLabel('Nom de la zone').last().press('Tab');await page.waitForFunction(()=>document.querySelector('[data-action=undo]')?.title.includes('Renommer une zone'));check(true,'Zone renamed from its panel');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();await page.getByRole('button',{name:'Refaire',exact:true}).click();
  await page.screenshot({path:out+'/editor-world-features.png'});
  // Persistence.
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');
  await page.reload();await page.getByRole('button',{name:'Ouvrir le monde'}).first().click();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.zones==='2'&&document.querySelector('.viewport canvas')?.dataset.paths==='1',{},{timeout:30000});
  if(!(await page.locator('#breadcrumbs').textContent()).endsWith('/ zones'))await page.getByRole('button',{name:'Zones',exact:true}).click();
  await page.locator('#tools input[aria-label="Nom de la zone"]').nth(1).waitFor();const names=await page.locator('#tools input[aria-label="Nom de la zone"]').evaluateAll(list=>list.map(i=>i.value));check(names.includes('Mine du volcan')&&await canvas.getAttribute('data-water-count')==='1','Paths, rivers and zones (with their names) survive a reload');
  check(errors.length===0,errors.join('\n'));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
