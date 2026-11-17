/** Composed source matrix and previews from the actual generator, without official map writes. */
import {composeWorld} from '../src/studio-core/world-composition.ts';import {DEFAULT_MAP_REQUIREMENTS} from '../src/studio-core/map-requirements.ts';import {selectIslandStyle} from '../src/studio-core/island-styles.ts';import {DEFAULT_LAYOUT} from '../src/studio-core/terrain-sites.ts';import {validateTerrainAccess} from '../src/studio-core/terrain-access.ts';import {simpleOutline} from '../src/studio-core/composition-draft.ts';import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {existsSync} from 'node:fs';import {chromium} from 'playwright';
const output=process.argv[2]??'/tmp/little-world-composed';await mkdir(output,{recursive:true});const count=Number(process.env.COMPOSED_SEEDS??30),rows=[];
for(const silhouette of ['crescent','turtle'])for(let i=0;i<count;i++){
 const r=selectIslandStyle(DEFAULT_MAP_REQUIREMENTS,i%3===2?'central-massif':'gentle');r.compositionVersion=5;r.seed=4242+i*7919;r.islandStyle.silhouette=silhouette;r.layout={...DEFAULT_LAYOUT,harbor:true,farms:2,lake:true};
 if(i){[r.width,r.length]=[[1200,800],[4000,3000],[6000,2500]][i%3];r.islandStyle.orientation=[0,35,90][i%3];}
 const plan=composeWorld(r),p=plan.project,sites=Object.values(p.libraries.terrainPlans??{}).flatMap(p=>p.sites),paths=Object.values(p.libraries.paths),access=validateTerrainAccess(p);
 rows.push({silhouette,seed:r.seed,requirements:r,ready:plan.ready,signature:fingerprint(p.world.terrain),diagnostics:plan.diagnostics.map(d=>d.code),simpleOutline:p.world.terrain.archipelago.landmasses.every(l=>simpleOutline(l.outline)),sites:sites.map(s=>s.kind),paths:paths.length,invalidPaths:access.filter(d=>d.code==='SITE_ACCESS_INVALID').length,acceptedInvalidPaths:access.filter(d=>d.code==='SITE_ACCESS_INVALID'&&p.libraries.paths[d.targetId]).length,otherSiteWarnings:access.filter(d=>d.code!=='SITE_ACCESS_INVALID').map(d=>d.code),...plan.metrics});
 if(i===count-1)console.log(silhouette,'done',rows.filter(r=>r.silhouette===silhouette&&r.ready).length+'/'+count);
}
const times=rows.map(r=>r.generationMs).sort((a,b)=>a-b),summary={maps:rows.length,ready:rows.filter(r=>r.ready).length,unique:new Set(rows.map(r=>r.signature)).size,simpleOutlines:rows.filter(r=>r.simpleOutline).length,fullLayouts:rows.filter(r=>r.sites.length===4).length,fullAndConnected:rows.filter(r=>r.sites.length===4&&!r.invalidPaths).length,totalPaths:rows.reduce((n,r)=>n+r.paths,0),acceptedInvalidPaths:rows.reduce((n,r)=>n+r.acceptedInvalidPaths,0),layoutsWithMissingAccess:rows.filter(r=>r.invalidPaths).length,maxFeatures:Math.max(...rows.map(r=>r.features)),maxSourceBytes:Math.max(...rows.map(r=>r.sourceBytes)),generationMs:{p50:times[Math.floor(times.length/2)],max:times.at(-1)}};
await writeFile(join(output,'report.json'),JSON.stringify({summary,rows},null,2));console.log(summary);if(summary.ready!==summary.maps||summary.simpleOutlines!==summary.maps)process.exitCode=1;

const browser=await chromium.launch({headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage();await page.goto((process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/')+'studio/');
 for(const row of rows.filter(r=>r.seed===4242||r.seed===12161)){
  const png=await page.evaluate(async r=>{const {composeWorld}=await import('/little-world/src/studio-core/world-composition.ts'),{drawWelcomePreview}=await import('/little-world/src/studio/home-welcome.ts'),p=composeWorld(r).project,canvas=document.createElement('canvas');canvas.width=850;canvas.height=590;drawWelcomePreview(canvas,p);return canvas.toDataURL().split(',')[1];},row.requirements);
  await writeFile(join(output,row.silhouette+'-'+row.seed+'.png'),Buffer.from(png,'base64'));
 }
}finally{await browser.close();}
