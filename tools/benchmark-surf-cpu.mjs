/** SURF CPU benchmark (Node, no browser, no GPU). Reproducible, comparable between commits.
 * Measures the pure surf engine on two terrains: an analytic shelf and the real generated
 * "Île des trois vagues" geography (zones A/B/C from the authoring planner).
 *
 *   node --experimental-strip-types --expose-gc tools/benchmark-surf-cpu.mjs [--out file.json] [--quick]
 *
 * Every timing is CPU wall time in Node/V8 on THIS machine: it is not a browser or GPU figure.
 * Allocation pressure is reported as V8 minor GC (scavenge) counts per 100 000 calls. */
import {writeFileSync} from 'node:fs';
import {PerformanceObserver,performance} from 'node:perf_hooks';
import {cpus,totalmem} from 'node:os';
import {execSync} from 'node:child_process';
import * as THREE from 'three';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {createSurfWaveField as createReferenceField} from '../tests/fixtures/surf/wave-field-v1.ts';
import {sampleSurfBarrel,stepSurfBarrel} from '../src/surf/surf-barrel.ts';
import {stepSurf} from '../src/surf/surf-controller.ts';
import {createSurfWaterView} from '../src/render/surf-water-view.ts';
import {createSurfBarrelView} from '../src/render/surf-barrel-view.ts';
import {createSurfWakeView} from '../src/render/surf-wake-view.ts';

const args=process.argv.slice(2);
const quick=args.includes('--quick');
const outIndex=args.indexOf('--out');
const out=outIndex>=0?args[outIndex+1]:null;
const BATCH=quick?100:250,BATCHES=quick?60:240;
let scavenges=0;
new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.detail?.kind===1||e.kind===1)scavenges++;})
 .observe({entryTypes:['gc']});
