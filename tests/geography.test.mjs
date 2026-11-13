import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {archipelagoField,polygonSignedDistance} from '../src/geography/archipelago.ts';
import {archipelagoPreset,parseArchipelago,islandToArchipelago} from '../src/geography/archipelago-params.ts';
import {parseTerrainGenerator,islandPreset} from '../src/terrain-generator.ts';
import {classifyPoint,habitatOf,slopeAt} from '../src/geography/classify.ts';
import {MASK_GRID,EMPTY_MASK,maskCell,cellCenter,validMaskString,setMaskCell} from '../src/geography/layers.ts';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {paintMask,regionCells,regionCorrections,restoreGeneration,regionChunkIds,sectorGrid} from '../src/studio-core/geo-edits.ts';
import {putTerrainEdit} from '../src/studio-core/source.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';

const W=3000,L=8000,world={seed:4242,seaLevel:0,width:W,length:L},preset=archipelagoPreset(W,L);
test('archipelago parameters are validated, versioned and round-trip',()=>{
  const def={kind:'archipelago',version:1,archipelago:preset};assert.deepEqual(parseTerrainGenerator(structuredClone(def),{width:W,length:L}),def);
  assert.throws(()=>parseTerrainGenerator({...def,version:2},{width:W,length:L}),/Version/);
  assert.throws(()=>parseArchipelago({...preset,landmasses:[]},{width:W,length:L}),/1 à 12/);
  assert.throws(()=>parseArchipelago({...preset,features:[{id:'x',kind:'crater'}]},{width:W,length:L}),/inconnue/);
  assert.throws(()=>parseArchipelago({...preset,features:[...preset.features,{...preset.features[0]}]},{width:W,length:L}),/dupliqué/);
  const converted=islandToArchipelago(islandPreset(W,L).island,W,L);assert.equal(parseArchipelago(converted,{width:W,length:L}).features[0].kind,'volcano');
});
test('archipelago relief is deterministic, finite, continuous and has several land masses',()=>{
  const a=archipelagoField(world,preset),b=archipelagoField(world,preset),c=archipelagoField({...world,seed:9},preset);let differs=false,maxStep=0;
  for(let i=0;i<400;i++){const x=(i*37%300-150)*10,z=(i*53%800-400)*10,h=a.height(x,z);assert.ok(Number.isFinite(h));assert.equal(h,b.height(x,z));if(Math.abs(h-c.height(x,z))>.01)differs=true;}
  assert.ok(differs,'seed changes natural variations');
  // Continuity: no jump between neighbouring samples (sector borders included), 1 m apart.
  for(let z=-4000;z<4000;z+=64)for(let x=-1500;x<1500;x+=97){maxStep=Math.max(maxStep,Math.abs(a.height(x+.05,z)-a.height(x,z)),Math.abs(a.height(x,z+.05)-a.height(x,z)));}
  assert.ok(maxStep<1.5,'continuous (5 cm step) '+maxStep.toFixed(3));
  for(const l of preset.landmasses){let inside=0,n=0;for(const p of l.outline){const cx=l.outline.reduce((s,q)=>s+q.x,0)/l.outline.length,cz=l.outline.reduce((s,q)=>s+q.z,0)/l.outline.length,x=(cx*3+p.x)/4,z=(cz*3+p.z)/4;n++;if(a.height(x,z)>0)inside++;}assert.ok(inside/n>.7,`${l.name} emerges`);}
  for(let t=0;t<=1;t+=1/200)for(const [x,z]of [[-W/2+t*W,-L/2],[-W/2+t*W,L/2],[-W/2,-L/2+t*L],[W/2,-L/2+t*L]])assert.ok(a.height(x,z)<-5,'open sea on the edges');
  const v=preset.features.find(f=>f.kind==='volcano');assert.ok(a.height(v.x+v.craterRadiusM,v.z)>a.height(v.x,v.z)+v.craterDepthM*.6,'crater below rim');assert.ok(a.volcanic(v.x,v.z)>.9);
  const valley=preset.features.find(f=>f.kind==='valley'),q=valley.points[1];assert.ok(a.height(q.x,q.z)<a.height(q.x+valley.widthM*.9,q.z),'valley floor below its sides');
  const coastSamples=[];for(let z=-3000;z<3000;z+=40)coastSamples.push(a.cliff(-1500*.62,z));assert.ok(Math.max(...coastSamples)-Math.min(...coastSamples)>.3,'coast alternates cliffs and beaches');
});
function context(over={}){
  const f=archipelagoField(world,preset);
  return {seed:4242,seaLevel:0,height:f.height,water:(x,z,h)=>h<0?0:null,riverDistance:()=>Infinity,site:f.site,mask:()=>undefined,biomeStroke:()=>undefined,occupancy:()=>'none',...over};
}
test('classification is deterministic and authored corrections win over generated values',()=>{
  const ctx=context(),v=preset.features.find(f=>f.kind==='volcano');
  const crater=classifyPoint(ctx,v.x+v.radiusM*.3,v.z);assert.ok(['basalt','ash'].includes(crater.geology)&&crater.biome==='volcanic','volcano is volcanic');
  assert.deepEqual(classifyPoint(ctx,100,1000),classifyPoint(context(),100,1000));
  const masked=context({mask:(layer)=>({biome:'w',geology:'r',material:'s',moisture:'9',occupation:'x'})[layer]});
  const s=classifyPoint(masked,100,1000);assert.equal(s.biome,'wetland');assert.equal(s.geology,'rock');assert.equal(s.material,'sand');assert.equal(s.moisture,1);assert.equal(s.occupation,'exclusion');
  assert.equal(classifyPoint(context({biomeStroke:()=>'forest'}),100,1000).biome,'forest','legacy strokes still honoured');
  assert.equal(classifyPoint(context({biomeStroke:()=>'forest',mask:l=>l==='biome'?'m':undefined}),100,1000).biome,'meadow','mask beats stroke');
  const sea=classifyPoint(ctx,-1450,0);assert.ok(sea.underwater&&sea.height<0);
});
test('habitats exclude vegetation from roads, buildings, fields, exclusions, water and steep rock',()=>{
  const base={height:20,slope:.1,coast:500,cliff:0,volcanic:0,moisture:.6,geology:'soil',biome:'forest',material:'forest-floor',occupation:'none',underwater:false};
  assert.ok(habitatOf(base).trees>.5);
  for(const occupation of ['road','built','farm','exclusion'])assert.deepEqual(Object.values(habitatOf({...base,occupation})).filter(v=>v>0),[]);
  assert.equal(habitatOf({...base,occupation:'reserved'}).trees,0);
  assert.ok(habitatOf({...base,slope:1.4}).trees<.05);
  assert.equal(habitatOf({...base,underwater:true}).trees,0);
});
test('sector masks: compact codec, cell geometry and strict validation',()=>{
  const g={minX:-100,minZ:-100,chunkSizeM:64,columns:4,rows:4},cell=maskCell(g,-99,-99);assert.deepEqual(cell,{chunkId:'0:0',index:0});
  const c=cellCenter(g,'1:2',MASK_GRID+3);assert.deepEqual(c,{x:-100+64+3.5*4,z:-100+128+1.5*4});
  assert.equal(maskCell(g,-200,0),null);assert.equal(maskCell(g,156,156).chunkId,'3:3');
  assert.ok(validMaskString('biome',setMaskCell(EMPTY_MASK,5,'f')));assert.ok(!validMaskString('biome',setMaskCell(EMPTY_MASK,5,'Z')));assert.ok(!validMaskString('moisture','5'));
});
test('mask painting, local restoration and transport to compiled worlds',async()=>{
  const p=createProject({name:'Géo',width:1000,length:1000}),bus=new CommandBus(p),region={kind:'circle',x:10,z:10,radius:20};
  const cells=regionCells(p,region);assert.ok(cells.size>=1);
  editDocument(bus,'Forêt',[...cells.keys()],d=>paintMask(d,'biome','f',cells));
  const id=chunkAt(p.world,10,10);assert.ok(p.chunks[id].layers.biome.includes('f'));parseProject(structuredClone(p));
  editDocument(bus,'Relief',[id],d=>putTerrainEdit(d,{id:'bump',x:12,z:12,radius:8,strength:2,mode:'raise',height:0}));
  const preview=regionCorrections(p,region);assert.deepEqual(preview.terrainEdits,['bump']);assert.ok(preview.cells.biome>0);
  // Corrections outside the region survive a restoration.
  const outside=regionCells(p,{kind:'circle',x:300,z:300,radius:10});editDocument(bus,'Marais',[...outside.keys()],d=>paintMask(d,'biome','w',outside));
  editDocument(bus,'Rétablir',regionChunkIds(p,region),d=>restoreGeneration(d,region,{terrain:true,layers:['biome']}));
  const owner=chunkAt(p.world,12,12);assert.equal(p.chunks[id].layers?.biome,undefined);assert.ok(!p.chunks[owner].terrainEdits.length);assert.ok(p.chunks[chunkAt(p.world,300,300)].layers.biome.includes('w'));
  bus.undo();assert.ok(p.chunks[id].layers.biome.includes('f'));assert.equal(p.chunks[owner].terrainEdits.length,1);
  const runtime=toRuntimeWorld(p);assert.equal(runtime.geography.sectorSizeM,64);assert.ok(runtime.geography.masks[id].biome);
  assert.deepEqual(readProjectArchive(writeProjectArchive(p)).chunks[id].layers,p.chunks[id].layers);
  const compiled=await compileProject(p,{resolveAsset:async()=>({hash:'0'.repeat(64),byteLength:100})});
  const files=compiled.files,bundle=await openCompiledWorld('http://localhost/w/manifest.json',async url=>{const path=new URL(url).pathname.replace(/^\/w\//,'');return path in files?new Response(files[path]):new Response('',{status:404});});
  assert.deepEqual(playableFromCompiled(bundle).world.geography.masks[id],p.chunks[id].layers);
  assert.equal(sectorGrid(p).columns,16);
});
test('older projects and maps stay valid (no layers, island and valley generators)',async()=>{
  parseProject(JSON.parse(await readFile(new URL('../maps/beta.project.json',import.meta.url),'utf8')));
  parseProject(JSON.parse(await readFile(new URL('../maps/island.project.json',import.meta.url),'utf8')));
  const p=createProject({name:'Ancien'});assert.equal(toRuntimeWorld(p).geography,undefined);
  const f=archipelagoField(world,preset);assert.ok(slopeAt(f.height,0,0)>=0);
  assert.ok(polygonSignedDistance([{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}],5,5)===5);
});
