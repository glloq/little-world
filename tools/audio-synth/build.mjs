/** Produce Little World sound files lot by lot (offline, deterministic):
 *   node --experimental-strip-types tools/audio-synth/build.mjs --lot A [--lot C] | --all [--check]
 * Renders each planned take of the selected lots, runs technical QC, writes WAV files under
 * public/audio/, records provenance in assets/audio/produced.json and metrics in
 * assets/audio/qc-report.json. Then run `npm run generate:audio` to update the catalogue. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,wav16} from './dsp.mjs';
import {RECIPES} from './recipes.mjs';
import {render,SYNTH_VERSION,PRODUCTION_DATE} from './render.mjs';
import {measure,check,groupCheck} from './qc.mjs';
import {buildAudioCatalog} from '../../src/audio/catalog-source.ts';
const root=new URL('../../',import.meta.url),args=process.argv.slice(2),all=args.includes('--all'),lots=new Set(args.flatMap((a,i)=>a==='--lot'?[args[i+1]]:[])),verifyOnly=args.includes('--check');
const catalog=JSON.parse(await readFile(new URL('public/audio/catalog.json',root),'utf8'));
const library=Object.fromEntries(Object.entries(catalog.assets).filter(([,a])=>a.uri?.startsWith('audio/library/')));
const plan=buildAudioCatalog(library,{}).production.filter(p=>p.kind==='sample');
const registry=JSON.parse(await readFile(new URL('assets/audio/produced.json',root),'utf8'));
let report={};try{report=JSON.parse(await readFile(new URL('assets/audio/qc-report.json',root),'utf8'));}catch{}
const selected=plan.filter(p=>RECIPES[p.group]&&(all||lots.has(RECIPES[p.group].lot)));
if(!selected.length){console.error('Aucune prise sélectionnée (--lot A|B|C|D|E ou --all).');process.exit(1);}
const problems=[],groups=new Map();
for(const item of selected){const out=render(item);const loop=!!out.recipe.loop,m=measure(out.x,out.sr,{loop}),bad=check(m,{loop});if(bad.length)problems.push(`${item.assetId} : ${bad.join(' ; ')}`);
 const g=groups.get(item.group)??[];g.push({id:item.assetId,x:out.x,m});groups.set(item.group,g);
 const bytes=wav16(out.x,out.sr,hash(item.assetId));const path=new URL('public/'+item.file,root);
 if(verifyOnly){const existing=new Uint8Array(await readFile(path));if(Buffer.compare(Buffer.from(existing),Buffer.from(bytes))!==0)problems.push(`${item.assetId} : rendu non reproductible`);continue;}
 await mkdir(dirname(fileURLToPath(path)),{recursive:true});await writeFile(path,bytes);
 const placeholder=out.recipe.confidence==='placeholder';
 registry.files[item.assetId]={file:item.file,status:placeholder?'LISTENING_REVIEW':'TECHNICALLY_VALID',source:`Little World — synthèse procédurale originale (tools/audio-synth, recette « ${item.group} », lot ${out.recipe.lot}, prise ${item.take}/${item.takes}, ${PRODUCTION_DATE})`,license:'CC0-1.0',generatorVersion:SYNTH_VERSION,notes:placeholder?'Substitut procédural d’un son naturel complexe : écoute prioritaire, source réaliste recommandée. Aucune écoute humaine réalisée.':'Contrôles techniques automatiques réussis. Aucune écoute humaine réalisée.'};
 report[item.assetId]={group:item.group,lot:out.recipe.lot,file:item.file,loop,...m};}
for(const [group,items]of groups){const bad=groupCheck(items);if(bad.length)problems.push(`${group} : ${bad.join(' ; ')}`);}
if(problems.length){console.error('Contrôle qualité en échec :\n- '+problems.join('\n- '));process.exit(1);}
if(verifyOnly){console.log(`${selected.length} rendus identiques aux fichiers livrés.`);process.exit(0);}
const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));registry.files=sorted(registry.files);
await writeFile(new URL('assets/audio/produced.json',root),JSON.stringify(registry,null,1)+'\n');await writeFile(new URL('assets/audio/qc-report.json',root),JSON.stringify(sorted(report),null,1)+'\n');
console.log(`${selected.length} fichiers produits (${[...groups.keys()].length} groupes), contrôle technique réussi. Lancer npm run generate:audio.`);
