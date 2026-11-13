import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseProject} from '../src/studio-core/schema.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {classifyPoint} from '../src/geography/classify.ts';
import {generateDressingCell,DRESSING_CELL_M,ITEM_STRIDE} from '../src/geography/dressing.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {buildReferenceProject,REFERENCE,REFERENCE_SITES} from '../tools/generate-reference.mjs';

const source=parseProject(JSON.parse(await readFile(new URL('../maps/reference.project.json',import.meta.url),'utf8')));
const {ctx}=projectGeography(source),W=REFERENCE.width,L=REFERENCE.length;
const at=(c)=>classifyPoint(ctx,c.x,c.z);
test('reference scene source is reproducible',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(buildReferenceProject())),JSON.parse(JSON.stringify(source)),'generator output matches the committed source');
});
test('reference scene contains every mandatory geographic situation',()=>{
  const hist={};let sand=0,cliff=0;
  for(let z=-L/2+10;z<L/2;z+=20)for(let x=-W/2+10;x<W/2;x+=20){const s=classifyPoint(ctx,x,z);hist[s.biome]=(hist[s.biome]??0)+1;if(!s.underwater&&s.coast<60){if(s.geology==='sand')sand++;if(s.geology==='rock'&&s.cliff>.5)cliff++;}}
  for(const b of ['meadow','forest','wetland','mountain','volcanic','coast','river','village'])assert.ok(hist[b]>0,'biome '+b+' present '+JSON.stringify(hist));
  assert.ok(sand>20,'beaches '+sand);assert.ok(cliff>5,'cliffs '+cliff);
  const v=at(REFERENCE_SITES.volcano);assert.equal(v.biome,'volcanic');assert.ok(v.height>120,'volcano summit');
  assert.ok(at(REFERENCE_SITES.massif).height>150,'mountain massif');
  assert.equal(at(REFERENCE_SITES.wetland).biome,'wetland');assert.equal(at(REFERENCE_SITES.forest).biome,'forest');assert.equal(at(REFERENCE_SITES.meadow).biome,'meadow');
  assert.ok(at(REFERENCE_SITES.islet).height>3,'islet emerges');
  // Buildable plateau: flat, dry, village occupation.
  let maxSlope=0;for(let i=0;i<16;i++){const a=i/16*Math.PI*2,s=classifyPoint(ctx,REFERENCE_SITES.plateau.x+Math.cos(a)*35,REFERENCE_SITES.plateau.z+Math.sin(a)*35);maxSlope=Math.max(maxSlope,s.slope);}
  assert.ok(maxSlope<.12,'plateau is buildable (slope '+maxSlope.toFixed(3)+')');
  assert.equal(at(REFERENCE_SITES.village).occupation,'built');
  assert.equal(at(REFERENCE_SITES.farm).occupation,'farm');assert.equal(at(REFERENCE_SITES.mine).occupation,'reserved');
  // River in the valley: water surface above the valley floor.
  const q={x:60,z:150},s=classifyPoint(ctx,q.x,q.z);assert.ok(s.underwater&&s.biome==='river','river flows in the valley');
});
test('dressing respects the reference zones (no trees in the field, the mine entrance or the village)',()=>{
  const inside=(x,z)=>Math.abs(x)<=W/2&&Math.abs(z)<=L/2;
  for(const site of ['farm','mine','village']){
    const c=REFERENCE_SITES[site],cell=generateDressingCell(ctx,REFERENCE.seed,Math.floor(c.x/DRESSING_CELL_M),Math.floor(c.z/DRESSING_CELL_M),inside);
    for(const kind of ['pine','oak'])for(let i=0;i<cell.items[kind].length;i+=ITEM_STRIDE){const x=cell.items[kind][i],z=cell.items[kind][i+2],o=classifyPoint(ctx,x,z).occupation;assert.ok(!['farm','reserved','built'].includes(o),`${site}: tree on ${o}`);}
  }
  const f=REFERENCE_SITES.forest,forest=generateDressingCell(ctx,REFERENCE.seed,Math.floor(f.x/DRESSING_CELL_M),Math.floor(f.z/DRESSING_CELL_M),inside);
  assert.ok((forest.items.pine.length+forest.items.oak.length)/ITEM_STRIDE>15,'the forest is wooded');
});
test('the published reference world carries masks, zones and generator to the game',async()=>{
  const root=new URL('../public/maps/reference/',import.meta.url);
  const bundle=await openCompiledWorld('http://localhost/maps/reference/manifest.json',async url=>{const path=new URL(url).pathname.replace(/^\/maps\/reference\//,'');try{return new Response(await readFile(new URL(path,root)));}catch{return new Response('',{status:404});}});
  const play=playableFromCompiled(bundle);
  assert.equal(play.world.config.terrain.kind,'archipelago');assert.ok(Object.keys(play.world.geography.masks).length>5);assert.equal(play.world.geography.zones.length,2);
  assert.equal(play.world.water.length,1);assert.equal(play.world.paths.length,2);assert.ok(play.world.placements.filter(p=>p.assetId==='architecture.cottage').length===3);
});
