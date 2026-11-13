import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandBus} from '../src/studio-core/commands.ts';
import {createProject,parseProject,chunkAt,parseWorldV3,parseChunk} from '../src/studio-core/schema.ts';
import {putEntity,putPath,putWater,putTerrainEdit,putBiomeEdit} from '../src/studio-core/source.ts';
import {putZone} from '../src/studio-core/zones.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {elementExists,elementLabel,elementAnchor,elementChunkIds,deleteElements,duplicateElements,moveElements,moveChunkIds,elementDependents,listElements,elementsAt} from '../src/studio-core/elements.ts';
import {SelectionService,defaultStudioContext,parseStudioContext} from '../src/studio-core/context.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';

function project(){
  const p=createProject({name:'Éléments',width:1000,length:1000});
  putEntity(p,{id:'crate',name:'Caisse',kind:'prop',ownerChunkId:chunkAt(p.world,10,10),components:{Transform:{type:'Transform',position:{x:10,y:0,z:10},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'props.crate'}}});
  putPath(p,{id:'path:main',points:[{x:-40,z:0},{x:40,z:0},{x:80,z:30}],width:3,kind:'stone',smooth:true});
  putWater(p,{id:'river',points:[{x:-100,z:-80},{x:100,z:-80}],width:8,level:0,depth:2});
  putZone(p,{id:'zone:farm',kind:'farm-plot',name:'Champ',polygon:[{x:200,z:200},{x:260,z:200},{x:260,z:260},{x:200,z:260}]});
  putTerrainEdit(p,{id:'bump',x:-200,z:150,radius:12,strength:3,mode:'raise',height:3});
  putBiomeEdit(p,{id:'wood',x:-250,z:-250,radius:20,biome:'forest',density:1});
  return p;
}
const validator=p=>new CommandBus(p,(q,ids)=>{parseWorldV3(q.world);for(const id of ids)if(q.chunks[id])parseChunk(q.chunks[id],q.world);});
const ALL=[{kind:'entity',id:'crate'},{kind:'path',id:'path:main'},{kind:'water',id:'river'},{kind:'zone',id:'zone:farm'},{kind:'terrainEdit',id:'bump'},{kind:'biomeEdit',id:'wood'}];

test('every authoring element kind is addressable by its stable V3 id',()=>{
  const p=project();
  for(const ref of ALL){assert.ok(elementExists(p,ref),ref.kind);assert.ok(elementLabel(p,ref).length>2);assert.ok(elementAnchor(p,ref));}
  assert.match(elementLabel(p,{kind:'path',id:'path:main'}),/pavé/);
  assert.equal(elementExists(p,{kind:'path',id:'nope'}),false);assert.equal(elementExists(p,{kind:'mesh',id:'crate'}),false);
  assert.equal(listElements(p).length,6);assert.deepEqual(listElements(p,'',"path").map(v=>v.ref.id),['path:main']);assert.equal(listElements(p,'champ').length,1);
  assert.equal(elementsAt(p,0,1)[0].id,'path:main','ground click on a path');assert.equal(elementsAt(p,0,-81)[0].kind,'water');assert.equal(elementsAt(p,230,230)[0].kind,'zone');assert.equal(elementsAt(p,500,500).length,0);
});
test('move, duplicate and delete any element: one transaction each, undo/redo, ids preserved',()=>{
  const p=project(),bus=validator(p),offset={x:5,z:-5};
  editDocument(bus,'Déplacer',moveChunkIds(p,ALL,offset),d=>moveElements(d,ALL,offset));
  assert.deepEqual(p.libraries.paths['path:main'].points[0],{x:-35,z:-5});assert.equal(p.entityIndex.crate.position.x,15);assert.deepEqual(elementAnchor(p,{kind:'terrainEdit',id:'bump'}),{x:-195,z:145});
  assert.equal(p.libraries.paths['path:main'].kind,'stone','profile kept by a move');
  bus.undo();assert.deepEqual(p.libraries.paths['path:main'].points[0],{x:-40,z:0});assert.equal(p.entityIndex.crate.position.x,10);bus.redo();
  let copies=[];editDocument(bus,'Dupliquer',elementChunkIds(p,ALL,{x:20,z:20}),d=>{copies=duplicateElements(d,ALL,{x:20,z:20});});
  assert.equal(copies.length,6);for(const c of copies){assert.ok(elementExists(p,c));assert.ok(!ALL.some(r=>r.id===c.id),'new id');}
  editDocument(bus,'Supprimer',elementChunkIds(p,ALL),d=>deleteElements(d,ALL));
  for(const ref of ALL)assert.equal(elementExists(p,ref),false,ref.kind);for(const c of copies)assert.ok(elementExists(p,c));
  bus.undo();for(const ref of ALL)assert.ok(elementExists(p,ref),'restored '+ref.kind);
  parseProject(structuredClone(p));
});
test('path identity and profile survive archive export/import and runtime conversion',()=>{
  const p=project(),back=readProjectArchive(writeProjectArchive(p));
  assert.deepEqual(back.libraries.paths['path:main'],p.libraries.paths['path:main']);
  const runtime=toRuntimeWorld(back);assert.equal(runtime.paths[0].kind,'stone');assert.equal(runtime.paths[0].smooth,true);
  assert.throws(()=>putPath(project(),{id:'path:x',points:[{x:0,z:0},{x:10,z:0}],width:3,kind:'asphalt'}),/type inconnu/);
});
test('locks and typed selection persist in the Studio context; deletions report dependents',()=>{
  const p=project(),context=defaultStudioContext(p.manifest.projectId,p.manifest.worldId),s=new SelectionService(context);
  s.setSelection([{kind:'path',id:'path:main'},{kind:'zone',id:'zone:farm'}]);s.setLocked('path:main',true);
  const restored=new SelectionService(parseStudioContext(JSON.parse(JSON.stringify(s.snapshot()))));
  assert.deepEqual(restored.selection.map(v=>v.kind),['path','zone']);assert.ok(restored.isLocked('path:main'));assert.ok(!restored.isLocked('zone:farm'));
  restored.setLocked('path:main',false);assert.ok(!restored.isLocked('path:main'));
  assert.throws(()=>parseStudioContext({...context,locked:'x'}),/invalide/);
  p.libraries.interactions['open']={id:'open',trigger:{type:'onInteract',entityId:'crate'},repeat:'always',persistent:false,sequence:[{type:'showText',text:'?'}]};
  assert.ok(elementDependents(p,[{kind:'entity',id:'crate'}]).length>=1,'interaction depends on the crate');assert.deepEqual(elementDependents(p,[{kind:'path',id:'path:main'}]),[]);
});
