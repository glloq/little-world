import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalPlan,naturalBoxes,naturalProfile,tunnelExcavation,structureEndpoints,NATURAL_ASSET_ID} from '../src/structures/natural-structure.ts';
import {naturalColliders,naturalColliderOwner} from '../src/structures/natural-collision.ts';
import {naturalMesh,naturalMeshBudget} from '../src/structures/natural-mesh.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {createProject,parseProject,chunkAt,affectedChunkIds} from '../src/studio-core/schema.ts';
import {putEntity,putTerrainEdit} from '../src/studio-core/source.ts';
import {runtimeContent} from '../src/studio-core/migration.ts';
import {elementChunkIds,deleteElements} from '../src/studio-core/elements.ts';
import {applyTransforms,duplicateEntities} from '../src/studio-core/transforms.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {localFileAssetResolver} from '../tools/compile-project.mjs';
const height=()=>0;
const options={width:7,clearance:4.5,thickness:1.2,curvature:1,form:'round'};
function sample(kind='arch'){
 return naturalPlan({x:-7,z:0},{x:7,z:0},kind,options,height);
}
test('two points, profiles and bounded dimensions are deterministic',()=>{
 for(const kind of ['arch','bridge','tunnel']){
  const plan=sample(kind);assert.equal(plan.spec.span,14);assert.ok(Math.abs(plan.yaw)<1e-9);
  const ends=structureEndpoints(plan.x,plan.z,plan.yaw,plan.spec.span);
  assert.ok(Math.abs(ends[0].x+7)<1e-9&&Math.abs(ends[1].x-7)<1e-9&&ends.every(p=>Math.abs(p.z)<1e-9));
  assert.equal(naturalBoxes(plan.spec).length,16);
  assert.equal(naturalMeshBudget(plan.spec).drawCalls,1);
 }
 assert.throws(()=>naturalPlan({x:0,z:0},{x:100,z:0},'arch',options,height));
 assert.throws(()=>naturalPlan({x:0,z:0},{x:8,z:0},'tunnel',{...options,width:100},height));
 assert.throws(()=>naturalPlan({x:0,z:0},{x:8,z:0},'tunnel',options,(x)=>x<5?0:6));
});
test('real mesh leaves the arch and tunnel open, with bounded triangles and disposal',()=>{
 for(const kind of ['arch','tunnel']){
  const p=sample(kind),group=naturalMesh(p.spec),mesh=group.children[0];
  assert.equal(group.children.length,1);assert.equal(mesh.geometry.getAttribute('position').count/3,naturalMeshBudget(p.spec).triangles);
  assert.equal(mesh.material.vertexColors,true);assert.ok(mesh.geometry.boundingSphere.radius>0);
  mesh.geometry.dispose();mesh.material.dispose();
 }
});
function queryFor(kind){
 const plan=sample(kind),t={position:{x:0,y:plan.y,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
  definitions=naturalColliders('rock-1',plan.spec,t),query=new WorldCollisionQuery(height,()=>null);
 for(const d of definitions)query.add({id:d.id,shape:d.shape,position:d.position,size:d.size,enabled:()=>true});
 return {query,definitions,plan};
}
test('player may pass below the arch and tunnel, with a roof collision above',()=>{
 for(const kind of ['arch','tunnel']){
  const {query,definitions,plan}=queryFor(kind);assert.equal(definitions.length,16);
  assert.ok(definitions.every(d=>naturalColliderOwner(d.id)==='rock-1'&&d.size.y>0));
  const a=kind==='tunnel'?{x:-10,y:0,z:0}:{x:0,y:0,z:-8};
  const b=kind==='tunnel'?{x:10,y:0,z:0}:{x:0,y:0,z:8};
  const result=query.move(a,b,.35,1.8);assert.ok(!result.blockedX&&!result.blockedZ,kind+' pass-through');
  const under=query.surfaceAt({x:0,y:0,z:0},undefined,.3);
  assert.ok(under.ceilingY!==null&&under.ceilingY>1.8,'overhead ceiling is distinct from ground');
  const top=query.surfaceAt({x:0,y:plan.spec.clearance+plan.spec.thickness+2,z:0},undefined,.3);
  assert.ok(top.floorY>2,'roof is walkable when approached from above');
 }
});
test('tunnel excavation is local and recorded as native reversible V3 height edits',()=>{
 const p=createProject({name:'Natural',width:500,length:500});
 const plan=sample('tunnel'),strokes=tunnelExcavation({x:-7,z:0},{x:7,z:0},plan.spec,height);
 assert.ok(strokes.length>1&&strokes.length<=25);
 const bus=new CommandBus(p),id='natural:demo';
 const chunks=[...new Set(strokes.flatMap(stroke=>affectedChunkIds(p.world,stroke.x,stroke.z,stroke.radius)))];
 editDocument(bus,'Tunnel terrain',chunks,d=>{
   for(const [i,stroke]of strokes.entries())putTerrainEdit(d,{...stroke,id:id+':'+i});
 });
 assert.ok(Object.keys(p.chunkIndex).length>0);parseProject(structuredClone(p));
 bus.undo();assert.equal(Object.values(p.chunks).flatMap(c=>c.terrainEdits).length,0);
 bus.redo();assert.equal(Object.values(p.chunks).flatMap(c=>c.terrainEdits).length,strokes.length);
});
test('natural structure survives V3 source validation and runtime placement projection',()=>{
 const p=createProject({name:'Natural',width:500,length:500}),plan=sample('arch');
 p.assets[NATURAL_ASSET_ID]={id:NATURAL_ASSET_ID,name:'Structure naturelle rocheuse',type:'procedural',license:'project-original',source:'Little World procedural stone vault (local low-poly)'};
 putEntity(p,{id:'natural-1',kind:'prop',name:'Arche rocheuse',ownerChunkId:chunkAt(p.world,0,0),
   components:{Transform:{type:'Transform',position:{x:0,y:plan.y,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
   Visual:{type:'Visual',assetId:NATURAL_ASSET_ID},NaturalStructure:plan.spec}});
 parseProject(structuredClone(p));
 const resolved=Object.values(p.chunks).flatMap(c=>Object.values(c.entities)),placed=runtimeContent(resolved,p.libraries).placements;
 assert.equal(placed[0].naturalStructure.kind,'arch');
 assert.ok(naturalColliders('natural-1',placed[0].naturalStructure,resolved[0].components.Transform).length>0);
});
test('natural procedural source compiles without GLB copy and retains its component',async()=>{
 const p=createProject({name:'Natural compiler',width:500,length:500}),plan=sample('bridge');
 p.assets[NATURAL_ASSET_ID]={id:NATURAL_ASSET_ID,name:'Structure naturelle rocheuse',type:'procedural',license:'project-original',source:'Little World procedural stone vault (local low-poly)'};
 putEntity(p,{id:'natural-2',kind:'prop',name:'Pont naturel',ownerChunkId:chunkAt(p.world,0,0),
   components:{Transform:{type:'Transform',position:{x:0,y:plan.y,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
    Visual:{type:'Visual',assetId:NATURAL_ASSET_ID},NaturalStructure:plan.spec}});
 const result=await compileProject(p,{resolveAsset:localFileAssetResolver()});
 assert.ok(result.manifest.assets.some(a=>a.id===NATURAL_ASSET_ID&&a.type==='procedural'));
 const chunk=result.manifest.chunks.find(c=>c.entityIds.includes('natural-2'));
 assert.equal(JSON.parse(result.files[chunk.url]).entities[0].components.NaturalStructure.kind,'bridge');
});

test('supprimer un tunnel enlève son excavation, Undo restaure les deux sources',()=>{
 const p=createProject({name:'Tunnel lifecycle',width:500,length:500}),plan=sample('tunnel'),id='tunnel:test';
 p.assets[NATURAL_ASSET_ID]={id:NATURAL_ASSET_ID,name:'Structure naturelle rocheuse',type:'procedural',license:'project-original',source:'Little World procedural stone vault (local low-poly)'};
 const strokes=tunnelExcavation({x:-7,z:0},{x:7,z:0},plan.spec,height),chunks=[...new Set(strokes.flatMap(e=>affectedChunkIds(p.world,e.x,e.z,e.radius)))];
 const bus=new CommandBus(p);
 editDocument(bus,'Place tunnel',chunks,d=>{
   for(const [i,stroke]of strokes.entries())putTerrainEdit(d,{...stroke,id:'natural:'+id+':'+i});
   putEntity(d,{id,kind:'prop',name:'Tunnel traversant',ownerChunkId:chunkAt(d.world,0,0),
     components:{Transform:{type:'Transform',position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
     Visual:{type:'Visual',assetId:NATURAL_ASSET_ID},NaturalStructure:plan.spec}});
 });
 const before=Object.values(p.chunks).flatMap(c=>c.terrainEdits).length;
 assert.equal(before,strokes.length);
 const refs=[{kind:'entity',id}],affected=elementChunkIds(p,refs);
 assert.ok(affected.length>=chunks.length);
 const transform=p.chunks[p.entityIndex[id].ownerChunkId].entities[id].components.Transform;
 assert.throws(()=>applyTransforms(p,[{id,transform:{position:{x:1,y:0,z:0},rotation:transform.rotation,scale:transform.scale}}]),/Structures naturelles/);
 assert.throws(()=>duplicateEntities(p,[id],{x:12,y:0,z:0}),/Structures naturelles/);
 editDocument(bus,'Delete tunnel',affected,d=>deleteElements(d,refs));
 assert.equal(p.entityIndex[id],undefined);
 assert.equal(Object.values(p.chunks).flatMap(c=>c.terrainEdits).length,0);
 bus.undo();assert.ok(p.entityIndex[id]);assert.equal(Object.values(p.chunks).flatMap(c=>c.terrainEdits).length,before);
 bus.redo();assert.equal(p.entityIndex[id],undefined);
 parseProject(structuredClone(p));
});
