/** Inspect actual island V3 source — read-only, no modification of published maps.
 * Usage: node --experimental-strip-types tools/report-race-terrain.mjs */
import {readFile} from 'node:fs/promises';
import {parseProject} from '../src/studio-core/schema.ts';
import {projectRaceTerrainEnvironment} from '../src/studio-core/race-terrain-context.ts';
import {findRaceTerrainPlacements} from '../src/studio-core/race-terrain-planner.ts';
const source=new URL('../maps/island.project.json',import.meta.url);
const project=parseProject(JSON.parse(await readFile(source,'utf8')));
const env=projectRaceTerrainEnvironment(project);
const anchors=[{x:-900,z:550},{x:750,z:420},{x:-1100,z:-350},{x:850,z:-250},{x:150,z:350},{x:-450,z:10}];
const summary={source:'maps/island.project.json',world:project.world.worldId,bounds:project.world.bounds,checks:[],candidates:[]};
for(const anchor of anchors)for(const style of ['downhill','flat']){
 const r=findRaceTerrainPlacements(env,{anchor,style,targetLength:190,width:8,radius:320,maxResults:2});
 summary.checks.push({anchor,style,evaluated:r.checked,accepted:r.candidates.length,mostCommonRejection:Object.entries(r.rejected).sort((a,b)=>b[1]-a[1]).slice(0,2)});
 for(const candidate of r.candidates)summary.candidates.push({
   anchor,style,score:candidate.score,lengthM:Math.round(candidate.metrics.lengthM),
   dropM:Math.round(candidate.metrics.dropM*10)/10,features:candidate.track.features.map(f=>f.kind),
   start:candidate.track.points[0],end:candidate.track.points.at(-1)
 });
}
console.log(JSON.stringify(summary,null,2));
if(!summary.candidates.length)console.warn('No validated routes at these anchors. Use Studio to inspect a different sector or relax route length/width.');
