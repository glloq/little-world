#!/usr/bin/env node
/** SKY-0/4 A/B route benchmark: identical scene and settings, only the sky mode changes.
 * Runs SwiftShader by default: useful for regressions but NOT hardware GPU qualification.
 * Usage: node tools/benchmark-sky.mjs [base-url] [output-dir]
 * Optional: BENCHMARK_SCENARIOS=valley-start
 */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

const base=process.argv[2]??'http://127.0.0.1:5173/little-world/';
const output=resolve(process.argv[3]??'../little-world-artifacts/sky');
const modes=['off','sun','2d'];
await mkdir(output,{recursive:true});
const results={createdAt:new Date().toISOString(),modes:{},notes:[
  'Only sky mode changes between separate runs. Fixed scenario, viewport, quality and seed are controlled by benchmark-route.mjs.',
  'SwiftShader results are software rendering regression signals, NOT integrated GPU qualification.',
  'CPU renderSubmitMs is NOT GPU elapsed time. Differences are indicative; repeat runs on physical target devices.',
]};
for(const mode of modes){
  const folder=join(output,mode);
  const extra=new URLSearchParams(process.env.BENCHMARK_EXTRA_QUERY??'');
  extra.set('sky',mode);
  const run=spawnSync(process.execPath,['tools/benchmark-route.mjs',base,folder],{
    stdio:'inherit',env:{...process.env,BENCHMARK_EXTRA_QUERY:extra.toString()},
  });
  if(run.error)throw run.error;
  if(run.status!==0)throw new Error(`Route benchmark failed for sky=${mode} (exit ${run.status})`);
  const record=JSON.parse(await readFile(join(folder,'results.json'),'utf8'));
  results.modes[mode]=record.scenarios.map(s=>({name:s.name,overall:s.overall,byPhase:s.byPhase,drawCallsMean:s.drawCallsMean,
    drawCallsMax:s.drawCallsMax,trianglesMean:s.trianglesMean,renderSubmitMsMean:s.renderSubmitMsMean,errors:s.errors}));
}
const baseline=new Map(results.modes.off.map(s=>[s.name,s]));
results.comparison={};
for(const mode of modes.slice(1)){
  results.comparison[mode]=results.modes[mode].map(s=>{
    const b=baseline.get(s.name);
    if(!b)return {name:s.name,error:'missing identical baseline scenario'};
    return {name:s.name,
      deltaP95Ms:s.overall.p95Ms-b.overall.p95Ms,
      deltaP99Ms:s.overall.p99Ms-b.overall.p99Ms,
      deltaCalls:s.drawCallsMean-b.drawCallsMean,
      deltaRenderSubmitMs:s.renderSubmitMsMean-b.renderSubmitMsMean,
      errors:s.errors};
  });
}
await writeFile(join(output,'sky-comparison.json'),JSON.stringify(results,null,2)+'\n');
console.log('Sky A/B comparison: '+join(output,'sky-comparison.json'));
