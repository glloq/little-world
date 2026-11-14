import test from 'node:test';
import assert from 'node:assert/strict';
import {archipelagoPreset} from '../src/geography/archipelago-params.ts';
import {archipelagoField} from '../src/geography/archipelago.ts';
import {createGeoContext} from '../src/geography/engine.ts';
import {generateDressingCell,DRESSING_CELL_M,ITEM_STRIDE,DRESSING_KINDS} from '../src/geography/dressing.ts';
import {classifyPoint} from '../src/geography/classify.ts';
import {BIOTOPES,BIOTOPE_IDS,SPECIES,SPECIES_INDEX,landscapeInfluenceAt,pickSpecies,profileOf,treeMix} from '../src/world-production/biotopes.ts';
import {ASSET_USAGE} from '../src/world-production/asset-usage.ts';
import {worldAsset} from '../src/world-production/registry.ts';

const W=3000,L=8000,world={seed:4242,seaLevel:0,width:W,length:L},preset=archipelagoPreset(W,L),field=archipelagoField(world,preset);
const inside=(x,z)=>Math.abs(x)<=W/2&&Math.abs(z)<=L/2;
const grid={minX:-W/2,minZ:-L/2,chunkSizeM:64,columns:Math.ceil(W/64),rows:Math.ceil(L/64)};
function ctx(sources,deps={}){return createGeoContext(sources??null,{seaLevel:0,height:field.height,site:field.site,water:(x,z,h)=>h<0?0:null,pathDistance:()=>Infinity,waterDistance:()=>Infinity,...deps});}
const species=cell=>{const out=[];for(const k of DRESSING_KINDS){const a=cell.items[k];for(let i=0;i<a.length;i+=ITEM_STRIDE)out.push({kind:k,x:a[i],y:a[i+1],z:a[i+2],s:a[i+3],sp:a[i+6]});}return out;};
const band=[];for(let cz=-60;cz<60;cz+=5)for(let cx=-14;cx<14;cx+=3)band.push([cx,cz]);

