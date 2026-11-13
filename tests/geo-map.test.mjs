import test from 'node:test';
import assert from 'node:assert/strict';
import {archipelagoPreset} from '../src/geography/archipelago-params.ts';
import {createProject,chunkAt} from '../src/studio-core/schema.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {paintMask,regionCells} from '../src/studio-core/geo-edits.ts';
import {putTerrainEdit} from '../src/studio-core/source.ts';
import {projectGeography,lineSet} from '../src/studio-core/geo-context.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {configureTerrain} from '../src/terrain.ts';
import {configureGeography,classifyAt} from '../src/geography/engine.ts';
import {classifyPoint} from '../src/geography/classify.ts';
import {sampleTile,layerPixels,TILE_PX} from '../src/studio/geo-map/raster.ts';
import {TileCache} from '../src/studio/geo-map/tile-cache.ts';
import {LAYERS} from '../src/geography/layers.ts';

const W=3000,L=8000;
function archipelagoProject(){
  const p=createProject({name:'Archipel',width:W,length:L,seed:4242,terrain:{kind:'archipelago',version:1,archipelago:archipelagoPreset(W,L)}});
  const bus=new CommandBus(p),cells=regionCells(p,{kind:'circle',x:100,z:1000,radius:30});
  editDocument(bus,'Marais',[...cells.keys()],d=>{paintMask(d,'biome','w',cells);paintMask(d,'occupation','p',cells);});
  editDocument(bus,'Bosse',[chunkAt(p.world,120,1010)],d=>putTerrainEdit(d,{id:'bump',x:120,z:1010,radius:20,strength:6,mode:'raise',height:6}));
  return {p,bus};
}
test('the 2D map and the runtime classify with the same engine and the same sources',()=>{
  const {p}=archipelagoProject(),map=projectGeography(p).ctx,def=toRuntimeWorld(p);
  configureTerrain(def.config,def.terrain,def.water,def.paths);
  const g=def.geography;configureGeography({seed:def.config.seed,grid:{minX:-W/2,minZ:-L/2,chunkSizeM:g.sectorSizeM,columns:Math.ceil(W/g.sectorSizeM),rows:Math.ceil(L/g.sectorSizeM)},masks:g.masks,zones:g.zones,biomeStrokes:[],buildings:[]});
  for(let i=0;i<300;i++){
    const x=(i*131%2800)-1400,z=(i*577%7800)-3900,a=classifyPoint(map,x,z),b=classifyAt(x,z);
    assert.deepEqual({...a},{...b},`same sample at ${x},${z}`);
  }
  assert.equal(classifyPoint(map,100,1000).biome,'wetland','author mask visible on the map');
  assert.ok(map.height(120,1010)>classifyAt(160,1060).height-50,'terrain edits included');
});
test('map tiles: deterministic samples, layer images with transparency rules',()=>{
  const {p}=archipelagoProject(),{ctx}=projectGeography(p),b=p.world.bounds;
  const level=3,span=TILE_PX*8,tx=Math.floor((100-b.minX)/span),tz=Math.floor((1000-b.minZ)/span);
  const t=sampleTile(ctx,b,level,tx,tz),again=sampleTile(ctx,b,level,tx,tz);
  assert.deepEqual(t.codes.biome,again.codes.biome);assert.deepEqual(t.heights,again.heights);
  assert.ok(t.authored.some(v=>v&(1<<2)),'authored biome cells flagged');
  const px=new Uint8ClampedArray(TILE_PX*TILE_PX*4);
  for(const l of LAYERS){layerPixels(t,l.id,0,px);assert.ok(px.some((v,i)=>i%4===3&&v===255),l.id+' draws something');}
  // A sea tile: categorical layers are transparent under water, altitude is opaque.
  const sea=sampleTile(ctx,b,2,0,0);layerPixels(sea,'material',0,px);assert.ok(px.every((v,i)=>i%4!==3||v===0));
  layerPixels(sea,'altitude',0,px);assert.ok(px.every((v,i)=>i%4!==3||v===255));
});
test('tile cache is bounded and invalidates locally',()=>{
  const {p}=archipelagoProject(),{ctx}=projectGeography(p),b=p.world.bounds,cache=new TileCache(200*1024);
  for(let tz=0;tz<4;tz++)for(let tx=0;tx<4;tx++)cache.put(sampleTile(ctx,b,6,tx,tz));
  assert.ok(cache.bytes<=200*1024,'byte bound');assert.ok(cache.size<16,'oldest tiles evicted');
  const kept=cache.size,n=cache.invalidate({minX:b.minX,maxX:b.minX+10,minZ:b.minZ,maxZ:b.minZ+10});assert.ok(n<=1&&kept===cache.size);
  assert.equal(cache.invalidate(null),kept-n);
});
test('ribbon distances skip far lines but stay exact nearby',()=>{
  const d=lineSet([{points:[{x:0,z:0},{x:100,z:0}],width:4}]);
  assert.equal(d(50,10,20),8);assert.equal(d(50,500,20),Infinity);assert.equal(d(50,500,Infinity),498);
});
test('relief shapes: variants re-seed locally, presets validate, changes invalidate only their area',async()=>{
  const {parseArchipelago,isletChainPreset,islandToArchipelago}=await import('../src/geography/archipelago-params.ts');
  const {archipelagoField,featureBounds}=await import('../src/geography/archipelago.ts');
  const {terrainChangeRects,setArchipelago}=await import('../src/studio-core/geo-edits.ts');
  const {islandPreset}=await import('../src/terrain-generator.ts');
  const world={seed:4242,seaLevel:0,width:W,length:L},base=archipelagoPreset(W,L);
  for(const preset of [base,isletChainPreset(W,L),islandToArchipelago(islandPreset(W,L).island,W,L)])assert.deepEqual(parseArchipelago(structuredClone(preset),{width:W,length:L}),preset);
  const varied=structuredClone(base),massif=varied.features.find(f=>f.id==='massif');massif.variant=7;
  assert.deepEqual(parseArchipelago(structuredClone(varied),{width:W,length:L}),varied,'variant round-trips');
  assert.throws(()=>parseArchipelago({...base,features:[{...base.features[0],variant:1.5}]},{width:W,length:L}),/variante/);
  const a=archipelagoField(world,base),b=archipelagoField(world,varied),box=featureBounds(massif);let inside=0,outside=0;
  for(let i=0;i<400;i++){const x=box.minX+(i%20+.5)*(box.maxX-box.minX)/20,z=box.minZ+(Math.floor(i/20)+.5)*(box.maxZ-box.minZ)/20;if(Math.abs(a.height(x,z)-b.height(x,z))>.01)inside++;}
  for(let i=0;i<400;i++){const x=(i*131%2800)-1400,z=(i*577%7800)-3900;if(x>=box.minX&&x<=box.maxX&&z>=box.minZ&&z<=box.maxZ)continue;if(a.height(x,z)!==b.height(x,z))outside++;}
  assert.ok(inside>20,'variant changes the massif');assert.equal(outside,0,'and nothing outside its bounds');
  // Transaction → invalidation rectangles.
  const p=createProject({name:'Formes',width:W,length:L,seed:4242,terrain:{kind:'archipelago',version:1,archipelago:base}}),{parseWorldV3}=await import('../src/studio-core/schema.ts'),bus=new CommandBus(p,q=>parseWorldV3(q.world));
  const moved=structuredClone(base);moved.features.find(f=>f.id==='volcano').x+=100;
  const t=editDocument(bus,'Déplacer',[],d=>setArchipelago(d,moved)),change=terrainChangeRects(t.patches);
  assert.ok(change.changed&&!change.global);assert.equal(change.rects.length,2,'old and new volcano areas');
  const general=editDocument(bus,'Fond',[],d=>setArchipelago(d,{...moved,seabedDepthM:60}));assert.ok(terrainChangeRects(general.patches).global);
  bus.undo();bus.undo();assert.deepEqual(p.world.terrain.archipelago,base,'undo restores the relief parameters');
  assert.throws(()=>editDocument(bus,'Invalide',[],d=>setArchipelago(d,{...base,landmasses:[]})),/terres|Archipel/);
});
