import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {buildAlpineIsland} from '../src/studio-core/alpine-island.ts';
import {compileProjectToDirectory} from './compile-project.mjs';

const output=resolve(process.argv[2]??'dist','archipelago/worlds/alpine-island');
const project=buildAlpineIsland();
await mkdir(output,{recursive:true});
const {manifest}=await compileProjectToDirectory(project,output);
await writeFile(join(output,'project.json'),JSON.stringify(project));
console.log('Île des Cimes compilée : '+manifest.chunks.length+' secteurs.');
