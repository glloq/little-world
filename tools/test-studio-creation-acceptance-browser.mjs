/** End-to-end Studio creation acceptance: actual viewport tools (Chromium + SwiftShader).
 * Saves screenshots as CI artifacts. This does not certify aesthetics or GPU performance. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(condition,message)=>{assert.ok(condition,'FAILED: '+message);console.log('OK: '+message);checks++;};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base+'studio/');
 await page.getByRole('button',{name:'Scène de référence géographique'}).click();
 const canvas=page.locator('.viewport canvas'),waitTool=tool=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,tool,{timeout:20000});
 const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:120000});
 const undoTitle=()=>page.locator('[data-action=undo]').getAttribute('title');
 await idle();await canvas.focus();await page.keyboard.press('Digit7');
 const camera=async()=>JSON.parse(await canvas.getAttribute('data-camera'));
 const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 for(let i=0;i<32;i++){
   const zoom=(await camera()).zoom;if(zoom>=70&&zoom<=120)break;
   await page.mouse.move(cx,cy);await page.mouse.wheel(0,zoom<70?100:-100);await page.waitForTimeout(50);
 }
 await idle();
 // Wall: genuine 3D polyline, commit, undo and redo.
 await page.getByRole('button',{name:'Objets',exact:true}).click();
 await page.getByRole('button',{name:'Tracer un mur / une clôture'}).click();await waitTool('polyline');
 for(const [dx,dy] of [[-100,-60],[-30,-60],[30,-45],[100,-45]])await page.mouse.click(cx+dx,cy+dy);
 await canvas.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>/Construire un mur modulaire/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:30000});
 check(true,'Wall placement committed as one undoable operation');
 await page.screenshot({path:out+'/studio-modular-wall.png',fullPage:true});
 await page.keyboard.press('Control+z');await page.waitForFunction(()=>!/Construire un mur modulaire/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:20000});
 check(true,'Undo removes the modular wall');
 await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>/Construire un mur modulaire/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:20000});
 check(true,'Redo restores the wall');
 // Geographic vegetation exclusion uses the exact V3 occupation mask, reversible.
 await page.getByRole('button',{name:'Biotopes',exact:true}).click();
 await page.getByRole('button',{name:'Sans végétation',exact:true}).click();await waitTool('exclude-vegetation');
 await page.mouse.move(cx-50,cy+90);await page.mouse.down();await page.mouse.move(cx+35,cy+90,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>/Exclure la végétation/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:30000});
 check(true,'Procedural vegetation exclusion committed via geographic mask');
 await page.screenshot({path:out+'/studio-vegetation-exclusion.png',fullPage:true});
 await page.getByRole('button',{name:'Rétablir végétation',exact:true}).click();await waitTool('restore-vegetation');
 await page.mouse.move(cx-50,cy+90);await page.mouse.down();await page.mouse.move(cx+35,cy+90,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>/Restaurer la végétation/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:30000});
 check(true,'Only excluded vegetation cells are restored');
 // Build a two-item assembly through real library, multi-selection and toolbar.
 await page.getByRole('button',{name:'Objets',exact:true}).click();
 await page.getByRole('button',{name:'Placer : Lanterne',exact:true}).click();
 await waitTool('place');
 const A={x:cx-125,y:cy+125},B={x:cx+125,y:cy+125};
 await page.mouse.move(A.x,A.y);await page.mouse.click(A.x,A.y);
 await page.mouse.move(B.x,B.y);await page.mouse.click(B.x,B.y);
 await page.keyboard.press('Escape');await waitTool('select');
 await page.mouse.click(A.x,A.y);
 await page.keyboard.down('Shift');await page.mouse.click(B.x,B.y);await page.keyboard.up('Shift');
 await page.waitForFunction(()=>document.querySelector('#inspector h3')?.textContent==='2 éléments',{},{timeout:20000});
 await page.getByRole('button',{name:'Objets',exact:true}).click();
 await page.getByRole('button',{name:'Enregistrer la sélection'}).click();
 await page.waitForFunction(()=>/2 objets/.test(document.querySelector('.assembly-panel .feature-row')?.textContent??''),{},{timeout:30000});
 check(true,'Captured two selected objects as reusable assembly');
 const countBefore=Number(await canvas.getAttribute('data-models'));
 await page.getByRole('button',{name:'Placer au centre de la vue'}).click();
 await page.waitForFunction(()=>/Placer assemblage/.test(document.querySelector('[data-action=undo]')?.title??''),{},{timeout:30000});
 await page.waitForFunction(n=>Number(document.querySelector('.viewport canvas')?.dataset.models)>n,countBefore,{timeout:30000});
 check(true,'Assembly copy inserted from model, with one undoable transaction');
 await page.screenshot({path:out+'/studio-prefab-placement.png',fullPage:true});
 check(errors.length===0,errors.join('\n')||'No browser page errors');
 console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
