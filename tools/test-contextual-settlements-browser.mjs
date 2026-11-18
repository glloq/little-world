import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readProjectArchive} from '../src/studio-core/archive.ts';
import {waitForBrowserCondition} from './poll-browser.mjs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out=process.env.CONTEXT_CAPTURE_DIR??'/tmp/little-world-contextual-settlements';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],profiles=[];let checks=0;const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('OK',label);};
try{for(const pattern of ['street','mountain','river','fishing']){
 const context=await browser.newContext({viewport:{width:1540,height:1080}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'studio/');
 await page.evaluate(async pattern=>{const {contextualSettlementFixture}=await import('/little-world/tools/context-settlement-fixture.mjs'),{ProjectStore}=await import('/little-world/src/studio-core/project-store.ts');await new ProjectStore().create(contextualSettlementFixture(pattern).project);},pattern);
 await page.reload();await page.getByRole('button',{name:'Reprendre un projet',exact:true}).click();await page.getByRole('button',{name:'Continuer',exact:true}).first().click();await page.locator('.viewport canvas').waitFor();await page.getByRole('button',{name:'Villages & villes',exact:true}).click();
 await page.getByLabel('Type d’implantation',{exact:true}).selectOption('village');await page.getByLabel('Organisation',{exact:true}).selectOption(pattern);
 await page.getByLabel('Point d’intérêt central',{exact:true}).selectOption('activity');await page.getByRole('button',{name:'3. Personnalisation',exact:true}).click();await page.getByLabel('Taille',{exact:true}).selectOption('20');
 if(pattern==='fishing'){await page.getByText('Plus de réglages',{exact:true}).click();await page.getByLabel('Centre Z (m)',{exact:true}).fill('295');await page.getByLabel('Centre Z (m)',{exact:true}).press('Tab');}
 await page.getByRole('button',{name:'Prévisualiser l’implantation',exact:true}).click();const commit=page.getByRole('button',{name:'Créer dans le monde',exact:true});await commit.waitFor();check(await commit.isEnabled(),pattern+' : aperçu adapté au site et accès validés');
 const canvas=page.getByLabel('Plan des villages et villes',{exact:true}),handles=JSON.parse(await canvas.getAttribute('data-handles'));check(handles.filter(h=>h.kind==='house').length>=10&&!handles.some(h=>h.kind==='module'),pattern+' : maisons éditables, sans poignées radiales trompeuses');await canvas.screenshot({path:out+'/'+pattern+'-preview.png'});
 await commit.click();await page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await waitForBrowserCondition(page,async pattern=>{const {ProjectStore}=await import('/little-world/src/studio-core/project-store.ts'),store=new ProjectStore(),summary=(await store.list())[0],p=(await store.loadProject(summary.projectId)).document;return Object.values(p.libraries.settlements??{}).some(s=>s.recipe.layout?.pattern===pattern);},pattern);
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter ZIP',exact:true}).click();const download=await downloadEvent,p=readProjectArchive(new Uint8Array(await readFile(await download.path()))),s=Object.values(p.libraries.settlements)[0];check(s.recipe.layout.pattern===pattern&&s.buildings.length>=10,pattern+' : organisation et bâtiments natifs conservés dans le ZIP');check(!Object.keys(p.libraries.paths).some(id=>id.includes('-street-ring-')),pattern+' : réseau distinct du plan concentrique');
 profiles.push({pattern,houses:s.buildings.length,paths:Object.keys(s.pathHashes).length,activity:s.recipe.activity});
 await page.reload();await page.getByRole('button',{name:'Reprendre un projet',exact:true}).click();await page.getByRole('button',{name:'Continuer',exact:true}).first().click();await page.getByRole('button',{name:'Modifier '+s.recipe.name,exact:true}).click();await page.getByRole('button',{name:'1. Type',exact:true}).click();check(await page.getByLabel('Organisation',{exact:true}).inputValue()===pattern,pattern+' : modèle restauré à la réouverture');
 await context.close();
}check(errors.length===0,errors.join('\n')||'Aucune erreur JavaScript');await writeFile(out+'/browser-report.json',JSON.stringify({checks,errors,profiles},null,2));console.log({checks,profiles});}finally{await browser.close();}
