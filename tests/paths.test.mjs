import test from 'node:test';
import assert from 'node:assert/strict';
import {centerline,sectorGeometry,pathSectors,snapToPaths,pathDiagnostics,surfaceOffset,pathRibbon,PATH_PROFILES} from '../src/paths/path-geometry.ts';
import {createProject,chunkAt} from '../src/studio-core/schema.ts';
import {putPath} from '../src/studio-core/source.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {parseWorld} from '../src/world-data.ts';

const flat={height:()=>0,water:()=>null};
const road={id:'path:road',points:[{x:-60,z:0},{x:0,z:0},{x:40,z:30},{x:80,z:30}],width:4,kind:'stone',smooth:true};
const lane={id:'path:lane',points:[{x:0,z:-50},{x:0,z:-0.1}],width:3,kind:'dirt'};
test('curved centre line passes through every authored point and is deterministic',()=>{
  const a=centerline(road),b=centerline(road);assert.deepEqual(a,b);
  for(const p of road.points)assert.ok(a.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<1e-6),'passes through '+JSON.stringify(p));
  for(let i=1;i<a.length;i++)assert.ok(a[i].d>a[i-1].d&&a[i].d-a[i-1].d<3.5,'regular sampling');
  assert.equal(centerline({...road,smooth:false}).length<a.length,true,'straight lines sample less');
  assert.deepEqual(pathRibbon(lane),lane,'straight paths keep their points for distances');assert.ok(pathRibbon(road).points.length>road.points.length);
});
test('sector geometry: each segment in exactly one sector, LOD lighter, ranks never coplanar',()=>{
  const size=64,keys=pathSectors(road,size),full=sectorGeometry([road],{minX:-1e4,maxX:1e4,minZ:-1e4,maxZ:1e4},flat);
  let triangles=0;for(const k of keys){const [cx,cz]=k.split(':').map(Number);const g=sectorGeometry([road],{minX:cx*size,maxX:(cx+1)*size,minZ:cz*size,maxZ:(cz+1)*size},flat);triangles+=g.index.length/3;assert.ok(g.positions.every(Number.isFinite));}
  assert.equal(triangles,full.index.length/3,'sectors partition the surface');
  const lod1=sectorGeometry([road],{minX:-1e4,maxX:1e4,minZ:-1e4,maxZ:1e4},flat,1);assert.ok(lod1.positions.length<full.positions.length/2,'LOD 1 is much lighter');
  assert.deepEqual(sectorGeometry([road],{minX:-1e4,maxX:1e4,minZ:-1e4,maxZ:1e4},flat).positions,full.positions,'deterministic');
  assert.ok(surfaceOffset(road)>surfaceOffset(lane),'stone lies above dirt at a junction');assert.notEqual(surfaceOffset(lane),surfaceOffset({...lane,id:'path:other'}),'same-kind overlaps never coplanar');
  const wood=sectorGeometry([{id:'path:deck',points:[{x:0,z:0},{x:20,z:0}],width:2,kind:'wood'}],{minX:-100,maxX:100,minZ:-100,maxZ:100},{height:()=>-1,water:()=>0});
  const ys=[];for(let i=1;i<wood.positions.length;i+=3)ys.push(wood.positions[i]);assert.ok(Math.max(...ys)>=PATH_PROFILES.wood.offset-1e-6,'wooden deck floats above the water surface');
});
test('authoring helpers: snapping to other paths and diagnostics (slope, gaps, heights, duplicates, water)',()=>{
  const snap=snapToPaths([road],{x:1.5,z:1},3);assert.deepEqual([snap.x,snap.z,snap.vertex],[0,0,true],'snaps to a nearby vertex');
  const onSegment=snapToPaths([{...road,smooth:false}],{x:-30,z:1.4},3);assert.equal(onSegment.vertex,false);assert.ok(Math.abs(onSegment.z)<1e-9);
  assert.equal(pathDiagnostics([road,lane],flat).length,0,'a clean junction has no diagnostic');
  const gap=pathDiagnostics([road,{...lane,points:[{x:0,z:-50},{x:0,z:-2}]}],flat);assert.ok(gap.some(d=>d.code==='PATH_JUNCTION_GAP'));
  const steep=pathDiagnostics([{...lane,points:[{x:0,z:0},{x:40,z:0}]}],{height:x=>x*.8});assert.ok(steep.some(d=>d.code==='PATH_STEEP'&&d.severity==='ERROR'));
  const dup=pathDiagnostics([lane,{...lane,id:'path:copy'}],flat);assert.ok(dup.some(d=>d.code==='PATH_DUPLICATE'));
  const wet=pathDiagnostics([lane],{height:()=>-2,water:()=>0});assert.ok(wet.some(d=>d.code==='PATH_UNDERWATER'));
  assert.ok(!pathDiagnostics([{...lane,kind:'wood'}],{height:()=>-2,water:()=>0}).some(d=>d.code==='PATH_UNDERWATER'),'wood may cross water');
  const cliff=pathDiagnostics([road,{...lane,kind:'wood'}],{height:()=>0,water:(x,z)=>z<-1?3:null});assert.ok(cliff.every(d=>d.code!=='PATH_JUNCTION_HEIGHT'),'junction on dry ground is fine');
});
test('path profiles survive compilation and reach the playable world unchanged (Jouer ici = runtime)',async()=>{
  const p=createProject({name:'Routes',width:1000,length:1000});putPath(p,road);putPath(p,lane);putPath(p,{id:'path:old',points:[{x:100,z:100},{x:150,z:100}],width:3});
  const compiled=await compileProject(p,{resolveAsset:async()=>({hash:'0'.repeat(64),byteLength:100})}),files=compiled.files;
  const bundle=await openCompiledWorld('http://localhost/w/manifest.json',async url=>{const path=new URL(url).pathname.replace(/^\/w\//,'');return path in files?new Response(files[path]):new Response('',{status:404});});
  const world=playableFromCompiled(bundle).world,byId=Object.fromEntries(world.paths.map(v=>[v.id,v]));
  assert.deepEqual(byId['path:road'],road);assert.deepEqual(byId['path:lane'],lane);assert.equal(byId['path:old'].kind,undefined,'older path unchanged (rendered as dirt)');
  const {terrain:_,...config}=world.config,v2={...world,config};parseWorld(v2);
  assert.throws(()=>parseWorld({...v2,paths:[{...road,kind:'lava'}]}),/Chemins invalides/);
  void chunkAt;
});
