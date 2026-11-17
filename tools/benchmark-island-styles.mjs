/** Style matrix and actual generated previews. Never writes official maps. */
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {DEFAULT_MAP_REQUIREMENTS} from '../src/studio-core/map-requirements.ts';
import {ISLAND_STYLES,selectIslandStyle} from '../src/studio-core/island-styles.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';
const output=process.argv[2]??'/tmp/little-world-island-styles';await mkdir(output,{recursive:true});
const count=Number(process.env.STYLE_SEEDS??30),rows=[];
for(const model of Object.keys(ISLAND_STYLES)){
 for(let i=0;i<count;i++){
  const r=selectIslandStyle(DEFAULT_MAP_REQUIREMENTS,model);r.seed=4242+i*7919;
  if(i){[r.width,r.length]=[[1200,800],[4000,3000],[6000,2500]][i%3];r.islandStyle.orientation=[0,35,90][i%3];r.islandStyle.altitudeM=Math.round(ISLAND_STYLES[model].altitude*[.7,1,1.25][i%3]);}
  const plan=composeWorld(r),p=plan.project,waters=Object.values(p.libraries.water),compiled=compileWaterNetwork(waters,projectGeography(p).source,0);
  rows.push({model,seed:r.seed,requirements:r,ready:plan.ready,signature:fingerprint(p.world.terrain),diagnostics:plan.diagnostics.map(d=>d.code),generationMs:plan.metrics.generationMs,features:plan.metrics.features,sectors:plan.metrics.sectors,sourceBytes:plan.metrics.sourceBytes,coverage:plan.metrics.coverage,...plan.metrics.natural,
   rivers:waters.filter(w=>w.to?.kind==='sea').length,tributaries:waters.filter(w=>w.to?.kind==='river').length,invalidWater:compiled.filter(w=>w.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE')).length});
 }
 console.log(model,rows.filter(r=>r.model===model&&r.ready).length+'/'+count);
}
const browser=await chromium.launch({headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.goto((process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/')+'studio/');
 for(const row of rows.filter(r=>r.seed===4242)){
  const captures=await page.evaluate(async r=>{
   const {composeWorld}=await import('/little-world/src/studio-core/world-composition.ts'),{drawWelcomePreview,drawReliefSections}=await import('/little-world/src/studio/home-welcome.ts');
   const p=composeWorld(r).project,canvas=document.createElement('canvas');canvas.width=720;canvas.height=520;const result={};
   for(const mode of ['biomes','altitude','slope']){drawWelcomePreview(canvas,p,mode);result[mode]=canvas.toDataURL().split(',')[1];}
   canvas.height=145;drawReliefSections(canvas,p);result.sections=canvas.toDataURL().split(',')[1];return result;
  },row.requirements);
  for(const [view,png]of Object.entries(captures))await writeFile(join(output,row.model+'-'+view+'.png'),Buffer.from(png,'base64'));
 }
}finally{await browser.close();}
const summary={maps:rows.length,ready:rows.filter(r=>r.ready).length,unique:new Set(rows.map(r=>r.signature)).size,invalidWater:rows.reduce((n,r)=>n+r.invalidWater,0),riverless:rows.filter(r=>!r.rivers).length,maxFeatures:Math.max(...rows.map(r=>r.features)),maxSourceBytes:Math.max(...rows.map(r=>r.sourceBytes)),generationMs:{p50:rows.map(r=>r.generationMs).sort((a,b)=>a-b)[Math.floor(rows.length/2)],max:Math.max(...rows.map(r=>r.generationMs))},minBiomeCoverage:Math.min(...rows.map(r=>r.coverage.biomeCoverage))};
await writeFile(join(output,'report.json'),JSON.stringify({summary,rows},null,2));console.log(summary);
if(summary.ready!==rows.length||summary.invalidWater)process.exitCode=1;
