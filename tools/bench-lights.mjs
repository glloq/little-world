/** E10 — CPU benchmark of light selection (LightBudget), Node, no GPU.
 * Scenarios: 0/20/100/500 sources × clustered village / dispersed × day / night × static /
 * moving camera, 3 600 frames (2 min at 30 FPS). Measures per-frame update time (p50/p95/max),
 * re-selections, halo rebuilds, dynamic lights and heap growth (allocations per frame).
 * Usage: node --expose-gc tools/bench-lights.mjs [--json] */
import {LightBudget} from '../src/lighting/light-budget.ts';
import {benchLights} from '../src/lighting/light-bench.ts';
import {flickerAt} from '../src/lighting/light-data.ts';

const FRAMES=3600,height=(x,z)=>Math.sin(x*.01)*4+Math.cos(z*.013)*3,pct=(v,p)=>v[Math.min(v.length-1,Math.floor(v.length*p))];
const rows=[];
for(const count of [0,20,100,500,2000])for(const layout of ['cluster','spread'])for(const night of [0,1])for(const moving of [false,true]){
  if(count===2000&&(night===0||layout==='spread'))continue; // stress row: night, village only
  const budget=new LightBudget({capacity:4});budget.setSources(benchLights(count,layout,0,0),height);
  const times=new Float64Array(FRAMES);let maxActive=0;
  for(let f=0;f<60;f++)budget.update(0,10,0,night,f/30); // warm-up (JIT)
  globalThis.gc?.();const heap0=process.memoryUsage().heapUsed;
  for(let f=0;f<FRAMES;f++){
    // Moving: walking pace 1.4 m/s through the village and beyond, with a lateral sway.
    const t=f/30,x=moving?Math.sin(t*.2)*60:0,z=moving?t*1.4-60:0,start=performance.now();
    budget.update(x,height(x,z)+8,z,night,2+t);
    for(let s=0;s<4;s++){const i=budget.slots[s];if(i>=0){const l=budget.sources[i];if(l.flicker)flickerAt(budget.seeds[i],t,l.flicker.amplitude,l.flicker.speed);}}
    times[f]=performance.now()-start;let a=0;for(let s=0;s<4;s++)if(budget.slots[s]>=0)a++;maxActive=Math.max(maxActive,a);
  }
  const heap=process.memoryUsage().heapUsed-heap0,sorted=[...times].sort((a,b)=>a-b);
  rows.push({sources:count,layout,night:!!night,camera:moving?'moving':'static',p50Us:+(pct(sorted,.5)*1000).toFixed(2),p95Us:+(pct(sorted,.95)*1000).toFixed(2),maxUs:+(sorted.at(-1)*1000).toFixed(1),
    reselections:budget.stats.reselections,glowRebuilds:budget.stats.glowRebuilds,maxDynamic:maxActive,halos:budget.stats.glow,overBudget:budget.stats.overBudget,heapKiBPerFrame:+(heap/1024/FRAMES).toFixed(3)});
}
if(process.argv.includes('--json'))console.log(JSON.stringify(rows,null,1));
else{console.log('sources | layout  | nuit | caméra  | p50 µs | p95 µs | max µs | resel. | halos rebuild | dyn max | halos | hors budget | heap Kio/frame');
  for(const r of rows)console.log([r.sources,r.layout.padEnd(7),r.night?'oui':'non',r.camera.padEnd(7),r.p50Us,r.p95Us,r.maxUs,r.reselections,r.glowRebuilds,r.maxDynamic,r.halos,r.overBudget,r.heapKiBPerFrame].join(' | '));}
