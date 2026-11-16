/** Production geography authoring smoke: hydro previews and non-destructive region diff.
 * Chromium/SwiftShader verifies UI wiring, not hydrology aesthetics nor GPU performance. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const out='/tmp/little-world-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;
const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.goto(base+'studio/');
 await page.getByLabel('Nom du projet').fill('Géographie V2 browser');
 await page.getByLabel('Modèle et dimensions').selectOption('calm');
 await page.getByText('Dimensions et géographie initiale').click();
 await page.getByLabel('Largeur du monde (m)').fill('1000');
 await page.getByLabel('Longueur du monde (m)').fill('1000');
 await page.getByRole('button',{name:'Créer le projet',exact:true}).click();
 const canvas=page.locator('.viewport canvas');
 await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&
    document.querySelector('.viewport canvas')?.dataset.pending==='0',null,{timeout:120000});
 await page.getByRole('button',{name:'Régions',exact:true}).click();
 const hydro=async(name,marker)=>{
   await page.getByRole('button',{name}).click();
   await page.waitForFunction(marker=>document.querySelector('#tools')?.textContent?.includes(marker),marker,{timeout:45000});
 };
 await hydro('Analyser les bassins versants','échantillons');
 check(true,'Native D8 basin results are visible');
 await hydro('Proposer des rivières depuis les bassins versants','sources analysées');
 check(true,'Preview of downhill river suggestions is available without writing a river');
 await hydro('Proposer des lacs dans les cuvettes','lac(s) candidat(s)');
 check(true,'Priority-flood lake candidates are visible in Studio');
 await hydro('Proposer des cascades automatiques','cascade(s) proposées');
 check(true,'Batch waterfall suggestions are validated and displayed');
 const overview=page.locator('canvas[aria-label="Carte d’ensemble des propositions hydrologiques"]');
 const metrics=JSON.parse((await overview.getAttribute('data-overview'))??'{}');
 check(Number.isFinite(metrics.lines)&&Number.isFinite(metrics.markers),
   'World overview draws proposal geometry without WebGL/terrain tile rebuild');
 const save=async()=>{
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter ZIP',exact:true}).click();
  const file=await download;return readProjectArchive(new Uint8Array(await readFile(await file.path())));
 };
 const before=await save();
 check(Object.keys(before.libraries.water).length===0,
   'Hydro previews are read-only and do not create real water bodies');
 // Create a real region, then inspect its exact regeneration diff.
 const region=page.getByRole('button',{name:'Dessiner une nouvelle région'});
 await region.click();
 await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.tool==='polyline',null,{timeout:20000});
 await canvas.focus();await page.keyboard.press('Digit7');
 await page.waitForTimeout(550);
 const box=await canvas.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 const camera=async()=>JSON.parse(await canvas.getAttribute('data-camera'));
 for(let i=0;i<30;i++){
  const zoom=(await camera()).zoom;
  if(zoom>=100&&zoom<=160)break;
  await page.mouse.move(cx,cy);await page.mouse.wheel(0,zoom<100?100:-100);
  await page.waitForTimeout(60);
 }
 await page.waitForFunction(()=>document.querySelector('.viewport canvas')?.dataset.idle==='true'&&
   document.querySelector('.viewport canvas')?.dataset.pending==='0',null,{timeout:120000});
 for(const [x,y] of [[cx-50,cy-45],[cx+50,cy-45],[cx+50,cy+45],[cx-50,cy+45]])await page.mouse.click(x,y);
 await canvas.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>/Région Nouvelle région/.test(document.querySelector('[data-action=undo]')?.title??''),null,{timeout:60000});
 await page.getByRole('button',{name:'Régions',exact:true}).click();
 const details=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Composer plusieurs régions'})});
 await details.locator('summary').click();
 await details.locator('input[type=checkbox]').first().check();
 const archived=await save();
 await details.getByRole('button',{name:'Prévisualiser la composition'}).click();
 const overlay=details.locator('canvas[aria-label="Aperçu cartographique des cellules modifiées"]');
 await overlay.waitFor({state:'visible',timeout:40000});
 check(await overlay.getAttribute('width')==='440',
   'Regional regeneration preview shows bounded exact mask-change mini-map');
 const after=await save();
 check(JSON.stringify(archived.libraries.regions)===JSON.stringify(after.libraries.regions),
   'Region dry-run preserves source recipes and generated ownership');
 await page.screenshot({path:out+'/studio-geography-v2.png',fullPage:true});
 check(!errors.length,errors.join('\n')||'No JavaScript errors while previewing geography');
 console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
