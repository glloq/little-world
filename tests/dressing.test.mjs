import test from 'node:test';
import assert from 'node:assert/strict';
import {archipelagoPreset} from '../src/geography/archipelago-params.ts';
import {archipelagoField} from '../src/geography/archipelago.ts';
import {createGeoContext} from '../src/geography/engine.ts';
import {generateDressingCell,DRESSING_CELL_M,ITEM_STRIDE,DRESSING_KINDS} from '../src/geography/dressing.ts';
import {classifyPoint} from '../src/geography/classify.ts';

const W=3000,L=8000,world={seed:4242,seaLevel:0,width:W,length:L},preset=archipelagoPreset(W,L),field=archipelagoField(world,preset);
const inside=(x,z)=>Math.abs(x)<=W/2&&Math.abs(z)<=L/2;
function ctx(sources){return createGeoContext(sources??null,{seaLevel:0,height:field.height,site:field.site,water:(x,z,h)=>h<0?0:null,pathDistance:()=>Infinity,waterDistance:()=>Infinity});}
const items=(cell,kind)=>{const a=cell.items[kind],out=[];for(let i=0;i<a.length;i+=ITEM_STRIDE)out.push({x:a[i],y:a[i+1],z:a[i+2]});return out;};
/** Cells covering the whole main island band through the massif (forest) and volcano. */
const sampleCells=[];for(let cz=-60;cz<60;cz+=7)for(let cx=-12;cx<12;cx+=5)sampleCells.push([cx,cz]);

test('dressing is deterministic and independent of generation order',()=>{
  const c=ctx(),a=sampleCells.map(([x,z])=>generateDressingCell(c,4242,x,z,inside)),b=[...sampleCells].reverse().map(([x,z])=>generateDressingCell(c,4242,x,z,inside)).reverse();
  for(let i=0;i<a.length;i++)for(const k of DRESSING_KINDS)assert.deepEqual(a[i].items[k],b[i].items[k]);
  const total=Object.fromEntries(DRESSING_KINDS.map(k=>[k,a.reduce((n,c)=>n+c.items[k].length/ITEM_STRIDE,0)]));
  assert.ok(total.pine+total.oak>200,'forests produce trees '+JSON.stringify(total));
  assert.ok(total.rock>0&&total.basalt>0,'cliffs/volcano produce rocks and basalt '+JSON.stringify(total));
  for(const cell of a)for(const k of DRESSING_KINDS)for(const p of items(cell,k)){assert.ok(p.x>=cell.cx*DRESSING_CELL_M-3&&p.x<=(cell.cx+1)*DRESSING_CELL_M+3);assert.ok(Number.isFinite(p.y));}
});
test('vegetation follows habitats: none under water, on roads, fields, exclusions; no trees in reserved zones',()=>{
  const c=ctx();let checked=0;
  for(const [x,z]of sampleCells){const cell=generateDressingCell(c,4242,x,z,inside);
    for(const k of ['pine','oak','shrub'])for(const p of items(cell,k)){const s=classifyPoint(c,p.x,p.z);assert.ok(!s.underwater,'no tree under water');assert.ok(!['road','built','farm','exclusion'].includes(s.occupation));checked++;}}
  assert.ok(checked>100);
  // Find a forested cell, then cover it with a farm plot, a reserved zone and an exclusion mask.
  const forest=sampleCells.map(([x,z])=>generateDressingCell(c,4242,x,z,inside)).find(cell=>cell.items.pine.length+cell.items.oak.length>30*ITEM_STRIDE);
  assert.ok(forest,'a forested cell exists');
  const x0=forest.cx*DRESSING_CELL_M,z0=forest.cz*DRESSING_CELL_M,square=[{x:x0-1,z:z0-1},{x:x0+DRESSING_CELL_M+1,z:z0-1},{x:x0+DRESSING_CELL_M+1,z:z0+DRESSING_CELL_M+1},{x:x0-1,z:z0+DRESSING_CELL_M+1}];
  const grid={minX:-W/2,minZ:-L/2,chunkSizeM:64,columns:Math.ceil(W/64),rows:Math.ceil(L/64)};
  const farm=generateDressingCell(ctx({seed:4242,grid,masks:{},zones:[{kind:'farm-plot',polygon:square}]}),4242,forest.cx,forest.cz,inside);
  assert.equal(farm.items.pine.length+farm.items.oak.length+farm.items.shrub.length,0,'fields exclude vegetation');
  const reserved=generateDressingCell(ctx({seed:4242,grid,masks:{},zones:[{kind:'mine',polygon:square}]}),4242,forest.cx,forest.cz,inside);
  assert.equal(reserved.items.pine.length+reserved.items.oak.length,0,'reserved zones keep no trees');
  const road=generateDressingCell(createGeoContext(null,{seaLevel:0,height:field.height,site:field.site,water:(x,z,h)=>h<0?0:null,pathDistance:()=>0,waterDistance:()=>Infinity}),4242,forest.cx,forest.cz,inside);
  assert.equal(road.count,0,'roads exclude every dressing item');
});
test('dressing cell cost stays bounded (Node measurement, regression signal only)',()=>{
  const c=ctx(),t=performance.now();for(const [x,z]of sampleCells)generateDressingCell(c,4242,x,z,inside);
  const per=(performance.now()-t)/sampleCells.length;assert.ok(per<25,'ms per 64 m cell: '+per.toFixed(2));console.log('# dressing ms/cell',per.toFixed(2));
});
test('the early rejection of dressing candidates never changes the result',()=>{
  const c=ctx();
  for(const [x,z]of sampleCells){const fast=generateDressingCell(c,4242,x,z,inside),full=generateDressingCell(c,4242,x,z,inside,1);for(const k of DRESSING_KINDS)assert.deepEqual(fast.items[k],full.items[k]);}
});

