/** Stage isolated regression maps on CI preview only, never from Pages workflow. */
import {cp,mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../tests/fixtures/legacy-maps/published/',import.meta.url));
const dest=resolve(process.argv[2]??'dist/maps');
if(!dest.endsWith('/dist/maps'))throw Error('Destination must be an isolated dist/maps preview');
await stat(source);await mkdir(dest,{recursive:true});await cp(source,dest,{recursive:true,force:true});
console.log('Legacy test maps staged for CI preview:',dest);
