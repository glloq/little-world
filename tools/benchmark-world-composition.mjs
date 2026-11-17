/** Reproducible authoring benchmark. No writes to official maps or runtime assets. */
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {DEFAULT_MAP_REQUIREMENTS} from '../src/studio-core/map-requirements.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const output=process.argv[2]??'/tmp/little-world-composition-benchmark';await mkdir(output,{recursive:true});
const rows=[];
for(let i=0;i<30;i++){
 const seed=101+i*7919,requirements={...structuredClone(DEFAULT_MAP_REQUIREMENTS),seed,terraces:3+i%4,cliffs:[.1,.4,.8][i%3],relief:['gentle','balanced','rugged'][i%3],type:i%3===0?'archipelago':'island',lakes:i%3===2};
 if(i%3===2)requirements.landscapes.push({kind:'volcanic',required:true});
 const before=process.memoryUsage().heapUsed,plan=composeWorld(requirements);
 rows.push({seed,requirements,family:plan.family,ready:plan.ready,diagnostics:plan.diagnostics.map(d=>d.code),...plan.metrics,heapDeltaBytes:process.memoryUsage().heapUsed-before,signature:fingerprint(plan.project.world.terrain),tributaries:Object.values(plan.project.libraries.water).filter(w=>w.to?.kind==='river').length,waterfalls:Object.values(plan.project.libraries.water).reduce((n,w)=>n+(w.falls?.length??0),0)});
}
const browser=await chromium.launch({headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}});await page.goto((process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/')+'studio/');
 for(const [index,row]of rows.entries()){
  const result=await page.evaluate(async requirements=>{
   const {composeWorld}=await import('/little-world/src/studio-core/world-composition.ts');
   const {drawWelcomePreview}=await import('/little-world/src/studio/home-welcome.ts');
   const plan=composeWorld(requirements),canvas=document.createElement('canvas');canvas.width=600;canvas.height=420;
   const before=performance.now();drawWelcomePreview(canvas,plan.project);const previewMs=performance.now()-before;
   return {previewMs,png:canvas.toDataURL('image/png').split(',')[1]};
  },row.requirements);
  row.previewMs=result.previewMs;
  if(index<6)await writeFile(join(output,'seed-'+row.seed+'.png'),Buffer.from(result.png,'base64'));
 }
}finally{await browser.close();}
const sorted=key=>rows.map(r=>r[key]).sort((a,b)=>a-b),gen=sorted('generationMs'),preview=sorted('previewMs');
const summary={node:process.version,seeds:rows.length,ready:rows.filter(r=>r.ready).length,unique: new Set(rows.map(r=>r.signature)).size,generationMs:{p50:gen[15],max:gen.at(-1)},previewMs:{p50:preview[15],max:preview.at(-1)},minTributaries:Math.min(...rows.map(r=>r.tributaries)),minWaterfalls:Math.min(...rows.map(r=>r.waterfalls)),maxFeatures:Math.max(...rows.map(r=>r.features)),maxSectors:Math.max(...rows.map(r=>r.sectors)),maxSourceBytes:Math.max(...rows.map(r=>r.sourceBytes)),...(rows.every(r=>r.coverage)?{minBiomeCoverage:Math.min(...rows.map(r=>r.coverage.biomeCoverage)),minOffRiverBiomeCoverage:Math.min(...rows.map(r=>r.coverage.offRiverBiomeCoverage)),minTerracedLandShare:Math.min(...rows.map(r=>r.coverage.terracedLandShare)),interiorSubseaSamples:rows.reduce((n,r)=>n+r.coverage.interiorSubseaSamples,0)}:{}),memoryNote:'heapDeltaBytes is observed JS heap delta, includes GC noise; sourceBytes measures serialized V3 sources, not GPU memory.'};
await writeFile(join(output,'report.json'),JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary,null,2));
if(summary.ready!==rows.length)process.exitCode=1;