test('G6 priorities: trees and their far silhouettes stay at every detail level, small elements go first',async()=>{
  const {CLASS_SCALE,FAR_SCALE,CLASS_ORDER,classOf,classScale,GATHERABLE}=await import('../src/world-production/dressing-priority.ts');
  for(let level=0;level<4;level++){
    assert.ok(classScale('tree',level)>=.75&&FAR_SCALE[level]>=.8,'trees and far silhouettes kept at level '+level);
    // Every lower-priority class shrinks at least as much as the trees.
    for(const c of ['shrub','ground','deadwood','small'])assert.ok(CLASS_SCALE[c][level]<=CLASS_SCALE.tree[level],c+' ≤ trees at level '+level);
    assert.ok(classScale('gather',level)>=classScale('ground',level),'flowers/mushrooms kept longer than ground plants');
  }
  assert.equal(classScale('small',2),0,'pebbles and scree off from level 2');assert.equal(classScale('ground',3),0,'ground plants off at level 3');
  assert.deepEqual(CLASS_ORDER.slice(0,3),['tree','gather','shrub']);
  assert.equal(classOf('pine'),'tree');assert.equal(classOf('plant','nature.mushrooms_patch'),'gather');assert.equal(classOf('plant','nature.fern_small'),'ground');assert.equal(classOf('pebble'),'small');
  assert.ok(GATHERABLE.has('nature.wildflowers_patch'));
});
test('G6 far canopy: deterministic, only on wooded land, cheaper than the full dressing',async()=>{
  const {generateCanopyCell,CANOPY_STRIDE}=await import('../src/geography/dressing.ts');const c=ctx();
  let canopyMs=0,fullMs=0,trees=0,crowns=0,both=0;
  for(const [cx,cz]of sampleCells){
    let t=performance.now();const a=generateCanopyCell(c,world.seed,cx,cz,inside);canopyMs+=performance.now()-t;
    assert.deepEqual(a,generateCanopyCell(c,world.seed,cx,cz,inside),'same input → same crowns');
    t=performance.now();const full=generateDressingCell(c,world.seed,cx,cz,inside);fullMs+=performance.now()-t;
    const n=full.items.pine.length/ITEM_STRIDE+full.items.oak.length/ITEM_STRIDE;trees+=n;crowns+=a.length/CANOPY_STRIDE;if(n>=8&&a.length)both++;
    for(let i=0;i<a.length;i+=CANOPY_STRIDE){const s=classifyPoint(c,a[i],a[i+2]);assert.ok(!s.underwater&&s.occupation==='none','crown on dry, free land');assert.ok(a[i+3]>0&&a[i+4]>0);}
    if(n===0)assert.ok(a.length/CANOPY_STRIDE<=2,'no forest canopy where the dressing has no tree ('+cx+','+cz+')');
  }
  assert.ok(crowns>0&&both>0,'wooded cells get crowns');assert.ok(canopyMs<fullMs/3,`canopy ${canopyMs.toFixed(0)} ms vs full dressing ${fullMs.toFixed(0)} ms`);
  console.log('# canopy',{crowns,trees,canopyMs:+canopyMs.toFixed(1),fullMs:+fullMs.toFixed(1)});
});
