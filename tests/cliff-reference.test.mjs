import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildCliffReference,CLIFF_SITES} from '../tools/generate-cliff-reference.mjs';
import {parseProject} from '../src/studio-core/schema.ts';
import {readProjectArchive,writeProjectArchive} from '../src/studio-core/archive.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {createTerrainSource} from '../src/terrain.ts';
import {createCliffView,buildCliffGeometry,CLIFF_BUDGET} from '../src/render/cliff-view.ts';

const root=new URL('../tests/fixtures/legacy-maps/published/cliff-reference/',import.meta.url);
const committed=parseProject(JSON.parse(await readFile(new URL('../tests/fixtures/legacy-maps/authoring/cliff-reference.project.json',import.meta.url),'utf8')));
const ground=p=>createTerrainSource({seed:p.world.seed,width:280,length:280,seaLevel:0,density:0,terrain:p.world.terrain},[]);

test('cliff lab is reproducible, compact and round-trips through the ordinary V3 ZIP',async()=>{
 const p=buildCliffReference();
 assert.deepEqual(p,committed);
 assert.deepEqual(JSON.parse(await readFile(new URL('../tests/fixtures/legacy-maps/published/cliff-reference.project.json',import.meta.url),'utf8')),p);
 const restored=readProjectArchive(writeProjectArchive(p));
 assert.deepEqual(restored.world,p.world);
 assert.deepEqual(restored.libraries,p.libraries);
 assert.deepEqual(restored.entityIndex,p.entityIndex);
 assert.equal(p.world.bounds.maxX-p.world.bounds.minX,280);
 assert.equal(p.world.bounds.maxZ-p.world.bounds.minZ,280);
 assert.equal(p.world.density,0);
 assert.equal(p.world.terrain.archipelago.features.filter(f=>f.id.startsWith('rl-cliff-')).length,5);
 assert.equal(Object.keys(CLIFF_SITES).length,5);
 const h=ground(p);
 assert.equal(h(0,0),6,'central circulation space stays flat');
 assert.ok(h(-79,50)>20,'real heightfield plateau behind the rim');
 for(const site of Object.values(CLIFF_SITES)){
  const q=site.points[1];assert.ok(h(q.x,q.z)>14,'each test zone has actual relief');
 }
});
test('compiled lab loads with all cliff polylines and context through the existing runtime reader',async()=>{
 const fetcher=async url=>{try{return new Response(await readFile(new URL(new URL(url).pathname.slice(1),root)));}catch{return new Response('',{status:404});}};
 const bundle=await openCompiledWorld('file:///manifest.json',fetcher),playable=playableFromCompiled(bundle);
 assert.deepEqual(playable.world.config.terrain,committed.world.terrain);
 assert.equal(playable.world.paths.length,2);
 assert.equal(playable.world.placements.length,4);
});
test('all five cliffs fit together within the resident mesh and triangle budgets',()=>{
 const p=committed,h=ground(p),view=createCliffView(new THREE.Group(),h,p.world.seed,p.world.terrain);
 for(let i=0;i<20;i++)view.update(0,0);
 assert.equal(view.stats.pending,0);
 assert.equal(view.stats.visible,view.stats.available);
 assert.ok(view.stats.visible<=CLIFF_BUDGET.maxMeshes);
 assert.ok(view.stats.triangles<=view.stats.visible*66);
 for(const mesh of view.root.children){
  assert.equal(mesh.material.vertexColors,true);
  assert.equal(mesh.material.map,null);
  assert.equal(mesh.geometry.index,null);
  assert.equal(mesh.geometry.groups.length,0,'scree shares the wall material/draw call');
  const n=mesh.geometry.getAttribute('normal');
  for(let i=0;i<n.count;i+=3)for(let j=1;j<3;j++)for(let a=0;a<3;a++)assert.equal(n.array[i*3+a],n.array[(i+j)*3+a],'flat face normals');
 }
 const basalt=view.root.children.find(m=>m.userData.cliffId.endsWith('volcanic')).geometry.getAttribute('color');
 assert.ok(Math.max(...basalt.array)<.2,'volcanic faces use dark vertex colours');
 view.dispose();
 assert.equal(view.stats.visible,0);
 assert.equal(view.stats.lod0+view.stats.lod1+view.stats.pending,0);
});
test('curved shared boundaries match at mixed LOD on irregular terrain',()=>{
 const n={x:-Math.SQRT1_2,z:Math.SQRT1_2},corner={x:10,z:10};
 const h=(x,z)=>18+10*Math.sin(x*.13)+3*Math.cos(z*.2);
 const a=buildCliffGeometry({a:{x:-8,z:10},b:corner,widthM:8,seed:42,startM:0,endM:18,normalA:{x:0,z:1},normalB:n},h,0);
 const b=buildCliffGeometry({a:corner,b:{x:10,z:28},widthM:8,seed:42,startM:18,endM:36,normalA:n,normalB:{x:-1,z:0}},h,1);
 const ring=g=>{const p=g.getAttribute('position'),out=new Set();for(let i=0;i<p.count;i++)if(Math.abs((p.getX(i)-10)*n.z-(p.getZ(i)-10)*n.x)<1e-4)out.add([p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(4)).join(':'));return [...out].sort();};
 assert.equal(ring(a).length,14);
 assert.deepEqual(ring(a),ring(b));
 assert.equal(a.getAttribute('position').count/3,66);
 assert.equal(b.getAttribute('position').count/3,30);
 a.dispose();b.dispose();
});

test('open wall endpoints blend into heightfield instead of exposing a floating edge',()=>{
 const h=(x,z)=>6+24*Math.max(0,1-Math.abs(z)/9)**2;
 const g=buildCliffGeometry({a:{x:0,z:0},b:{x:18,z:0},widthM:9,seed:42,capStart:true,capEnd:true},h);
 const p=g.getAttribute('position');let checked=0;
 for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<1e-5||Math.abs(p.getX(i)-18)<1e-5){
  assert.ok(Math.abs(p.getY(i)-h(p.getX(i),p.getZ(i))-.08)<1e-4);checked++;
 }
 assert.ok(checked>20);g.dispose();
});

test('single-tile lab removes every overlapping horizon block, with no coplanar surfaces',async()=>{
 const {configureTerrain}=await import('../src/terrain.ts');
 const {createHorizonView}=await import('../src/horizon-view.ts');
 const p=committed;configureTerrain({seed:p.world.seed,width:280,length:280,seaLevel:0,density:0,chunkSize:280,viewDistance:240,terrain:p.world.terrain});
 let active=false;
 const coverage={version:0,tileSize:280,forEachActive(visit){if(active)visit(0,0,6);}};
 const view=createHorizonView(new THREE.Group(),{width:280,length:280,seaLevel:0},coverage);
 const initial=view.stats.triangles;assert.ok(initial>0);
 active=true;coverage.version++;view.update();assert.equal(view.stats.triangles,0);
 active=false;coverage.version++;view.update();assert.equal(view.stats.triangles,initial);
 view.dispose();
});
