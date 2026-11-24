#!/usr/bin/env node
/** OPT suite report: Markdown tables from results.json of tools/perf/opt-suite.mjs.
 *   node tools/perf/report.mjs A/results.json             → baseline table + A/A noise
 *   node tools/perf/report.mjs A/results.json B/results.json → A/B table + gate verdict
 * Gate (docs/perf/PLAN-OPTIMISATION.md §2): a metric changes when |B−A| exceeds
 * max(2 × A/A noise, 5 %) of A; lower is better for every metric listed here. */
import {readFile} from 'node:fs/promises';
const [fa,fb]=process.argv.slice(2);if(!fa)throw Error('usage: report.mjs A/results.json [B/results.json]');
const A=JSON.parse(await readFile(fa,'utf8')),B=fb?JSON.parse(await readFile(fb,'utf8')):null;
export const METRICS=[
  ['p50 ms',s=>s.overall.p50Ms],['p95 ms',s=>s.overall.p95Ms],['p99 ms',s=>s.overall.p99Ms],['>100 ms %',s=>100*s.overall.over100Ms/Math.max(1,s.overall.frames)],
  ['update p50',s=>s.cpu.updateMs.p50],['update p95',s=>s.cpu.updateMs.p95],['update p99',s=>s.cpu.updateMs.p99],
  ['submit p95',s=>s.cpu.submitMs.p95],['sim p95',s=>s.cpu.simulationMs.p95],['GPU p95',s=>s.gpu.available?s.gpu.ms.p95:null],
  ['upload KB/s',s=>s.uploadBytesPerSecond/1024],['alloc MB/s',s=>s.heap.allocMBps],['heap end MB',s=>s.heap.endMB],
  ['long tasks',s=>s.longTasks.count/Math.max(1,s.overall.frames)*100],['calls',s=>s.drawCalls.mean],['tris k',s=>s.triangles.mean/1000],
];
const f=v=>v===null||v===undefined||!Number.isFinite(v)?'—':Math.abs(v)>=100?v.toFixed(0):Math.abs(v)>=10?v.toFixed(1):v.toFixed(2);
const byScene=run=>{const m=new Map();for(const s of run.scenes){if(!m.has(s.name))m.set(s.name,[]);m.get(s.name).push(s);}return m;};
const mean=a=>{const v=a.filter(Number.isFinite);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
/** Relative half-spread between repeats of the same run (A/A noise), as a fraction. */
const noise=list=>{const v=list.filter(Number.isFinite);if(v.length<2)return null;const m=mean(v);return m?(Math.max(...v)-Math.min(...v))/2/Math.abs(m):0;};
function header(run){return `${run.buildLabel?'Build '+run.buildLabel+' ; outils ':''}Révision \`${run.revision?.slice(0,8)}\` (${run.branch}), ${run.recordedAt.slice(0,10)}, ${run.browserVersion}, ${run.scenes[0]?.gpuRenderer?.renderer??'?'}, ${run.viewport.width}×${run.viewport.height} DPR ${run.deviceScaleFactor}, qualité ${run.quality}, renderTier ${run.renderTier}, ${run.ticksPerScene} ticks/scène, ${run.repeat} répétition(s), ${run.machine.cpus} CPU ${run.machine.cpuModel}, ${run.machine.totalMemGB} Go.`;}
const out=[];
if(!B){
  out.push(header(A),'');
  out.push('| Scène | '+METRICS.map(m=>m[0]).join(' | ')+' |','|'+' --- |'.repeat(METRICS.length+1));
  for(const [name,list] of byScene(A)){
    out.push(`| ${name} | `+METRICS.map(([,g])=>{const v=list.map(g),n=noise(v);return f(mean(v))+(n===null?'':` ±${(n*100).toFixed(0)}%`);}).join(' | ')+' |');
  }
  out.push('','`±x%` = demi-écart relatif entre répétitions (bruit A/A).');
}else{
  out.push('**A** : '+header(A),'','**B** : '+header(B),'');
  const sa=byScene(A),sb=byScene(B);let better=0,worse=0;
  out.push('| Scène | Métrique | A | B | Δ | bruit A/A | verdict |','| --- | --- | --- | --- | --- | --- | --- |');
  for(const [name,la] of sa){const lb=sb.get(name);if(!lb)continue;
    for(const [label,g] of METRICS){const va=mean(la.map(g)),vb=mean(lb.map(g));if(va===null||vb===null)continue;
      const n=noise(la.map(g))??0,thr=Math.max(2*n,.05),d=va?(vb-va)/Math.abs(va):0,verdict=Math.abs(d)<=thr?'=':d<0?'**mieux**':'**pire**';
      if(verdict.includes('mieux'))better++;else if(verdict.includes('pire'))worse++;
      out.push(`| ${name} | ${label} | ${f(va)} | ${f(vb)} | ${(d*100).toFixed(1)} % | ${(n*100).toFixed(1)} % | ${verdict} |`);}}
  out.push('',`Synthèse : ${better} métrique(s) meilleure(s), ${worse} pire(s) au-delà du seuil max(2×bruit, 5 %).`);
}
const t=A.travel;if(t&&!B){out.push('','**Traversées A→B→A** ('+t.cycles+' cycles, '+t.hops.length+' chargements) : île volcan prête en '+f(t.island.readyMs.p50/1000)+' s (p50, max '+f(t.island.readyMs.max/1000)+' s), val forestier '+f(t.other.readyMs.p50/1000)+' s ; heap JS à l’arrivée volcan p50 '+f(t.island.heapMB.p50)+' Mo ; RSS navigateur '+f(t.hops[0].rssMB)+' → '+f(t.hops.at(-1).rssMB)+' Mo (pente '+f(t.rssSlopeMBPerCycle)+' Mo/cycle).');}
console.log(out.join('\n'));
