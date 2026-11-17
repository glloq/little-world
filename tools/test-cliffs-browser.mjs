/** Functional/capture regression on the actual compiled reference world. */
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {readProjectArchive} from '../src/studio-core/archive.ts';
import {CLIFF_BUDGET} from '../src/render/cliff-view.ts';
const output=process.env.ARTIFACTS_DIR??'/tmp/little-world-cliffs';
// --check-report validates an existing capture report only; it does not render or test Studio.
if(!process.argv.includes('--check-report')){
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('studio/?testFixtures=1',process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/').href);
 await page.getByRole('button',{name:'Scène de référence Falaises',exact:true}).click();
 await page.waitForFunction(()=>{const c=document.querySelector('.viewport canvas');if(!c?.dataset.cliffs)return false;const s=JSON.parse(c.dataset.cliffs);return s.visible===s.available&&s.visible>0&&s.pending===0;},{},{timeout:60000});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter ZIP',exact:true}).click();
 const exported=await download,project=readProjectArchive(new Uint8Array(await readFile(await exported.path())));
 assert.equal(project.world.terrain.archipelago.features.filter(f=>f.id.startsWith('rl-cliff-')).length,5,'Studio export preserves the five editable cliffs');
 assert.deepEqual(errors,[]);
 console.log('Studio : ouverture, rendu des cinq zones et export ZIP vérifiés.');
}finally{await browser.close();}
const result=spawnSync(process.execPath,['tools/capture-world-views.mjs',process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',output,'tools/cliff-views.json'],{stdio:'inherit',env:{...process.env,VIEWS:'',CLEAN_CAPTURE:'1'}});
assert.equal(result.status,0,'Every capture must settle without loading/runtime errors');
}
const report=JSON.parse(await readFile(output+'/views-report.json','utf8'));
assert.equal(report.views.length,7);
for(const v of report.views){
 const c=v.metrics.cliffs;
 assert.ok(c&&c.available>0&&c.visible>0,v.name+': rock faces loaded');
 assert.equal(c.available,27,v.name+': all five authored cliffs are available');
 assert.ok(c.visible<=c.available);
 if(v.name==='cliffs-overview')assert.equal(c.available,c.visible,'overview retains all five zones');
 assert.equal(v.settled,true);assert.deepEqual(v.errors,[]);
 assert.equal(c.pending,0);
 assert.equal(c.visible,c.lod0+c.lod1);
 assert.ok(c.visible<=CLIFF_BUDGET.maxMeshes);
 assert.ok(c.triangles<=c.lod0*66+c.lod1*30,v.name+': integrated scree triangle budget');
 assert.ok(v.metrics.calls>0&&v.metrics.calls<=64,v.name+': whole-scene draw-call ceiling');
 assert.ok(v.metrics.triangles>0&&v.metrics.triangles<=60000,v.name+': whole-scene triangle ceiling');
}
assert.ok(report.views.find(v=>v.name==='cliffs-simple').metrics.cliffs.lod0>0,'near LOD exercised');
assert.ok(report.views.find(v=>v.name==='cliffs-lod').metrics.cliffs.lod1>0,'far LOD exercised');
console.log('Rapport vérifié : 7 vues, 5 zones en vue générale, budgets et LOD conformes. '+output);
