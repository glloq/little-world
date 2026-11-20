/** Dedicated, static Little World surf island source. Source geometry is first-class Studio
 * V3 data, not a runtime toggle or hand-drawn screenshot. Production builds compile
 * this deterministic island for Pages without modifying existing volcano/forest islands.
 *
 * Usage: node --experimental-strip-types tools/generate-surf-island.mjs [dist]
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSurfIsland,SURF_ISLAND} from '../src/studio-core/surf-island.ts';
import {compileProjectToDirectory} from './compile-project.mjs';
export {buildSurfIsland,SURF_ISLAND};

async function main(){
 const root=resolve(process.argv[2]??'dist');
 const output=join(root,'archipelago/worlds/surf-island');
 const {project,port,plan,homes}=buildSurfIsland();
 const compile=await compileProjectToDirectory(project,output);
 // A copy of the actual authored source is retained for Studio import and diagnostics.
 const report={schemaVersion:1,worldId:SURF_ISLAND.worldId,
  beaches:plan.beaches.map(b=>({name:b.name,zone:b.zone.id,spawn:b.start,
   gates:b.gates.gates.length,features:b.features.length})),
  port:{shore:port.shore,boat:port.boat,trade:port.trade},
  homes,chunks:compile.manifest.chunks.length,sourceHash:compile.manifest.sourceHash};
 await mkdir(output,{recursive:true});
 await writeFile(join(output,'project.json'),JSON.stringify(project));
 await writeFile(join(output,'surf-layout.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Île Surf publiée : '+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 await main();
