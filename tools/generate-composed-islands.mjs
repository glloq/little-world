import {writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {buildAlpineIsland} from '../src/studio-core/alpine-island.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

const root=resolve(process.argv[2]??'dist','archipelago/worlds');
for(const [id,build] of [['alpine-island',buildAlpineIsland],['harvest-island',buildHarvestIsland]]){
 const output=join(root,id),project=build();
 const {manifest}=await compileProjectToDirectory(project,output);
 await writeFile(join(output,'project.json'),JSON.stringify(project));
 console.log(project.manifest.name+' compilée : '+manifest.chunks.length+' secteurs.');
}
