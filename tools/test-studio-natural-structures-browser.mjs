/** Studio Structures naturelles: creation, live preview, editing, source ZIP and tunnel excavation.
 * Browser functional check (SwiftShader), not an actual mobile GPU performance certification. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(condition,message)=>{assert.ok(condition,'FAILED: '+message);checks++;console.log('OK: '+message);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Structures naturelles navigateur');
 await page.getByLabel('Modèle et dimensions').selectOption('calm');
 await page.getByText('Dimensions et géographie initiale').click();
 await page.getByLabel('Largeur du monde (m)').fill('1000');await page.getByLabel('Longueur du monde (m)').fill('1000');
 await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
 const canvas=page.locator('.viewport canvas'),tool=t=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,t);
 const idle=()=>page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:120000});
 await idle();await canvas.focus();await page.keyboard.press('Digit7');await page.waitForTimeout(600);
 const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 const camera=async()=>JSON.parse(await canvas.getAttribute('data-camera'));
 for(let i=0;i<30;i++){const zoom=(await camera()).zoom;if(zoom>=70&&zoom<=110)break;
   await page.mouse.move(cx,cy);await page.mouse.wheel(0,zoom<70?100:-100);await page.waitForTimeout(60);}
 await idle();
 const pts=[{x:cx-75,y:cy+20},{x:cx+75,y:cy+20}];
 const placePoints=async()=>{for(const p of pts){await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);}};
 const finish=async(label)=>{await canvas.focus();await page.keyboard.press('Enter');await page.waitForFunction(label=>document.querySelector('[data-action=undo]')?.title?.includes(label),label,{timeout:60000});};
 const exported=async()=>{const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter ZIP',exact:true}).click();
  const d=await promise;return readProjectArchive(new Uint8Array(await readFile(await d.path())));};
 await page.getByRole('button',{name:'Structures naturelles',exact:true}).click();
 await page.getByRole('button',{name:'Nouvelle arche rocheuse'}).click();await tool('polyline');
 await placePoints();
 await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.polylinePreview==='NaturalStructure:arch',null,{timeout:10000})
   .catch(async()=>{const state=await page.evaluate(()=>({canvas:{...document.querySelector('.viewport canvas')?.dataset},status:document.querySelector('#status')?.textContent,trace:document.querySelector('#tools')?.textContent?.slice(0,450)}));console.error('Natural arch preview diagnostic:',JSON.stringify(state));throw Error('3D arch ghost absent');});
 check(true,'3D translucent stone arch preview follows the two endpoints');
 await page.getByLabel('Largeur du passage (m)').fill('8');await page.getByLabel('Largeur du passage (m)').press('Tab');
 await page.getByLabel('Courbure').fill('1.5');await page.getByLabel('Courbure').press('Tab');
 await finish('Créer Arche rocheuse');
 const before=await exported(),stone=Object.values(before.chunks).flatMap(c=>Object.values(c.entities))
  .find(e=>e.components.NaturalStructure?.kind==='arch');
 check(!!stone&&stone.components.NaturalStructure.width===8&&stone.components.NaturalStructure.curvature===1.5,
  'Arch settings survive source ZIP serialization');
 check(!stone.components.Collider,'Natural arch has no full-span collider closing its portal');
 await page.screenshot({path:out+'/studio-natural-arch.png',fullPage:true});
 await page.getByRole('button',{name:'Modifier',exact:true}).first().click();await tool('polyline');
 await page.getByLabel('Épaisseur rocheuse (m)').fill('2');await page.getByLabel('Épaisseur rocheuse (m)').press('Tab');
 await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.polylinePreview==='NaturalStructure:arch');
 await finish('Modifier Arche rocheuse');
 const changed=await exported(),edited=changed.chunks[changed.entityIndex[stone.id].ownerChunkId].entities[stone.id];
 check(edited.components.NaturalStructure.thickness===2,'Editing updates the same stable V3 entity');
 await page.getByRole('button',{name:'Annuler',exact:true}).click();
 const old=await exported();
 check(old.chunks[old.entityIndex[stone.id].ownerChunkId].entities[stone.id].components.NaturalStructure.thickness!==2,
   'Undo restores old natural structure dimensions');
 await page.getByRole('button',{name:'Refaire',exact:true}).click();
 await page.getByRole('button',{name:'Nouveau tunnel traversant'}).click();await tool('polyline');
 await placePoints();await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.polylinePreview==='NaturalStructure:tunnel');
 await finish('Créer Tunnel traversant');
 const tunnel=await exported(),entities=Object.values(tunnel.chunks).flatMap(c=>Object.values(c.entities));
 const body=entities.find(e=>e.components.NaturalStructure?.kind==='tunnel');
 const excavations=Object.values(tunnel.chunks).flatMap(c=>c.terrainEdits.filter(e=>e.id.startsWith('natural:'+body?.id+':')));
 check(!!body&&excavations.length>=2,'Tunnel creates a traversable vault and native V3 terrain excavation');
 await page.screenshot({path:out+'/studio-natural-tunnel.png',fullPage:true});
 check(!errors.length,errors.join('\n')||'No JavaScript errors in Studio');
 console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
