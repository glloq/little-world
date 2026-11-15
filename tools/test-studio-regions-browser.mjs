/** A/B Studio browser acceptance: author a polygon region, preview mask/plateau,
 * export V3, edit same stable instance and undo. SwiftShader, not mobile GPU benchmark. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;function check(ok,message){assert.ok(ok,'FAILED: '+message);checks++;console.log('OK: '+message);}
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[];
 page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 await page.goto(base+'studio/');
 await page.getByLabel('Nom du projet').fill('A B Régions');
 await page.getByLabel('Modèle et dimensions').selectOption('calm');
 await page.getByText('Dimensions et géographie initiale').click();
 await page.getByLabel('Largeur du monde (m)').fill('1000');
 await page.getByLabel('Longueur du monde (m)').fill('1000');
 await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
 const canvas=page.locator('.viewport canvas'),tool=t=>page.waitForFunction(t=>document.querySelector('.viewport canvas')?.dataset.tool===t,t);
 await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&document.querySelector('.viewport canvas')?.dataset.pending==='0',{},{timeout:120000});
 await canvas.focus();await page.keyboard.press('Digit7');await page.waitForTimeout(650);
 const rect=await canvas.boundingBox(),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
 const camera=async()=>JSON.parse(await canvas.getAttribute('data-camera'));
 for(let i=0;i<30;i++){
   const zoom=(await camera()).zoom;if(zoom>=100&&zoom<=160)break;
   await page.mouse.move(cx,cy);await page.mouse.wheel(0,zoom<100?100:-100);await page.waitForTimeout(60);
 }
 const polygon=[[cx-85,cy-70],[cx+85,cy-70],[cx+85,cy+70],[cx-85,cy+70]];
 const save=async()=>{const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter ZIP',exact:true}).click();
   const download=await promise;return readProjectArchive(new Uint8Array(await readFile(await download.path())));};
 await page.getByRole('button',{name:'Régions',exact:true}).click();
 await page.getByRole('button',{name:'Tracer une rivière automatique'}).waitFor({state:'visible'});
 check(true,'A: guided downhill river tool is exposed');
  check(await page.getByRole('button',{name:'Escarpement rocheux'}).isVisible(),'A2: native 3D cliff-like ridge tool is exposed');
  check(await page.getByRole('button',{name:'Analyser le réseau hydrologique'}).isVisible(),'A3: hydrology diagnosis module available');
 await page.getByRole('button',{name:'Dessiner une nouvelle région'}).click();await tool('polyline');
 await page.getByLabel('Nom de la région').fill('Forêt montagneuse');await page.getByLabel('Nom de la région').press('Tab');
 await page.getByLabel('Relief de région').selectOption('plateau');
 await page.getByLabel('Altitude du plateau (m)').fill('130');await page.getByLabel('Altitude du plateau (m)').press('Tab');
 await page.getByLabel('Biotope',{exact:true}).selectOption('marsh');
  await page.getByLabel('Arbres (× profil)').fill('0.5');await page.getByLabel('Arbres (× profil)').press('Tab');
  await page.getByLabel('Essence dominante').selectOption('nature.pine');
 await page.getByLabel('Transition écologique (m)').fill('0');await page.getByLabel('Transition écologique (m)').press('Tab');
 for(const [x,y]of polygon){await page.mouse.move(x,y);await page.mouse.click(x,y);}
 await canvas.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-action=undo]')?.title?.includes('Région Forêt montagneuse'),{},{timeout:60000});
 const project=await save(),regions=Object.values(project.libraries.regions??{});
 check(regions.length===1,'A: native polygonal authoring region saved in V3 source');
 const region=regions[0];
 check(region.points.length===4&&region.name==='Forêt montagneuse','A: drawn vertices and region name preserved');
 check(project.world.terrain.archipelago.features.some(f=>f.id===region.id+'.plateau'&&f.heightM===130),'A: editable native plateau relief feature');
 check(Object.values(project.chunks).some(c=>c.layers?.biome?.includes('w')),'B: ecological marsh biome masks actually written to terrain sectors');
 check(region.generated.revision===1,'B: generation ownership revision recorded');
  check(region.vegetation.trees===0.5&&region.vegetation.treeMix['nature.pine']>0,'B2: tree density and species preference persisted in V3 ZIP');
 await page.screenshot({path:out+'/studio-region-first.png',fullPage:true});
 await page.getByRole('button',{name:'Régions',exact:true}).click();
 await page.getByRole('button',{name:'Modifier',exact:true}).first().click();await tool('polyline');
 await page.getByLabel('Biotope',{exact:true}).selectOption('forest');
 await canvas.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-action=undo]')?.title?.includes('Région Forêt montagneuse'),{},{timeout:60000});
 const next=await save(),changed=next.libraries.regions[region.id];
 check(changed.generated.revision===2&&changed.preset==='forest','B: regenerate same region in-place, keep stable ID');
  check(changed.vegetation.trees===0.5,'B2: vegetation tuning preserved through in-place regional regeneration');
 check(Object.values(next.chunks).some(c=>c.layers?.biome?.includes('f')),'B: new biome mask applied');
 await page.getByRole('button',{name:'Annuler',exact:true}).click();
 const rollback=await save();
 check(rollback.libraries.regions[region.id].preset==='marsh','B: Undo restores prior ecosystem recipe');
 await page.screenshot({path:out+'/studio-region-undo.png',fullPage:true});
 check(!errors.length,errors.join('\n')||'No browser JavaScript errors');
 console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
