import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseProject} from '../src/studio-core/schema.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {generateDressingCell,DRESSING_CELL_M,ITEM_STRIDE} from '../src/geography/dressing.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {worldAsset} from '../src/world-production/registry.ts';
import {SPECIES} from '../src/world-production/biotopes.ts';
import {buildProductionReference,REFERENCE_LANDSCAPES,REFERENCE_VIEWS} from '../tools/generate-production-reference.mjs';

const committed=parseProject(JSON.parse(await readFile(new URL('../maps/production-reference.project.json',import.meta.url),'utf8')));
const entities=p=>Object.values(p.chunks).flatMap(c=>Object.values(c.entities));
const maskCount=(p,layer,code)=>Object.values(p.chunks).reduce((n,c)=>n+[...(c.layers?.[layer]??'')].filter(v=>v===code).length,0);

test('reference region is reproducible from the production tools (source == generator output)',()=>{
  const {project}=buildProductionReference();
  assert.equal(JSON.stringify(project),JSON.stringify(committed),'npm run generate:production-reference');
  assert.equal(Object.keys(committed.libraries.landscapes).length,REFERENCE_LANDSCAPES.length);
});
test('the sixteen required situations exist in the source',()=>{
  const p=committed,features=p.world.terrain.archipelago.features,water=Object.values(p.libraries.water),zones=Object.values(p.libraries.zones),all=entities(p);
  const assets=all.map(e=>e.components.Visual?.assetId).filter(Boolean);
  const checks={
    forest:maskCount(p,'biome','f')>500,clearing:maskCount(p,'biome','m')>20,meadow:!!p.libraries.landscapes['ls-village-clearing-1'],valley:features.some(f=>f.kind==='valley'),
    watercourse:water.some(w=>w.kind!=='lake'),waterfall:water.some(w=>w.falls?.length),lake:water.some(w=>w.kind==='lake'),cliff:features.some(f=>f.id.startsWith('ls-rocky-cliff'))&&maskCount(p,'geology','r')>50,
    beach:maskCount(p,'geology','a')>50,rocky:!!p.libraries.landscapes['ls-rocky-cliff-1'],village:assets.filter(a=>a.startsWith('architecture.')).length>=4,bridge:assets.some(a=>a.startsWith('structure.bridge')),
    path:Object.keys(p.libraries.paths).length>=4,mine:zones.some(z=>z.kind==='mine'),farm:zones.some(z=>z.kind==='farm-plot'),assets:new Set(assets.filter(a=>worldAsset(a))).size>=10,
  };
  for(const [k,ok]of Object.entries(checks))assert.ok(ok,'missing: '+k);
  assert.equal(Object.keys(checks).length,16);
});
test('vegetation of the reference region uses library species, none on roads, fields, the mine or buildings',()=>{
  const {ctx}=projectGeography(committed),b=committed.world.bounds,inside=(x,z)=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
  const seen=new Set();
  for(const v of Object.values(REFERENCE_VIEWS).filter(Boolean)){
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      const cell=generateDressingCell(ctx,committed.world.seed,Math.floor(v.x/DRESSING_CELL_M)+dx,Math.floor(v.z/DRESSING_CELL_M)+dz,inside);
      for(const k of ['pine','oak','shrub','plant','deadwood']){const a=cell.items[k];for(let i=0;i<a.length;i+=ITEM_STRIDE){seen.add(SPECIES[a[i+6]].id);const o=ctx.occupancy(a[i],a[i+2]);assert.ok(o!=='road'&&o!=='farm'&&o!=='built'&&!(o==='reserved'&&(k==='pine'||k==='oak')),`${k} on ${o}`);}}
    }
  }
  assert.ok(seen.size>=12,'species diversity '+seen.size);
});
test('compiled reference world is readable and carries landscapes, water network and entities',async()=>{
  const root=new URL('../public/maps/production-reference/',import.meta.url);
  const fetcher=async url=>{const u=new URL(String(url));try{return new Response(await readFile(new URL(u.pathname.replace(/^\//,''),root)));}catch{return new Response('',{status:404});}};
  const bundle=await openCompiledWorld('file:///manifest.json',fetcher),playable=playableFromCompiled(bundle);
  assert.ok(playable.world.geography.landscapes.length>=REFERENCE_LANDSCAPES.length);
  assert.ok(playable.world.water.some(w=>w.falls?.length));assert.ok(playable.world.placements.length>=100);
  assert.ok(playable.activities?.mines.length&&playable.activities?.farms.length,'mine and farm zones reach the runtime');
});
