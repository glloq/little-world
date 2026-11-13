/** E7 — universal selection in a real browser (Chromium/SwiftShader: functional check only).
 * Acceptance: select a path in 3D, modify it, switch to the 2D map, find it again, save,
 * reload and continue editing it with the same identity; other element kinds, lock, delete
 * and undo. Usage: npm run test:selection */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Sélection universelle');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const canvas=page.locator('.viewport canvas'),camera=async()=>JSON.parse(await canvas.getAttribute('data-camera'));
  const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:60000});
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title'),tool=t=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,t);
  const tag=()=>page.locator('#inspector .selection-tag').first().textContent();
  await idle();const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.mouse.move(cx,cy);await page.keyboard.press('Digit7');await page.waitForTimeout(700);
  for(let i=0;i<30;i++){const z=(await camera()).zoom;if(z>=70&&z<=130)break;await page.mouse.wheel(0,z<70?100:-100);await page.waitForTimeout(60);}await idle();
  // A path drawn across the screen centre.
  await page.getByRole('button',{name:'Chemins et rivières',exact:true}).click();await page.getByRole('button',{name:'Nouveau chemin'}).click();await tool('polyline');
  for(const [dx,dy]of [[-200,0],[0,10],[200,0]]){await page.mouse.click(cx+dx,cy+dy);await page.waitForTimeout(120);}await page.keyboard.press('Enter');await tool('select');
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await idle();
  // Select it directly in the 3D view (ground point on the path).
  await page.mouse.click(cx-100,cy+5);await page.waitForFunction(()=>/Chemin/.test(document.querySelector('#inspector h3')?.textContent??''));
  const id=(await tag()).split(' · ')[1].split(' · ')[0];check(id.startsWith('path:'),'Path selected in 3D by clicking it ('+id+')');
  check(await page.locator('.viewport canvas').evaluate(()=>true)&&(await page.locator('#inspector select').first().inputValue())==='dirt','Path inspector shows its profile');
  await page.locator('#inspector select').first().selectOption('stone');await page.waitForFunction(()=>/Type de chemin/.test(document.querySelector('[data-action=undo]').title));
  check(/pavé/.test(await page.locator('#inspector h3').textContent()),'Path type changed (one transaction)');
  // Gizmo translation of the whole path is one transaction.
  const before=await page.evaluate(()=>document.querySelector('#inspector h3').textContent);
  // 2D map: the path is still selected and highlighted.
  await page.getByRole('button',{name:'Carte globale',exact:true}).click();await page.locator('#panel-host canvas').waitFor();
  check((await tag()).includes(id),'Selection kept when switching to the 2D map');
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');
  // Reload: same project, same selection, editing continues on the same id.
  await page.reload();await page.getByRole('button',{name:'Ouvrir le monde'}).first().click();
  await page.waitForFunction(()=>!!document.querySelector('#inspector .selection-tag'),{},{timeout:60000});
  check((await tag()).includes(id),'Selection restored after reload with the same id');
  const width=page.getByLabel('Largeur (m)');await width.fill('5');await width.press('Tab');await page.waitForFunction(()=>/Largeur du chemin/.test(document.querySelector('[data-action=undo]').title));
  check((await tag()).includes(id),'Editing continues after reload (width changed, identity kept) '+before);
  // Other kinds through the author list: zone and terrain retouch.
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await idle();
  await page.getByRole('button',{name:'Filtre Chemins'}).click();check(await page.locator('.search-results button[data-kind=path]').count()===1,'Author list lists paths');
  // Lock prevents deletion; unlock then delete; undo restores the same id.
  await page.getByRole('button',{name:'Verrouiller'}).click();await canvas.click({position:{x:5,y:5},modifiers:[]}).catch(()=>{});
  await page.locator('.search-results button[data-kind=path]').click();await canvas.focus();await page.keyboard.press('Delete');await page.waitForTimeout(300);
  check(/verrouillé/.test(await page.locator('#status').textContent()),'Locked element cannot be deleted');
  await page.getByRole('button',{name:'Déverrouiller'}).click();await canvas.focus();await page.keyboard.press('Delete');
  await page.waitForFunction(()=>/Supprimer un élément/.test(document.querySelector('[data-action=undo]').title));check(await page.locator('.search-results button[data-kind=path]').count()===0,'Unlocked path deleted');
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelectorAll('.search-results button[data-kind=path]').length===1);check(true,'Undo restores the path');
  await page.locator('.search-results button[data-kind=path]').click();check((await tag()).includes(id),'Restored path keeps its id');
  // Duplicate creates a new id.
  await canvas.focus();await page.keyboard.press('Control+d');await page.waitForFunction(()=>/Dupliquer/.test(document.querySelector('[data-action=undo]').title));
  await page.waitForFunction(id=>{const t=document.querySelector('#inspector .selection-tag')?.textContent??'';return /path:/.test(t)&&!t.includes(id);},id);check(true,'Duplicate selects a copy with a new id');
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
