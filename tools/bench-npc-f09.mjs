/** F09-F — deterministic CPU-only benchmark for worker schedule and bounded
 * storage/quota updates. Does not claim browser/GPU frame-rate validation.
 * node --experimental-strip-types tools/bench-npc-f09.mjs
 */
import {performance} from 'node:perf_hooks';
import {createNpcHarvestAccount} from '../src/npc-life/harvest-ledger.ts';
import {createFishPopulation} from '../src/npc-life/fish-population.ts';
function measure(count){
 const workers=Array.from({length:count},(_,n)=>createNpcHarvestAccount(
  'worker:'+n,'job:'+n,n%3===0?'farmer':n%3===1?'fisher':'woodcutter',
  {'farm:wheat':999,'wood:log':999,'fish:trout':999}));
 const fish=createFishPopulation();
 const before=performance.now();
 let commits=0;
 for(let minute=0;minute<1440;minute+=5){
  for(let i=0;i<workers.length;i++){
   const worker=workers[i],item=worker.role==='farmer'?'farm:wheat':
    worker.role==='fisher'?'fish:trout':'wood:log';
   const id='receipt:'+minute;
   if(worker.role==='fisher'){
    if(minute%15!==0)continue;
    if(fish.catch('river','fish:trout',i*64,12,minute,()=>
      worker.commitHarvest(id,item,1,minute)))commits++;
   }else if(worker.commitHarvest(id,item,1,minute))commits++;
  }
 }
 return {workers:count,minutesSimulated:1440,commits,
  elapsedMs:+(performance.now()-before).toFixed(3),
  accounts:workers.length,fishRegions:Object.keys(fish.serialize().regions).length};
}
console.log(JSON.stringify({kind:'npc-f09-cpu-only',
 node:process.version,samples:[10,40,100].map(measure)},null,2));
