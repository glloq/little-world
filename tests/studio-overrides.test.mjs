import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,chunkAt,parseProject} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {resolveEntity} from '../src/studio-core/references.ts';
import {materializeComponents} from '../src/studio-core/entity-authoring.ts';
test('editing a resolved instance transform supersedes old overrides and moves spatial ownership without losing prefab identity',()=>{
 const p=createProject({name:'Instance'}),id='instance';p.libraries.prefabs.base={id:'base',name:'Caisse',version:1,components:{Visual:{type:'Visual',assetId:'props.crate'}},variants:{tall:[{component:'Visual',field:'assetId',value:'props.lantern'}]}};
 const entity={id,name:'Instance',kind:'prop',prefabId:'base',variantId:'tall',ownerChunkId:chunkAt(p.world,-24,0),components:{Transform:{type:'Transform',position:{x:-24,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}}},overrides:[{component:'Transform',field:'position.x',value:-25},{component:'Visual',field:'assetId',value:'nature.pine'}]};putEntity(p,entity);const before=structuredClone(entity),edit=materializeComponents(entity,{Transform:resolveEntity(p,entity).components.Transform});edit.components.Transform.position.x=80;edit.ownerChunkId=chunkAt(p.world,80,0);putEntity(p,edit);const valid=parseProject(p),resolved=resolveEntity(valid,edit);assert.equal(resolved.components.Transform.position.x,80);assert.equal(resolved.components.Visual.assetId,'nature.pine');assert.equal(edit.prefabId,'base');assert.equal(edit.variantId,'tall');assert.equal(edit.overrides.length,1);assert.deepEqual(entity,before);assert.equal(valid.chunks[entity.ownerChunkId].entities[id],undefined);
});
