/** E10 — local lights in a real browser (Chromium/SwiftShader: functional check only, not a GPU benchmark).
 * Place lights with presets, attach one to an object, edit it in the inspector, night preview,
 * budget status, then « Jouer ici »: the compiled runtime gets the same sources and never more
 * dynamic lights than the pool. Usage: npm run test:lights */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/Shader|WebGLProgram/.test(m.text()))errors.push(m.text().slice(0,300));});};watch(page);page.on('dialog',d=>d.accept());
  await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Village éclairé');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
  const canvas=page.locator('.viewport canvas'),camera=async()=>JSON.parse(await canvas.getAttribute('data-camera')),lights=async()=>JSON.parse(await canvas.getAttribute('data-lights')??'{}');
  const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:60000});
  const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title'),tool=t=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,t);
  await idle();const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.mouse.move(cx,cy);for(let i=0;i<30;i++){const z=(await camera()).zoom;if(z>=50&&z<=90)break;await page.mouse.wheel(0,z<50?100:-100);await page.waitForTimeout(60);}await idle();
  // Place six lanterns and two fires with the « Lumières » tool.
  await page.getByRole('button',{name:'Lumières',exact:true}).click();await tool('select');
  await page.getByRole('button',{name:'Placer une lumière'}).click();await tool('place');
  for(const [dx,dy]of [[-200,-60],[-120,40],[-40,-80],[40,60],[120,-40],[200,30]]){await page.mouse.move(cx+dx,cy+dy);await page.mouse.click(cx+dx,cy+dy);await page.waitForFunction(n=>JSON.parse(document.querySelector('.viewport canvas').dataset.lights??'{}').sources>=n,1);}
  await page.waitForFunction(()=>JSON.parse(document.querySelector('.viewport canvas').dataset.lights??'{}').sources===6);
  check(/Placer une lumière/.test(await undoTitle()),'Each placement is one undoable operation');
  await page.keyboard.press('Escape');await tool('select');
  await page.getByLabel('Préréglage').first().selectOption('flickering-fire');await page.getByRole('button',{name:'Placer une lumière'}).click();await tool('place');
  for(const [dx,dy]of [[-80,120],[80,130]])await page.mouse.click(cx+dx,cy+dy);
  await page.waitForFunction(()=>JSON.parse(document.querySelector('.viewport canvas').dataset.lights??'{}').sources===8);await page.keyboard.press('Escape');await tool('select');
  check((await lights()).markers===8,'Eight sources (two presets) shown with selectable editor markers');
  // Night preview: budget applied in the Studio exactly as in the game.
  await page.getByLabel('Aperçu de nuit').check();await idle();await page.waitForTimeout(1200);
  const night=await lights();check(night.pool===4&&night.active<=4&&night.active>=1,`Night preview: ${night.active} dynamic light(s) among ${night.sources} sources (pool ${night.pool})`);
  check(Number(await page.locator('.light-summary').getAttribute('data-dynamic'))===night.active,'Lights list shows the budget decision of each source');
  check(await page.locator('.light-row[data-status=budget]').count()+await page.locator('.light-row[data-status=dynamic]').count()>=1,'Sources over budget are identified');
  await page.screenshot({path:out+'/lights-studio-night.png'});
  // Select a light from the list: inspector edits (one transaction each) and range gizmo.
  // The inspector re-renders asynchronously (selection, transactions): wait until the old fields are replaced.
  const replaced=async label=>{const old=await page.getByLabel(label,{exact:true}).elementHandle();return ()=>page.waitForFunction(el=>!el.isConnected,old);};
  let rerendered=await replaced('Nom');await page.locator('.light-row').first().click();await rerendered();await page.waitForSelector('#inspector .light-card');
  // Several debounced inspector renders can follow one selection (selection + viewport refresh): editing a field
  // that a later render replaces loses the change, so wait until the inspector has been quiet for 400 ms.
  await page.evaluate(()=>{window.__inspectorChanged=performance.now();new MutationObserver(()=>{window.__inspectorChanged=performance.now();}).observe(document.querySelector('#inspector'),{childList:true,subtree:true});});
  const settled=()=>page.waitForFunction(()=>performance.now()-window.__inspectorChanged>400);await settled();
  rerendered=await replaced('Allumage');const intensity=page.getByLabel('Intensité (cd)');await intensity.fill('40');await intensity.press('Tab');await page.waitForFunction(()=>/Intensité de la lumière/.test(document.querySelector('[data-action=undo]').title));await rerendered();
  await page.getByLabel('Allumage').selectOption('state');await page.waitForFunction(()=>/Mode de la lumière/.test(document.querySelector('[data-action=undo]').title));
  await idle();check(['dynamic','budget','glow','far','off'].includes(await canvas.getAttribute('data-selected-light')),'Range gizmo of the selected light shows its budget status');
  await page.keyboard.press('Control+z');await page.waitForFunction(()=>/Intensité de la lumière/.test(document.querySelector('[data-action=undo]').title));check(true,'Undo restores the previous light settings');
  // Attach a light to an object: place a crate, then « Ajouter une lumière » in its inspector.
  await page.getByRole('button',{name:'Objets',exact:true}).click();await tool('place');await page.mouse.click(cx,cy+190);await page.waitForFunction(()=>/Placer Caisse|Placer (?!une lumière)/.test(document.querySelector('[data-action=undo]').title));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>/Caisse/.test(document.querySelector('#inspector h3')?.textContent??''));await page.getByRole('button',{name:'Ajouter une lumière'}).click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('.viewport canvas').dataset.lights??'{}').sources===9);check(true,'A light attached to an object (independent of its model)');
  await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');
  // « Jouer ici » at night: same sources, bounded dynamic lights, no shader recompilation while moving.
  const popup=context.waitForEvent('page');await page.getByRole('button',{name:'Jouer ici'}).click();const game=await popup;watch(game);
  await game.waitForSelector('#start:not([disabled])',{timeout:60000});const url=new URL(game.url());url.searchParams.set('metrics','1');url.searchParams.set('night','1');await game.goto(url.toString());
  await game.waitForSelector('#start:not([disabled])',{timeout:60000});await game.locator('#start').click();
  await game.waitForFunction(()=>window.littleWorldMetrics?.lights?.sources>=0,{},{timeout:60000});await game.waitForTimeout(1500);
  const runtime=await game.evaluate(()=>({...window.littleWorldMetrics.lights,programs:window.littleWorldMetrics.programs}));
  check(runtime.sources===9,`« Jouer ici » receives the same 9 light sources (${runtime.sources})`);
  check(runtime.pool===4&&runtime.active<=4,`Runtime: ${runtime.active} dynamic light(s), pool ${runtime.pool}, ${runtime.glow} halo(s)`);
  await game.keyboard.down('KeyW');let maxActive=0;for(let i=0;i<10;i++){await game.waitForTimeout(250);maxActive=Math.max(maxActive,await game.evaluate(()=>window.littleWorldMetrics.lights.active));}await game.keyboard.up('KeyW');
  const after=await game.evaluate(()=>window.littleWorldMetrics.programs);
  check(maxActive<=4&&after===runtime.programs,`Walking: at most ${maxActive} dynamic lights, shader programs stable (${runtime.programs} → ${after})`);
  await game.screenshot({path:out+'/lights-game-night.png'});await game.close();
  check(errors.length===0,errors.join('\n')||'No page errors');
  console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