const pct=(v,p)=>v[Math.min(v.length-1,Math.floor(v.length*p))];
const round=(x,d=3)=>Math.round(x*10**d)/10**d;
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
/** Per-call microseconds over batches (timer overhead amortised). */
function timeCalls(name,count,fn){
 // Three rounds, keep the fastest median: JIT warm-up and machine noise only add time.
 let best=null;
 for(let round_=0;round_<3;round_++){
  const per=[];global.gc?.();const gc0=scavenges;let sink=0;
  for(let b=0;b<BATCHES;b++){
   const t=performance.now();
   for(let i=0;i<count;i++)sink+=fn(b*count+i)??0;
   per.push((performance.now()-t)*1000/count);
  }
  per.sort((a,b)=>a-b);
  const calls=BATCHES*count;
  const row={name,calls,p50Us:round(pct(per,.5)),p95Us:round(pct(per,.95)),
   scavengesPer100k:round((scavenges-gc0)*1e5/calls,2),sink:Number.isFinite(sink)?1:0};
  if(!best||row.p50Us<best.p50Us)best=row;
 }
 return best;
}
function timeEach(name,iterations,fn){
 const per=[];global.gc?.();const gc0=scavenges;
 for(let i=0;i<iterations;i++){const t=performance.now();fn(i);per.push(performance.now()-t);}
 per.sort((a,b)=>a-b);
 return {name,iterations,p50Ms:round(pct(per,.5),4),p95Ms:round(pct(per,.95),4),
  maxMs:round(per.at(-1),4),scavenges:scavenges-gc0};
}
function zonePoints(zone,ground,n,seed){
 const r=lcg(seed),pts=[];let guard=0;
 while(pts.length<n&&guard++<n*40){
  const x=zone.minX+(zone.maxX-zone.minX)*r(),z=zone.minZ+(zone.maxZ-zone.minZ)*r();
  if(zone.seaLevel-ground(x,z)>.1)pts.push([x,z]);
 }
 return pts;
}
function countGround(ground){const c={n:0};return {c,ground:(x,z)=>{c.n++;return ground(x,z);}};}
function benchZone(label,zone,ground){
 const field=createSurfWaveField(zone,ground),reference=createReferenceField(zone,ground);
 const pts=zonePoints(zone,ground,512,zone.seed+7),P=pts.length;
 const tickOf=i=>(i*7)%9000;
 const rows=[];
 rows.push(timeCalls('sample',BATCH,i=>{const p=pts[i%P];return field.sample(p[0],p[1],tickOf(i))?.height;}));
 rows.push(timeCalls('sample.v1-reference',BATCH,i=>{const p=pts[i%P];return reference.sample(p[0],p[1],tickOf(i))?.height;}));
 rows.push(timeCalls('height',BATCH,i=>{const p=pts[i%P];return field.height(p[0],p[1],tickOf(i));}));
 rows.push(timeCalls('height.v1-reference',BATCH,i=>{const p=pts[i%P];return reference.height(p[0],p[1],tickOf(i));}));
 rows.push(timeCalls('ground',BATCH,i=>{const p=pts[i%P];return ground(p[0],p[1]);}));
 if(zone.barrelStrength)rows.push(timeCalls('sampleSurfBarrel',BATCH,i=>{const p=pts[i%P];return sampleSurfBarrel(field,ground,p[0],p[1],tickOf(i))?.clearance;}));
 // Ground samples consumed per call (exact count, separate pass).
 const counted=countGround(ground),cf=createSurfWaveField(zone,counted.ground);
 const refCounted=countGround(ground),rf=createReferenceField(zone,refCounted.ground);
 for(let i=0;i<P;i++){cf.sample(pts[i][0],pts[i][1],i);rf.sample(pts[i][0],pts[i][1],i);}
 // Fixed-tick rider: stepSurf + tube rules, 30 Hz, scripted carving input.
 const start=pts[0];
 const rider={position:{x:start[0],y:zone.seaLevel,z:start[1]},velocity:{x:zone.dirX*6,y:0,z:zone.dirZ*6},
  mode:'surf',surfStage:'ride',surfHeading:Math.atan2(zone.dirX,zone.dirZ)};
 let tick=0;
 const physics=timeEach('physicsTick(stepSurf+stepSurfBarrel)',quick?600:3000,i=>{
  if(rider.mode!=='surf'||i%300===0){rider.position.x=start[0];rider.position.z=start[1];
   rider.velocity.x=zone.dirX*6;rider.velocity.z=zone.dirZ*6;rider.mode='surf';rider.surfStage='ride';rider.surfAirborne=false;}
  stepSurf(rider,{forward:.6,right:Math.sin(i/25),cameraYaw:0,paddle:true,jumpPressed:false,brake:false,pump:true},field,++tick,1/30);
  stepSurfBarrel(rider,field,ground,tick);
 });
 // Render-side CPU (Three.js objects only, no WebGL): water LOD bake and tube rebuild.
 const root=new THREE.Group();
 const t0=performance.now(),water=createSurfWaterView(root,field,ground),bakeMs=performance.now()-t0;
 const tiers=[0,1,2].map(level=>{water.setDetail(level,{x:(zone.minX+zone.maxX)/2,z:(zone.minZ+zone.maxZ)/2});
  return {tier:water.stats.tier,vertices:water.stats.vertices,triangles:water.stats.triangles};});
 let tube=null;
 if(zone.barrelStrength){
  const t1=performance.now(),view=createSurfBarrelView(root,field,ground),tubeCreateMs=performance.now()-t1;
  const focus={x:(zone.minX+zone.maxX)/2,z:(zone.minZ+zone.maxZ)/2};
  const update=timeEach('tubeUpdate',quick?300:1500,i=>view.update(i+1,focus));
  tube={createMs:round(tubeCreateMs,3),update,stats:{...view.stats}};
  view.dispose();
 }
 // Wake presentation for a carving rider (per frame at 60 Hz: two frames per tick).
 const wake=createSurfWakeView(root),wr={position:{x:start[0],y:zone.seaLevel,z:start[1]},velocity:{x:0,y:0,z:8},
  mode:'surf',surfStage:'ride',surfHeading:0};
 const wakeFrame=timeEach('wakeFrame',quick?600:3000,i=>{
  const tick=1+(i>>1);if(i%2===0){wr.surfHeading=Math.sin(tick/9)*.9;wr.position.x+=Math.sin(wr.surfHeading)*8/30;wr.position.z+=Math.cos(wr.surfHeading)*8/30;
   if(i%600===0){wr.position.x=start[0];wr.position.z=start[1];}}
  wake.update(wr,field,tick,wr.position,(i%2)*.5+.5);
 });
 wake.dispose();
 water.dispose();
 // Deterministic checksum: identical inputs must give identical sums on every machine.
 let checksum=0,referenceChecksum=0,maxDiff=0;
 for(let i=0;i<P;i++)for(const t of [0,17,900,5_000_000]){
  const a=field.sample(pts[i][0],pts[i][1],t),b=reference.sample(pts[i][0],pts[i][1],t);
  checksum+=a.height+a.gradientX+a.gradientZ;referenceChecksum+=b.height+b.gradientX+b.gradientZ;
  maxDiff=Math.max(maxDiff,Math.abs(a.height-b.height),Math.abs(a.gradientX-b.gradientX),Math.abs(a.gradientZ-b.gradientZ));
 }
 return {label,zone:{id:zone.id,amplitude:zone.amplitude,wavelength:zone.wavelength,speed:zone.speed,
   barrelStrength:zone.barrelStrength??0,areaM2:Math.round((zone.maxX-zone.minX)*(zone.maxZ-zone.minZ))},
  points:P,groundCallsPerSample:round(counted.c.n/P,2),groundCallsPerSampleV1:round(refCounted.c.n/P,2),
  calls:rows,physics,water:{bakeMs:round(bakeMs,2),tiers},tube,wake:wakeFrame,
  determinism:{checksum:round(checksum,6),referenceChecksum:round(referenceChecksum,6),maxAbsDiffVsV1:maxDiff}};
}
const shelfZone={id:'surf:bench-shelf',minX:-90,maxX:90,minZ:-120,maxZ:60,dirX:0,dirZ:1,seaLevel:0,
 amplitude:1.45,wavelength:36,speed:6.3,seed:42877,shoreFadeDepth:3,edgeFade:12,barrelStrength:1};
