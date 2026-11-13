/** Reproducible low-density island source for B1 lot 1 (3 × 8 km, volcano, coasts).
 * Writes the V3 authoring source and its compiled static world. Content (forest,
 * village, rivers, fields, mine) is intentionally absent: sectors without an authored
 * package keep the generated base relief.
 */
import {writeFile} from 'node:fs/promises';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {islandPreset} from '../src/terrain-generator.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {compileProjectToDirectory} from './compile-project.mjs';
const p=createProject({name:'Île du volcan',width:3000,length:8000,seed:4242,projectId:'little-world-island-authoring',worldId:'little-world-island',terrain:islandPreset(3000,8000)});
p.world.environment=defaultEnvironment(p.world.seed);
const project=parseProject(p);
await writeFile(new URL('../maps/island.project.json',import.meta.url),JSON.stringify(project,null,2)+'\n');
const result=await compileProjectToDirectory(project,new URL('../public/maps/island',import.meta.url).pathname);
console.log(JSON.stringify({worldId:result.manifest.worldId,buildVersion:result.manifest.buildVersion,authoredChunks:result.manifest.chunks.length,written:result.written},null,2));
