import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {captureAssembly,placeAssembly} from '../src/studio-core/assemblies.ts';
import {assemblyInstanceRoot,instanceMemberIds,overrideAssemblyVisual,updateAssemblyTemplateVisual,setInstanceParent} from '../src/studio-core/assembly-instances.ts';
import {resolveEntity} from '../src/studio-core/references.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
function make(){
 const p=createProject({name:'Prefab hierarchy',width:1000,length:1000});
 for(const [id,x] of [['parent',0],['child',5]]){
  putEntity(p,{id,kind:'prop',name:id,ownerChunkId:chunkAt(p.world,x,0),
   ...(id==='child'?{parentId:'parent'}:{}),
   components:{Transform:{type:'Transform',position:{x,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
    Visual:{type:'Visual',assetId:'props.crate'}}});
 }
 return p;
}
test('capture groupe V2 et plusieurs instances avec prefab et parent stable',()=>{
 const p=make(),template=captureAssembly(p,['parent','child'],'Décoration');
 assert.equal(template.version,2);assert.equal(template.items[1].parentKey,template.items[0].key);
 p.libraries.assemblies={[template.id]:template};
 const a=placeAssembly(p,template,50,50,(()=>{let n=0;return ()=>'one-'+(++n)})());
 const b=placeAssembly(p,template,100,100,(()=>{let n=0;return ()=>'two-'+(++n)})());
 assert.equal(p.chunks[p.entityIndex[a[1]].ownerChunkId].entities[a[1]].parentId,a[0]);
 assert.equal(assemblyInstanceRoot(p,a[1]),a[0]);
 assert.deepEqual(instanceMemberIds(p,a[0]),a);
 assert.equal(p.chunks[p.entityIndex[a[0]].ownerChunkId].entities[a[0]].prefabId,
              p.chunks[p.entityIndex[b[0]].ownerChunkId].entities[b[0]].prefabId);
 parseProject(structuredClone(p));
});
test('modification locale Visual isolée, changement template propagé aux autres copies',()=>{
 const p=make(),template=captureAssembly(p,['parent','child'],'Décoration');
 p.libraries.assemblies={[template.id]:template};
 const a=placeAssembly(p,template,50,50,(()=>{let n=0;return ()=>'one-'+(++n)})());
 const b=placeAssembly(p,template,100,100,(()=>{let n=0;return ()=>'two-'+(++n)})());
 overrideAssemblyVisual(p,a[1],'props.crate');
 updateAssemblyTemplateVisual(p,b[1],'nature.pine');
 const visual=id=>{const e=p.entityIndex[id],v=p.chunks[e.ownerChunkId].entities[id];return resolveEntity(p,v).components.Visual.assetId;};
 assert.equal(visual(a[1]),'props.crate');
 assert.equal(visual(b[1]),'nature.pine');
 assert.equal(p.libraries.assemblies[template.id].items[1].components.Visual.assetId,'nature.pine');
 parseProject(structuredClone(p));
});
test('legacy assemblages V1 restent instanciables sans template partagé',()=>{
 const p=make(),template=captureAssembly(p,['parent','child'],'Old');
 template.version=1;template.items=template.items.map(({kind,name,dx,dz,components})=>({kind,name,dx,dz,components}));
 const ids=placeAssembly(p,template,50,50,(()=>{let n=0;return ()=>'old-'+(++n)})());
 const source=p.chunks[p.entityIndex[ids[0]].ownerChunkId].entities[ids[0]];
 assert.equal(source.prefabId,undefined);assert.ok(source.components.Visual);
 parseProject(structuredClone(p));
});

test('la sélection enfant puis parent conserve un graphe non cyclique',()=>{
 const p=make(),template=captureAssembly(p,['child','parent'],'Inversé');
 assert.equal(template.items[0].name,'parent');
 assert.equal(template.items[1].parentKey,template.items[0].key);
 const ids=placeAssembly(p,template,50,50,(()=>{let n=0;return ()=>'inverse-'+(++n)})());
 assert.equal(assemblyInstanceRoot(p,ids[1]),ids[0]);
});
test('changer la hiérarchie d’une copie ne modifie pas le prefab partagé',()=>{
 const p=make(),template=captureAssembly(p,['parent','child'],'Parentage');
 const first=placeAssembly(p,template,50,50,(()=>{let n=0;return ()=>'first-'+(++n)})());
 const other=placeAssembly(p,template,100,100,(()=>{let n=0;return ()=>'second-'+(++n)})());
 assert.throws(()=>setInstanceParent(p,first[0],first[1]),/boucle/);
 assert.throws(()=>setInstanceParent(p,first[1],other[0]),/autre instance/);
 assert.equal(p.chunks[p.entityIndex[other[1]].ownerChunkId].entities[other[1]].parentId,other[0]);
});

test('shared prefab edits generate undoable patches without mutating original nested libraries',()=>{
 const p=make(),template=captureAssembly(p,['parent','child'],'Transaction prefab');
 p.libraries.assemblies={[template.id]:template};
 const a=placeAssembly(p,template,50,50,(()=>{let n=0;return ()=>'one-'+(++n)})());
 const b=placeAssembly(p,template,100,100,(()=>{let n=0;return ()=>'two-'+(++n)})());
 overrideAssemblyVisual(p,a[1],'props.crate');
 const before=structuredClone(p);
 const bus=new CommandBus(p);
 const owners=[...new Set(Object.values(p.entityIndex).map(e=>e.ownerChunkId))];
 const tx=editDocument(bus,'Modifier un modèle prefab',owners,draft=>updateAssemblyTemplateVisual(draft,b[1],'nature.pine'));
 assert.ok(tx,'Shared template change must produce a real Undo transaction');
 assert.ok(tx.patches.some(patch=>patch.path[0]==='libraries'&&patch.path[1]==='prefabs'));
 assert.ok(tx.patches.some(patch=>patch.path[0]==='libraries'&&patch.path[1]==='assemblies'));
 const visual=id=>{
  const e=p.entityIndex[id],source=p.chunks[e.ownerChunkId]?.entities[id];
  return resolveEntity(p,source).components.Visual.assetId;
 };
 assert.equal(visual(a[1]),'props.crate');
 assert.equal(visual(b[1]),'nature.pine');
 assert.equal(bus.undo(),true);
 assert.deepEqual(p,before,'Undo must restore prefabs, libraries and entity indices');
 assert.equal(bus.redo(),true);
 assert.equal(visual(b[1]),'nature.pine');
 parseProject(structuredClone(p));
});
