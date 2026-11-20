// Compose a world from a declarative brief (doc 104 §C1), compile it and write a report.
// Usage: node --experimental-strip-types tools/generate-from-brief.mjs <brief-id|brief.json> [out-dir] [seed]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {WORLD_BRIEFS,briefToRequirements,validateWorldBrief} from '../src/studio-core/world-brief.ts';
import {composeWorld,projectFromComposition} from '../src/studio-core/world-composition.ts';
import {circulationReport,buildCirculationGraph} from '../src/studio-core/circulation.ts';
import {collectActivitySites} from '../src/studio-core/activity-sites.ts';
import {auditLandUse} from '../src/studio-core/land-registry.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

const [,,source,outArg,seedArg]=process.argv;
if(!source){console.error('Fiches disponibles : '+Object.keys(WORLD_BRIEFS).join(', '));process.exit(2);}
const brief=validateWorldBrief(WORLD_BRIEFS[source]??JSON.parse(await readFile(source,'utf8')));
if(seedArg)brief.seed=Number(seedArg);
const started=performance.now(),plan=composeWorld(briefToRequirements(brief),brief.name,{projectId:'brief-'+brief.id+'-authoring',worldId:'brief-'+brief.id});
const errors=plan.diagnostics.filter(d=>d.severity==='ERROR');
console.log(`${brief.name} : ${plan.ready?'prêt':'incomplet'} en ${Math.round(performance.now()-started)} ms`);
for(const s of plan.stages)console.log(`  ${s.id.padEnd(12)} ${String(Math.round(s.ms)).padStart(6)} ms  ${s.diagnostics} remarque(s)`);
if(!plan.ready){for(const e of errors)console.error('  ERREUR '+e.code+' : '+e.message);process.exit(1);}
const project=projectFromComposition(plan,brief.name),out=resolve(outArg??join('dist','briefs',brief.id));
await mkdir(out,{recursive:true});
const {manifest}=await compileProjectToDirectory(project,out);
await writeFile(join(out,'project.json'),JSON.stringify(project));
const reach=circulationReport(buildCirculationGraph(project)),sites=collectActivitySites(project);
const report={brief,ready:plan.ready,stages:plan.stages,diagnostics:plan.diagnostics,chunks:manifest.chunks.length,
 settlements:Object.values(project.libraries.settlements??{}).map(s=>({id:s.id,role:s.recipe.role??null,houses:s.buildings.length})),
 activities:sites.reduce((n,s)=>(n[s.kind]=(n[s.kind]??0)+1,n),{}),quests:Object.keys(project.libraries.questCatalog??{}).length,
 reachable:reach.reachable,destinations:reach.destinations.length,landOverlaps:auditLandUse(project).length};
await writeFile(join(out,'brief-report.json'),JSON.stringify(report,null,1));
console.log(`Compilé : ${manifest.chunks.length} secteurs · ${report.quests} quêtes · accès ${report.reachable}/${report.destinations} · ${out}`);
