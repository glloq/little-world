/** Initial JavaScript of a Vite build: entry chunks of index.html (game) and studio/index.html
 * plus their STATIC import closure, versus named lazy chunks. Compare two builds:
 *   node tools/report-bundle.mjs dist [otherDist]
 * Bytes are raw minified sizes (gzip shown for reference), measured, not estimated. */
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join,dirname,basename} from 'node:path';

function closure(dist,html){
  const page=join(dist,html);if(!existsSync(page))return null;
  const text=readFileSync(page,'utf8'),entries=[...text.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m=>m[1]);
  const seen=new Set(),queue=entries.map(e=>join(dist,e.replace(/^.*?\/assets\//,'assets/')));
  while(queue.length){
    const file=queue.pop();if(seen.has(file)||!existsSync(file))continue;seen.add(file);
    const src=readFileSync(file,'utf8');
    // Static imports only: `import{..}from"./x.js"` / `import"./x.js"`; dynamic `import("./x.js")` is lazy.
    for(const m of src.matchAll(/(?:^|[;}\s])import\s*(?:[\w${},*\s]+from\s*)?["'](\.\/[^"']+\.js)["']/g))queue.push(join(dirname(file),m[1]));
  }
  let raw=0,gz=0;for(const f of seen){const b=readFileSync(f);raw+=b.length;gz+=gzipSync(b).length;}
  return {files:[...seen].map(f=>basename(f)).sort(),raw,gzip:gz};
}
function lazy(dist,pattern){
  const dir=join(dist,'assets');return readdirSync(dir).filter(f=>f.endsWith('.js')&&pattern.test(f)).map(f=>{const b=readFileSync(join(dir,f));return {file:f,raw:b.length,gzip:gzipSync(b).length};});
}
function report(dist){
  const game=closure(dist,'index.html'),studio=closure(dist,'studio/index.html');
  const minigames=lazy(dist,/^(game-host|family|demo|minigames-panel)-/);
  const total=readdirSync(join(dist,'assets')).filter(f=>f.endsWith('.js')).reduce((s,f)=>s+readFileSync(join(dist,'assets',f)).length,0);
  return {dist,initialGame:game&&{raw:game.raw,gzip:game.gzip,files:game.files.length},initialStudio:studio&&{raw:studio.raw,gzip:studio.gzip,files:studio.files.length},
    initialGameHasMinigames:!!game?.files.some(f=>/^(game-host|family)-/.test(f)),minigameChunks:minigames,allJsRaw:total};
}
const [a='dist',b]=process.argv.slice(2);
const rows=[report(a),...(b?[report(b)]:[])];
console.log(JSON.stringify(rows,null,1));
if(b){const [x,y]=rows;console.log(JSON.stringify({initialGameDeltaRaw:x.initialGame.raw-y.initialGame.raw,initialStudioDeltaRaw:(x.initialStudio?.raw??0)-(y.initialStudio?.raw??0),allJsDeltaRaw:x.allJsRaw-y.allJsRaw}));}
