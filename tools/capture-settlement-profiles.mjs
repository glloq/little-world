/** Captures the real Studio preview at the same scale and requested population. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.argv[2]??'/tmp/little-world-organic-settlements',base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const profiles=[];
try{for(const form of ['village','town','fortified']){
 const context=await browser.newContext({viewport:{width:1540,height:1080}}),page=await context.newPage();
 await page.goto(base+'studio/');
 await page.evaluate(async()=>{const {flatSettlementProject}=await import('/little-world/tools/settlement-fixture.mjs'),{ProjectStore}=await import('/little-world/src/studio-core/project-store.ts');await new ProjectStore().create(flatSettlementProject());});
 await page.reload();await page.getByRole('button',{name:'Reprendre un projet',exact:true}).click();await page.getByRole('button',{name:'Continuer',exact:true}).first().click();await page.locator('.viewport canvas').waitFor();await page.getByRole('button',{name:'Villages & villes',exact:true}).click();
 await page.getByLabel('Type d’implantation',{exact:true}).selectOption(form);await page.getByLabel('Point d’intérêt central',{exact:true}).selectOption('market');await page.getByRole('button',{name:'3. Personnalisation',exact:true}).click();await page.getByLabel('Taille',{exact:true}).selectOption('60');await page.getByRole('button',{name:'Prévisualiser l’implantation',exact:true}).click();
 const commit=page.getByRole('button',{name:'Créer dans le monde',exact:true});await commit.waitFor();assert.ok(await commit.isEnabled());
 const canvas=page.getByLabel('Plan des villages et villes',{exact:true}),handles=JSON.parse(await canvas.getAttribute('data-handles')),center=handles.find(h=>h.kind==='center'),houses=handles.filter(h=>h.kind==='house'),radii=houses.map(h=>Math.hypot(h.x-center.x,h.z-center.z));
 profiles.push({form,requested:60,houses:houses.length,meanRadius:radii.reduce((a,b)=>a+b,0)/radii.length,maxRadius:Math.max(...radii),view:JSON.parse(await canvas.getAttribute('data-view'))});
 await canvas.screenshot({path:out+'/'+form+'-preview.png'});await context.close();
}await writeFile(out+'/profiles-report.json',JSON.stringify(profiles,null,2));console.log(profiles);}finally{await browser.close();}
