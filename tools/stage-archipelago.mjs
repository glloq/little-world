/** Publish a validated Studio reference as a second independent island on static Pages. */
import {cp,readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const src=join(root,'tests/fixtures/legacy-maps/published/production-reference');
const dst=resolve(process.argv[2]??'dist','archipelago/worlds/forest-valley');
const manifest=JSON.parse(await readFile(join(src,'manifest.json'),'utf8'));
if(manifest.schemaVersion!==1||manifest.kind!=='compiled-world'||
  manifest.worldId!=='little-world-production-reference'||
  !Array.isArray(manifest.chunks)||!manifest.chunks.length||!manifest.logic?.url)
  throw Error('Île forestière non compilée ou invalide');
for(const resource of [manifest.logic,...manifest.chunks]){
  if(!/^(?:chunks\/[a-zA-Z0-9_.-]+\.json|logic\.[a-zA-Z0-9_-]+\.json)$/.test(resource.url))throw Error('Chemin de compilation invalide : '+resource.url);
  const info=await stat(join(src,resource.url));
  if(!info.isFile()||info.size!==resource.byteLength)throw Error('Fichier absent ou incohérent : '+resource.url);
}
await mkdir(dst,{recursive:true});
await cp(src,dst,{recursive:true,force:true});
console.log('Île forestière statique publiée : '+manifest.chunks.length+' secteurs vers '+dst);