const shelf=(x,z)=>-9+Math.max(0,z+120)*.07+Math.sin(x*.05)*.4;
const scenarios=[benchZone('analytic-shelf',shelfZone,shelf)];
let islandError=null;
try{
 const {buildSurfIsland}=await import('./generate-surf-island.mjs');
 const {projectRaceTerrainEnvironment}=await import('../src/studio-core/race-terrain-context.ts');
 const {project}=buildSurfIsland();
 const env=projectRaceTerrainEnvironment(project);
 for(const zone of Object.values(project.libraries.surfZones??{}))
  scenarios.push(benchZone('surf-island '+zone.id,zone,env.height));
}catch(e){islandError=String(e?.stack??e);}
let commit='unknown';try{commit=execSync('git rev-parse --short HEAD').toString().trim();}catch{}
const report={schemaVersion:2,kind:'surf-cpu-benchmark',commit,date:new Date().toISOString(),
 node:process.version,cpu:cpus()[0]?.model??'unknown',cores:cpus().length,ramGiB:round(totalmem()/2**30,1),
 gcExposed:typeof global.gc==='function',quick,
 note:'Node/V8 CPU only. Not a browser frame time and never a GPU time.',
 islandError,scenarios};
if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
const brief=scenarios.map(s=>({scenario:s.label,groundPerSample:s.groundCallsPerSample,groundPerSampleV1:s.groundCallsPerSampleV1,
 ...Object.fromEntries(s.calls.map(c=>[c.name+'.p50Us',c.p50Us])),
 physicsP95Ms:s.physics.p95Ms,tubeP95Ms:s.tube?.update.p95Ms??null,tubeScavenges:s.tube?.update.scavenges??null,
 wakeP95Ms:s.wake?.p95Ms??null,waterBakeMs:s.water.bakeMs,maxDiffVsV1:s.determinism.maxAbsDiffVsV1}));
console.log(JSON.stringify({commit,cpu:report.cpu,islandError,brief},null,1));
