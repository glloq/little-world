/** E8 — paths network in a real browser (Chromium/SwiftShader: functional check only).
 * Acceptance: draw a network with junctions and several surfaces, edit it, then find the very
 * same network in « Jouer ici » (same path definitions → same deterministic geometry).
 * Usage: npm run test:paths */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {inspectorSettled} from './studio-test-helpers.mjs';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,300));});page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Réseau de chemins');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const canvas=page.locator('.viewport canvas'),camera=async()=>JSON.parse(await canvas.getAttribute('data-camera')),data=k=>canvas.getAttribute('data-'+k);
  const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:60000});
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title'),tool=t=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,t);
  await idle();const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.mouse.move(cx,cy);await page.keyboard.press('Digit7');await page.waitForTimeout(700);
  for(let i=0;i<30;i++){const z=(await camera()).zoom;if(z>=70&&z<=130)break;await page.mouse.wheel(0,z<70?100:-100);await page.waitForTimeout(60);}await idle();
  await page.getByRole('button',{name:'Chemins et rivières',exact:true}).click();
  const draw=async(kind,points)=>{await page.getByLabel('Type des nouveaux chemins').selectOption(kind);await page.getByRole('button',{name:'Nouveau chemin'}).click();await tool('polyline');
    for(const [dx,dy]of points){await page.mouse.click(cx+dx,cy+dy);await page.waitForTimeout(120);}await page.keyboard.press('Enter');await tool('select');await page.getByRole('button',{name:'Chemins et rivières',exact:true}).click();};
  await draw('stone',[[-260,0],[-60,20],[120,-10],[280,10]]);
  await draw('trail',[[-40,-220],[-50,-80],[-61,19]]);
  await draw('wood',[[140,-8],[170,120],[220,200]]);
  await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.paths==='3');check(true,'Three paths of three surfaces drawn with one tool');
  const snapped=await page.evaluate(()=>document.querySelector('.viewport canvas')?.dataset.polylineSnap);
  check(await page.locator('.feature-row').filter({hasText:'Sentier'}).locator('p').filter({hasText:'raccord incomplet'}).count()===0,'The trail end snapped onto the stone road (no incomplete junction) '+snapped);
  check(Number(await data('path-sectors'))>=2,'Path surfaces are cut into sectors ('+(await data('path-sectors'))+')');
  // Edit after creation: change the trail into a dirt road and widen it, then move a point.
  await page.getByRole('button',{name:'Sélection',exact:true}).click();await idle();
  await page.getByRole('button',{name:'Filtre Chemins'}).click();await page.locator('.search-results button',{hasText:'Sentier'}).click();
  // The inspector re-renders asynchronously after each transaction: wait until the old field is replaced.
  await page.waitForSelector('#inspector .path-diagnostics');const before=await page.getByLabel('Largeur (m)',{exact:true}).elementHandle();
  await inspectorSettled(page);await page.locator('#inspector select').first().selectOption('dirt');await page.waitForFunction(()=>/Type de chemin/.test(document.querySelector('[data-action=undo]').title));
  await page.waitForFunction(el=>!el.isConnected,before);
  await inspectorSettled(page);const width=page.getByLabel('Largeur (m)');await width.fill('4');await width.press('Tab');await page.waitForFunction(()=>/Largeur du chemin/.test(document.querySelector('[data-action=undo]').title));
  check(/terre/.test(await page.locator('#inspector h3').textContent()),'Path profile and width edited after creation');
  check(await page.locator('#inspector .path-diagnostics').count()===1,'Inspector shows slope/junction diagnostics');
  await idle();await page.waitForTimeout(500);const signature=await data('path-signature');await page.screenshot({path:out+'/paths-studio.png'});
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');
  // Play here: same network in the compiled test copy.
  const popup=context.waitForEvent('page');await page.getByRole('button',{name:'Jouer ici'}).click();const game=await popup;game.on('pageerror',e=>errors.push(e.message));game.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,300));});
  await game.waitForSelector('#start:not([disabled])',{timeout:60000});const url=new URL(game.url());url.searchParams.set('metrics','1');await game.goto(url.toString());
  await game.waitForSelector('#start:not([disabled])',{timeout:60000});await game.locator('#start').click();
  await game.waitForFunction(()=>window.littleWorldMetrics?.paths?.paths>=0,{},{timeout:60000});
  const runtime=await game.evaluate(()=>window.littleWorldMetrics.paths);
  check(runtime.paths===3&&runtime.signature===signature,`« Jouer ici » renders the same path network (signature ${runtime.signature} = ${signature})`);
  await game.waitForFunction(()=>window.littleWorldMetrics.paths.sectors>0,{},{timeout:60000});check(true,'Runtime builds path sectors near the player');
  await game.screenshot({path:out+'/paths-game.png'});await game.close();
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
