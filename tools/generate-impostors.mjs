/** Incremental offline atlas build from local GLBs/hamster rig, no SaaS. */
import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {SPECIES} from '../src/world-production/biotopes.ts';
import {worldAsset,groundOffset} from '../src/world-production/registry.ts';
const sha=x=>createHash('sha256').update(x).digest('hex'),root=new URL('../',import.meta.url),dest=new URL('public/impostors/',root);
await mkdir(dest,{recursive:true});let previous={schemaVersion:1,pages:{}};try{previous=JSON.parse(await readFile(new URL('manifest.json',dest),'utf8'));}catch{}
const code=await Promise.all(['src/render/impostor-baker.ts','src/hamster/hamster.ts','src/hamster/hamster-animation.ts','src/hamster/hamster-model.ts','src/hamster/tools.ts','src/character-style.ts','src/squirrel.ts','src/world-production/species-library.ts','src/render/atlas-crop.ts'].map(p=>readFile(new URL(p,root),'utf8')));
const assetItem=async id=>{const a=worldAsset(id);return {id,file:a.lods[0].file,lift:groundOffset(a),frames:1,fps:0,sourceHash:sha(await readFile(new URL('public/'+a.lods[0].file,root)))};};
const hamsterHash=sha(await readFile(new URL('public/models/hamster.glb',root)));
const groups={
 trees:{tile:64,views:4,elevations:[0,Math.PI/3],items:await Promise.all(SPECIES.filter(s=>s.kind==='tree').map(s=>assetItem(s.id)))},
 buildings:{tile:64,views:4,elevations:[0,Math.PI/3],items:await Promise.all(['architecture.castle_keep','architecture.church'].map(assetItem))},
 characters:{tile:48,views:4,elevations:[-Math.PI/3,0,Math.PI/3],items:[['idle','ground',0,0],['walk','ground',3.5,0],['run','ground',8,0],['roll','roll',9,0],['jump','air',5,5],['glide','glide',10,-1],['swim','swim',3,0],['dive','dive',2,-1],['action','ground',0,0]].map(([id,mode,speed,vy])=>({id:'hamster.'+id,mode,speed,vy,action:id==='action',frames:3,fps:4,sourceHash:hamsterHash}))},
};
const wanted=Object.entries(groups).filter(([k])=>!process.env.IMPOSTOR_GROUP||process.env.IMPOSTOR_GROUP===k),changed=[];
for(const [kind,request]of wanted){const inputHash=sha(JSON.stringify({request,code:kind==='characters'?code:[code[0],code.at(-2),code.at(-1)]}));if(previous.pages[kind]?.inputHash===inputHash&&existsSync(new URL('../'+previous.pages[kind].image,dest)))continue;changed.push({kind,request,inputHash});}
if(process.argv.includes('--check')){if(changed.length){console.error('Atlas périmés : '+changed.map(g=>g.kind).join(', '));process.exitCode=1;}else console.log('Atlas à jour (empreintes sources/générateur).');}
else if(changed.length){
 const server=await createServer({root:new URL('.',root).pathname,server:{host:'127.0.0.1',port:5187,strictPort:true},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:5187/little-world/tools/impostors/bake.html');await page.waitForFunction(()=>!!window.bakeAtlas);
  for(const {kind,request,inputHash}of changed){const baked=await page.evaluate(r=>window.bakeAtlas(r),request),png=Buffer.from(baked.png,'base64'),image=`impostors/${kind}.${sha(png).slice(0,16)}.png`;delete baked.png;await writeFile(new URL('../'+image,dest),png);previous.pages[kind]={...baked,image,inputHash};console.log(kind,baked.width+'×'+baked.height,png.length+' bytes');}
  await writeFile(new URL('manifest.json',dest),JSON.stringify(previous)+'\n');
 }finally{await browser.close();await server.close();}
}else console.log('Atlas inchangés, aucune reconstruction.');

// Only content-addressed files owned by this generator can be removed.
if(!process.argv.includes('--check')){const keep=new Set(Object.values(previous.pages).map(p=>p.image.split('/').at(-1)));for(const name of await readdir(dest))if(/^(trees|characters|buildings)\.[a-f0-9]{16}\.png$/.test(name)&&!keep.has(name))await unlink(new URL(name,dest));}