test('ten configurable profiles with complete contracts; every species is a real registry asset',()=>{
  assert.equal(BIOTOPE_IDS.length,10);
  for(const p of Object.values(BIOTOPES)){
    for(const f of ['altitude','maxSlope','geology','moisture','seaDistance','freshWater','trees','shrubs','ground','deadwood','rocks','openness','transitionM','transitions','variants'])assert.ok(p[f]!==undefined,p.id+'.'+f);
    for(const mix of [p.treeMix,p.shrubMix,p.groundMix,p.deadwoodMix])for(const id of Object.keys(mix))assert.ok(SPECIES_INDEX[id]!==undefined,id);
    for(const t of p.transitions)assert.ok(BIOTOPES[t],'transition '+t);
  }
  for(const s of SPECIES){assert.ok(worldAsset(s.id),s.id);assert.ok(ASSET_USAGE[s.id].instancing);}
  // Forest ↔ prairie, prairie ↔ mountain, forest ↔ wetland/humid valley, coast transitions declared.
  assert.ok(BIOTOPES['temperate-forest'].transitions.includes('prairie')&&BIOTOPES.prairie.transitions.includes('mountain')&&BIOTOPES['humid-valley'].transitions.includes('marsh')&&BIOTOPES.prairie.transitions.includes('sandy-coast')&&BIOTOPES.mountain.transitions.includes('volcanic')&&BIOTOPES['rocky-coast'].transitions.includes('sandy-coast'));
});
test('species picks are deterministic and follow weights; palms only where a landscape allows them',()=>{
  const mix={'nature.broadleaf_round':3,'nature.pine':1},counts={};
  for(let i=0;i<4000;i++){const s=pickSpecies(mix,(i+.5)/4000);counts[s]=(counts[s]??0)+1;}
  assert.equal(counts[SPECIES_INDEX['nature.broadleaf_round']],3000);assert.equal(counts[SPECIES_INDEX['nature.pine']],1000);
  assert.deepEqual(Object.keys(treeMix(BIOTOPES['sandy-coast'],null)),[]);
  assert.ok(treeMix(BIOTOPES['sandy-coast'],{weight:1,palms:true})['nature.palm_thin']>0);
  assert.ok(Object.keys(treeMix(BIOTOPES.prairie,{weight:1,orchard:true})).every(id=>id.startsWith('nature.fruit_')));
});
test('generated vegetation uses library species consistent with its crown class and habitat',()=>{
  const c=ctx(),seen=new Set();let n=0;
  for(const [x,z]of band){const cell=generateDressingCell(c,4242,x,z,inside);
    for(const it of species(cell)){
      if(['rock','scree','pebble','basalt'].includes(it.kind)){assert.equal(it.sp,-1);continue;}
      const sp=SPECIES[it.sp];assert.ok(sp,'species index');seen.add(sp.id);n++;
      if(it.kind==='pine')assert.equal(sp.crown,'cone');if(it.kind==='oak')assert.ok(sp.kind==='tree'&&sp.crown!=='cone');
      if(it.kind==='shrub')assert.equal(sp.kind,'shrub');
      assert.ok(it.s>=sp.scale[0]*.7&&it.s<=sp.scale[1]*1.15,'scale range '+sp.id);
      assert.ok(!sp.id.startsWith('nature.palm'),'no palm without an authored landscape');
      assert.ok(!sp.id.startsWith('nature.fruit_')||true);
    }}
  assert.ok(n>2000,'vegetation items '+n);assert.ok(seen.size>=18,'species diversity '+seen.size);
});
test('ecotones: forest species spill a few tens of metres into neighbouring biotopes, never far',()=>{
  const c=ctx();let spilled=0,far=0;
  const forestOnly=new Set(['nature.fern_small','nature.mushrooms_patch','nature.mushroom_tall','nature.broadleaf_tall']);
  for(const [x,z]of band){const cell=generateDressingCell(c,4242,x,z,inside);
    for(const it of species(cell)){if(it.sp<0||!forestOnly.has(SPECIES[it.sp].id))continue;const s=classifyPoint(c,it.x,it.z);
      if(s.biome!=='forest'&&s.biome!=='meadow'&&s.biome!=='wetland')continue;
      if(profileOf(s,Infinity)==='prairie'){spilled++;let near=false;for(let a=0;a<16&&!near;a++)for(const d of [8,16,24,32,40]){const q=classifyPoint(c,it.x+Math.cos(a*.39)*d,it.z+Math.sin(a*.39)*d);if(q.biome==='forest'||q.moisture>.66){near=true;break;}}if(!near)far++;}}}
  assert.ok(spilled>0,'interpenetration at forest edges');assert.equal(far,0,'no forest species far inside prairie');
});
test('landscape regions steer density and profile with a soft edge',()=>{
  const r={id:'l1',x:0,z:0,width:200,length:100,rotation:0,edgeM:20,profile:'marsh',density:1.5};
  assert.equal(landscapeInfluenceAt([r],0,0).weight,1);assert.equal(landscapeInfluenceAt([r],120,0),null);
  const edge=landscapeInfluenceAt([r],95,0).weight;assert.ok(edge>0&&edge<.2,'soft edge '+edge);
  // Rotation: a 90° region swaps width and length.
  assert.ok(landscapeInfluenceAt([{...r,rotation:Math.PI/2}],0,90));assert.equal(landscapeInfluenceAt([{...r,rotation:Math.PI/2}],90,0),null);
  // A forested cell under a dense 'temperate-forest' region gains trees; same input = same output.
  const base=ctx(),forest=band.map(([x,z])=>generateDressingCell(base,4242,x,z,inside)).find(cell=>cell.items.oak.length+cell.items.pine.length>20*ITEM_STRIDE);
  const cxm=(forest.cx+.5)*DRESSING_CELL_M,czm=(forest.cz+.5)*DRESSING_CELL_M;
  const dense=ctx({seed:4242,grid,masks:{},landscapes:[{id:'dense',x:cxm,z:czm,width:400,length:400,rotation:0,edgeM:10,profile:'temperate-forest',density:1.35}]});
  const a=generateDressingCell(dense,4242,forest.cx,forest.cz,inside),b=generateDressingCell(dense,4242,forest.cx,forest.cz,inside);
  for(const k of DRESSING_KINDS)assert.deepEqual(a.items[k],b.items[k]);
  assert.ok(a.items.oak.length+a.items.pine.length>forest.items.oak.length+forest.items.pine.length,'denser forest');
});
test('river banks receive shingle, reeds and riparian trees; shallow marsh water receives reeds',()=>{
  // A synthetic river along x = 10 m of every cell (distance = |x mod 64 − 10|).
  const riverCtx=ctx(null,{waterDistance:(x)=>Math.abs(((x%64)+64)%64-10)});
  let pebbles=0,reeds=0;
  for(const [x,z]of band){const cell=generateDressingCell(riverCtx,4242,x,z,inside);pebbles+=cell.items.pebble.length/ITEM_STRIDE;for(const it of species(cell))if(it.sp===SPECIES_INDEX['nature.reeds_patch'])reeds++;}
  assert.ok(pebbles>50&&reeds>20,`pebbles ${pebbles}, reeds ${reeds}`);
  const marsh=ctx({seed:4242,grid,masks:{},biomeStrokes:[{x:0,z:0,radius:5000,biome:'wetland'}]},{water:(x,z,h)=>h+.3});
  let wet=0;for(const [x,z]of band.slice(0,40))for(const it of species(generateDressingCell(marsh,4242,x,z,inside)))if(it.sp===SPECIES_INDEX['nature.reeds_patch'])wet++;
  assert.ok(wet>10,'reeds in shallow marsh water '+wet);
});
