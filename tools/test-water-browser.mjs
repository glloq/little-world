import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readProjectArchive} from '../src/studio-core/archive.ts';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 page.setDefaultTimeout(45000);
 await page.goto(base+'studio/');await page.getByLabel('Nom du projet').fill('Hydro navigateur');await page.getByLabel('Dimensions').selectOption('200');await page.getByRole('button',{name:'Créer le projet',exact:true}).click();await page.locator('#workspace canvas').waitFor();
 await page.getByRole('button',{name:'Eau',exact:true}).click();
 const map=page.getByLabel('Tracer le cours d’eau de l’amont vers l’aval');await map.waitFor();
 const r=await map.boundingBox();
 for(const [x,z]of [[-40,-250],[-40,-180],[-40,-100]])await map.click({position:{x:(20+(x+100)/200*960)/1000*r.width,y:(20+(z+300)/600*560)/600*r.height}});
 await page.getByText(/3 points · 150 m/).waitFor();
 const summary=await page.locator('.water-workspace>p').last().textContent();const levels=/Eau : ([\d.-]+) → ([\d.-]+)/.exec(summary);check(levels&&Number(levels[1])-Number(levels[2])>10,'Real terrain profile must descend, not stay at level 4: '+summary);
 await page.getByRole('button',{name:'Appliquer le tracé',exact:true}).click();await page.getByText('Tracé appliqué ; Annuler / Refaire disponibles.').waitFor();
 const exported=async()=>{const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter ZIP',exact:true}).click();const file=await download;return readProjectArchive(new Uint8Array(await readFile(await file.path())));};
 const first=await exported(),water=Object.values(first.libraries.water)[0];check(water.profile.mode==='terrain'&&water.points.length===3,'Applied source and ZIP retain profile settings, not meshes');
 await page.getByRole('button',{name:'Annuler',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Tracé d’eau"]').options.length===1);check(true,'Undo removes source and references');
 await page.getByRole('button',{name:'Refaire',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Tracé d’eau"]').options.length===2);check(true,'Redo restores source');
 await page.getByLabel('Type d’eau',{exact:true}).selectOption('manual');
 for(const [i,level]of [24,20,16].entries()){await page.getByLabel(`Point ${i+1} altitude`,{exact:true}).fill(String(level));await page.getByLabel(`Point ${i+1} altitude`,{exact:true}).press('Tab');}
 await page.getByRole('button',{name:'Appliquer le tracé',exact:true}).click();await page.getByText('Tracé appliqué ; Annuler / Refaire disponibles.').waitFor();
 check(Object.values((await exported()).libraries.water)[0].profile.levels.join(',')==='24,20,16','Manual locked heights survive archive');
 await page.getByLabel('Type d’eau',{exact:true}).selectOption('terrain');await page.getByRole('button',{name:'Inverser amont / aval',exact:true}).click();await page.getByRole('button',{name:'Appliquer le tracé',exact:true}).click();await page.getByText(/L’arrivée est plus haute/).waitFor();
 check(Object.values((await exported()).libraries.water)[0].profile.mode==='manual','Invalid upstream direction cannot overwrite saved source');
 await page.getByRole('button',{name:'Inverser amont / aval',exact:true}).click();await page.getByRole('button',{name:'Appliquer le tracé',exact:true}).click();await page.getByText('Tracé appliqué ; Annuler / Refaire disponibles.').waitFor();
 await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Sauvegardé localement');await page.reload();await page.getByRole('button',{name:'Ouvrir le monde'}).click();await page.getByText(/3 points · 150 m/).waitFor();check(true,'Saved water tool and selection restore after reload');
 await mkdir('/tmp/little-world-browser',{recursive:true});await page.screenshot({path:'/tmp/little-world-browser/water-profile.png'});
 await page.getByRole('button',{name:'Vue 3D locale',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#workspace canvas')?.dataset.renderCount)>3);check(await page.locator('#workspace canvas').getAttribute('data-water-count')==='1','3D local view contains the saved water mesh');await page.screenshot({path:'/tmp/little-world-browser/water-3d.png'});
 const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Tester la copie',exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState();
 // The test copy is a compiled build stored in IndexedDB and read by the game's compiled-world reader.
 const snapshot=await popup.evaluate(async()=>{const id=new URL(location.href).searchParams.get('studioBuild');const db=await new Promise((ok,ko)=>{const r=indexedDB.open('little-world-test-builds');r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);});
  const build=await new Promise((ok,ko)=>{const r=db.transaction('builds').objectStore('builds').get(id);r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);});db.close();
  const manifest=JSON.parse(build.files['manifest.json']),water=manifest.chunks.flatMap(c=>JSON.parse(build.files[c.url]).water);return {spawn:build.spawn,water};});
 check(Math.abs(snapshot.spawn.x+40)<1&&Math.abs(snapshot.spawn.z+183)<2&&snapshot.water[0].profile.mode==='terrain','Playtest starts beside the selected water with its authored profile');await popup.close();
 await page.goto(base+'editor/');await page.waitForFunction(()=>document.querySelector('#editor-message').textContent.startsWith('Prêt'));
 await page.locator('[data-tool="water"]').click();check(await page.locator('#water-mode').inputValue()==='terrain'&&await page.locator('#water-profile').isVisible(),'Legacy editor defaults new streams to relief profiles');
 check(errors.length===0,errors.join('\n'));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
