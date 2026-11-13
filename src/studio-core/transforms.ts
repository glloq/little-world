/** Pure authoring operations on entity transforms, run inside one StudioSession.change
 * (= one Undo/Redo transaction). Stable V3 IDs are kept; owner sectors follow positions. */
import type {ComponentMap,EntityDefinitionV3,ProjectDocument,TransformComponent,Vector3} from './types.ts';
import {chunkAt} from './schema.ts';
import {putEntity,removeEntity} from './source.ts';
import {resolveEntity} from './references.ts';
import {materializeComponents} from './entity-authoring.ts';

export interface TransformValue {position:Vector3;rotation:{x:number;y:number;z:number;w:number};scale:Vector3}
export interface TransformUpdate {id:string;transform:TransformValue}

export function entityTransform(project:ProjectDocument,id:string):TransformValue{
  const index=project.entityIndex[id];if(!index)throw Error('Entité inconnue : '+id);
  const source=project.chunks[index.ownerChunkId]?.entities[id];if(!source)throw Error('Charger le secteur de '+id);
  const t=resolveEntity(project,source).components.Transform;if(!t)throw Error('Entité sans transformation');
  return {position:{...t.position},rotation:{...t.rotation},scale:{...t.scale}};
}
/** Sectors to hydrate/clone for a set of updates: current owners and destination owners. */
export function transformChunkIds(project:ProjectDocument,updates:TransformUpdate[]):string[]{
  const ids=new Set<string>();
  for(const u of updates){const index=project.entityIndex[u.id];if(index)ids.add(index.ownerChunkId);ids.add(chunkAt(project.world,clampX(project,u.transform.position.x),clampZ(project,u.transform.position.z)));}
  return [...ids];
}
const clampX=(p:ProjectDocument,x:number)=>Math.min(p.world.bounds.maxX,Math.max(p.world.bounds.minX,x));
const clampZ=(p:ProjectDocument,z:number)=>Math.min(p.world.bounds.maxZ,Math.max(p.world.bounds.minZ,z));
function normalized(t:TransformValue):TransformComponent{
  const q=t.rotation,n=Math.hypot(q.x,q.y,q.z,q.w)||1;
  for(const v of [t.position.x,t.position.y,t.position.z,t.scale.x,t.scale.y,t.scale.z])if(!Number.isFinite(v))throw Error('Transformation non finie');
  const scale=(v:number)=>Math.sign(v||1)*Math.min(100,Math.max(.05,Math.abs(v)));
  return {type:'Transform',position:{...t.position},rotation:{x:q.x/n,y:q.y/n,z:q.z/n,w:q.w/n},scale:{x:scale(t.scale.x),y:scale(t.scale.y),z:scale(t.scale.z)}};
}
/** Apply complete transforms; an entity crossing a sector boundary changes owner, never ID. */
export function applyTransforms(draft:ProjectDocument,updates:TransformUpdate[]):void{
  for(const u of updates){
    const index=draft.entityIndex[u.id];if(!index)throw Error('Entité supprimée : '+u.id);
    const source=draft.chunks[index.ownerChunkId]?.entities[u.id];if(!source)throw Error('Charger le secteur de '+u.id);
    const t=normalized(u.transform);t.position.x=clampX(draft,t.position.x);t.position.z=clampZ(draft,t.position.z);
    const entity=materializeComponents(source,{Transform:t});entity.ownerChunkId=chunkAt(draft.world,t.position.x,t.position.z);putEntity(draft,entity);
  }
}
/** Components describing logic or identity-bound links are not duplicated: copies get the look
 * and transform; interactions/dialogues stay attached to the original. */
const NOT_DUPLICATED:(keyof ComponentMap)[]=['Interactable','DialogueActor','State','Persistence','TriggerVolume'];
export function duplicateEntities(draft:ProjectDocument,ids:string[],offset:Vector3,newId:()=>string=()=>crypto.randomUUID()):string[]{
  const created:string[]=[];
  for(const id of ids){
    const index=draft.entityIndex[id],source=index?draft.chunks[index.ownerChunkId]?.entities[id]:undefined;if(!source)throw Error('Charger le secteur de '+id);
    const resolved=resolveEntity(draft,source),copy:EntityDefinitionV3=structuredClone(source),copyId=newId();
    copy.id=copyId;delete copy.parentId;
    for(const key of NOT_DUPLICATED){delete copy.components[key];if(copy.overrides)copy.overrides=copy.overrides.filter(o=>o.component!==key);}
    const t=normalized({...resolved.components.Transform!});t.position.x=clampX(draft,t.position.x+offset.x);t.position.y+=offset.y;t.position.z=clampZ(draft,t.position.z+offset.z);copy.components.Transform=t;
    if(copy.overrides)copy.overrides=copy.overrides.filter(o=>o.component!=='Transform');
    if(resolved.components.Navigation&&resolved.components.BehaviorRef){
      // A copied character gets its own behaviour entry (same routine), so editing one never edits the other.
      const behaviorId='behavior:'+copyId,kind=draft.libraries.behaviors[resolved.components.Navigation.behaviorId]?.kind??'idle';
      draft.libraries.behaviors={...draft.libraries.behaviors,[behaviorId]:{id:behaviorId,kind}};
      copy.components.Navigation={...resolved.components.Navigation,behaviorId};copy.components.BehaviorRef={type:'BehaviorRef',behaviorId};
      if(copy.overrides)copy.overrides=copy.overrides.filter(o=>o.component!=='Navigation'&&o.component!=='BehaviorRef');
    }
    copy.ownerChunkId=chunkAt(draft.world,t.position.x,t.position.z);putEntity(draft,copy);created.push(copyId);
  }
  return created;
}
export function duplicateChunkIds(project:ProjectDocument,ids:string[],offset:Vector3):string[]{
  return transformChunkIds(project,ids.map(id=>{const t=entityTransform(project,id);return {id,transform:{...t,position:{x:t.position.x+offset.x,y:t.position.y,z:t.position.z+offset.z}}};}));
}
export function deleteEntities(draft:ProjectDocument,ids:string[]):void{for(const id of ids)removeEntity(draft,id);}
/** Height offset back to the ground (Transform.position.y is relative to the terrain). */
export function alignToTerrain(t:TransformValue):TransformValue{return {...t,position:{...t.position,y:0}};}
/** Yaw (Y) rotation as a quaternion, used by placement and the inspector. */
export function yawQuaternion(radians:number){return {x:0,y:Math.sin(radians/2),z:0,w:Math.cos(radians/2)};}
