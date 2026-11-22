/** Read-only road audit of the shipped worlds: metres under water, steep, tilted, climbing the
 * fall line, and how every stream is crossed. `--json` prints the full report, `--worst N` lists
 * the N worst paths per world; a `.json` argument audits that project file. Never writes sources or maps. */
import {readFile} from 'node:fs/promises';
import {parseProject} from '../src/studio-core/schema.ts';
import {buildAlpineIsland} from '../src/studio-core/alpine-island.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {buildSurfProject} from '../src/studio-core/surf-island.ts';
import {auditProjectRoads} from '../src/studio-core/road-audit.ts';

const file=async f=>parseProject(JSON.parse(await readFile(new URL('../'+f,import.meta.url),'utf8')));
const WORLDS={volcan:()=>file('maps/island.project.json'),forest:()=>file('tests/fixtures/legacy-maps/authoring/production-reference.project.json'),
 surf:buildSurfProject,cimes:buildAlpineIsland,moissons:buildHarvestIsland};
const args=process.argv.slice(2),json=args.includes('--json'),worst=+(args[args.indexOf('--worst')+1]??0)||(args.includes('--worst')?8:0);
for(const f of args.filter(a=>a.endsWith('.json')))WORLDS[f]=async()=>parseProject(JSON.parse(await readFile(f,'utf8')));
const only=args.filter(a=>WORLDS[a]),report={};
for(const id of only.length?only:Object.keys(WORLDS)){
 const t=performance.now(),audit=auditProjectRoads(await WORLDS[id]());report[id]=audit;
 if(json)continue;
 console.log(`\n${id} — ${audit.paths.length} chemins, ${(performance.now()-t|0)} ms`);console.table([audit.totals]);
 if(worst){
  const score=a=>a.underwaterM*3+a.fallLineM*2+a.steepM+a.tiltedM;
  console.table(audit.paths.filter(a=>score(a)>0).sort((a,b)=>score(b)-score(a)).slice(0,worst).map(({maxGradeAt,...a})=>({...a,at:maxGradeAt.x+','+maxGradeAt.z})));
  console.table(audit.crossings.filter(c=>!c.bridgeId||c.skewDeg>25||c.bridgeYawErrorDeg>15).slice(0,worst*2));
 }
}
if(json)console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([k,v])=>[k,v.totals])),null,1));
