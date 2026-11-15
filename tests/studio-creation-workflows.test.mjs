import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {captureAssembly,assemblyChunkIds,placeAssembly,assemblyOffset} from '../src/studio-core/assemblies.ts';
import {scatterPoints} from '../src/studio/viewport/scatter-tool.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
const box=(p,id,x,z)=>putEntity(p,{id,name:id,kind:'prop',ownerChunkId:chunkAt(p.world,x,z),
  components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
    Visual:{type:'Visual',assetId:'props.crate'},State:{type:'State',initial:{opened:false}}}});
test('visual assemblies are project-owned and portable, with no copied gameplay state',()=>{
  const p=createProject({name:'Assembly test',width:1000,length:1000});box(p,'one',10,15);box(p,'two',20,15);
  const assembly=captureAssembly(p,['one','two'],'Cabane-test','assembly:1');
  assert.equal(assembly.items.length,2);assert.equal(assembly.items[0].dx,-5);
  assert.equal(assembly.items[0].components.State,undefined);
  const bus=new CommandBus(p);
  editDocument(bus,'Save assembly',[],d=>{d.libraries.assemblies={[assembly.id]:assembly};});
  parseProject(structuredClone(p));
  let created;
  const chunks=assemblyChunkIds(p,assembly,100,120);
  editDocument(bus,'Place assembly',chunks,d=>{created=placeAssembly(d,assembly,100,120,(()=>{let n=0;return ()=>'copy-'+(++n);})());});
  assert.equal(created.length,2);
  assert.equal(p.entityIndex[created[0]].position.x,95);
  assert.equal(p.chunks[p.entityIndex[created[0]].ownerChunkId].entities[created[0]].components.State,undefined);
  bus.undo();assert.equal(p.entityIndex[created[0]],undefined);
  bus.redo();assert.equal(p.entityIndex[created[0]].position.x,95);
});
test('scatter generates bounded repeatable placements with minimum spacing',()=>{
  const settings={palette:['props.crate','nature.rock'],radius:8,density:.04,scaleMin:.8,scaleMax:1.2,seed:42,spacing:2.5};
  const dabs=[{x:0,z:0},{x:5,z:0}];
  const a=scatterPoints(dabs,settings,120),b=scatterPoints(dabs,settings,120);
  assert.deepEqual(a,b);assert.ok(a.length>0&&a.length<=120);
  assert.ok(a.every(p=>settings.palette.includes(p.assetId)&&p.scale>=.8&&p.scale<=1.2));
  for(let i=0;i<a.length;i++)for(let j=0;j<i;j++)
    assert.ok(Math.hypot(a[i].x-a[j].x,a[i].z-a[j].z)>=2.5-1e-8);
});
test('scatter rejects empty palettes and assembly rejects non-visual selections',()=>{
  assert.deepEqual(scatterPoints([{x:0,z:0}],{palette:[],radius:8,density:.04,scaleMin:.8,scaleMax:1.2,seed:42,spacing:2.5}),[]);
  const p=createProject({name:'Empty',width:1000,length:1000});
  assert.throws(()=>captureAssembly(p,[],'Empty'));
});

test('rotated assembly uses rotated offsets and composition of yaw with authored orientation',()=>{
  const q=assemblyOffset(10,0,Math.PI/2);
  assert.ok(Math.abs(q.x)<1e-8&&Math.abs(q.z+10)<1e-8);
  const p=createProject({name:'Rotate',width:1000,length:1000});
  box(p,'one',10,0);box(p,'two',20,0);
  const assembly=captureAssembly(p,['one','two'],'Rotated');
  const sectorIds=assemblyChunkIds(p,assembly,100,100,Math.PI/2);
  assert.ok(sectorIds.length>0);
  const created=placeAssembly(p,assembly,100,100,(()=>{let i=0;return ()=>String(++i)})(),Math.PI/2);
  const first=p.chunks[p.entityIndex[created[0]].ownerChunkId].entities[created[0]];
  assert.ok(Math.abs(first.components.Transform.position.x-100)<1e-8);
  assert.ok(Math.abs(first.components.Transform.position.z-105)<1e-8);
  assert.ok(Math.abs(first.components.Transform.rotation.y-Math.SQRT1_2)<1e-6);
  parseProject(structuredClone(p));
});
