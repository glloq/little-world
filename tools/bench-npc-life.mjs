/** CPU-only repeatable microbenchmark for NPC Life.
 * No GPU or browser results are inferred from this report. Run:
 * node --experimental-strip-types tools/bench-npc-life.mjs
 */
import {performance} from 'node:perf_hooks';
import {createResidentRouter} from '../src/npc-life/routes.ts';
import {residentPoseAt} from '../src/npc-life/schedule.ts';
import {residentSocialPairs} from '../src/npc-life/social.ts';
import {selectNPCRigs} from '../src/npc-life/rig-budget.ts';

const paths=Array.from({length:12},(_,i)=>({
 points:[{x:i*8,z:0},{x:i*8,z:100}],
}));
paths.push({points:[{x:0,z:50},{x:88,z:50}]});
const router=createResidentRouter(paths,()=>true);
const measure=(name,iterations,operation)=>{
 const start=performance.now();
 for(let i=0;i<iterations;i++)operation(i);
 const elapsed=performance.now()-start;
 return {name,iterations,ms:Number(elapsed.toFixed(3)),
  meanMs:Number((elapsed/iterations).toFixed(5))};
};
const resident={type:'Resident',version:1,role:'merchant',
 home:{x:0,z:0},work:{x:0,z:80}};
const route=router.route(resident.home,resident.work);
if(!route)throw Error('Benchmark fixture disconnected');
const samples=[10,40,100].map(count=>{
 const candidates=Array.from({length:count},(_,i)=>({
  id:'resident:'+i,x:(i%10)*2,z:Math.floor(i/10)*3,
  role:'villager',phase:'activity',kind:'social',busy:false,
 }));
 const rigs=candidates.map(c=>({...c,kind:'hamster'}));
 const results=[
  measure('analytic-schedule',2000,step=>{
   for(let i=0;i<count;i++)residentPoseAt(resident,route,step*.2+i*.1,1200,.36,1.1);
  }),
  measure('social-pairs',1000,()=>residentSocialPairs(candidates,5.5,12)),
  measure('rig-selection',1000,()=>selectNPCRigs(rigs,{x:0,z:0},12)),
 ];
 return {npcs:count,results};
});
const report={kind:'npc-life-cpu-microbenchmark',graphNodes:router.nodes,
 platform:process.platform,node:process.version,heapUsed:process.memoryUsage().heapUsed,samples};
console.log(JSON.stringify(report,null,2));
