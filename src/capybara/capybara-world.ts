/** Optional bridge between Little World simulation data and the capybara visual.
 * The world's existing simulation owns transforms, collisions, velocity and follow AI.
 * No island-specific spawner, RAF, physics solver or new V3 asset category is introduced.
 */
import * as THREE from 'three';
import { createCapybaraModel, type CapybaraModel, type CapybaraLoadout, type CapybaraState } from './capybara-model.ts';

export interface CapybaraWorldSnapshot {
  /** World coordinates in metres, where y is the authoritative ground/physics height. */
  x:number; y:number; z:number;
  /** Heading around +Y, radians; 0 points toward +X. */
  heading:number;
  /** Signed longitudinal speed from actual world movement in metres/s. */
  groundSpeed:number;
  /** Presentation-only state selected by AI or gameplay. */
  state:CapybaraState;
  loadout:CapybaraLoadout;
}
export interface CapybaraWorldEntity {
  readonly id:string;
  readonly visual:CapybaraModel;
  readonly root:THREE.Group;
  /** Update from the existing simulation tick, then render in its normal loop. */
  update(dt:number,snapshot:CapybaraWorldSnapshot,lookAt?:THREE.Vector3|null):void;
  dispose():void;
}
const isFiniteSnapshot=(s:CapybaraWorldSnapshot):boolean =>
  [s.x,s.y,s.z,s.heading,s.groundSpeed].every(Number.isFinite);
export async function createCapybaraWorldEntity(
  parent:THREE.Object3D,id:string,initial:CapybaraWorldSnapshot,
):Promise<CapybaraWorldEntity>{
  if(!id.trim())throw new Error('Capybara requires a stable world entity id');
  if(!isFiniteSnapshot(initial))throw new Error('Invalid initial capybara transform');
  const visual=await createCapybaraModel(initial.loadout);
  visual.group.name='CapybaraWorldEntity:'+id;
  parent.add(visual.group);
  let disposed=false;
  const update=(dt:number,s:CapybaraWorldSnapshot,lookAt:THREE.Vector3|null=null):void=>{
    if(disposed||!isFiniteSnapshot(s))return;
    visual.group.position.set(s.x,s.y,s.z);
    // Three.js +Y rotation sends +X toward -Z; input heading follows that convention.
    visual.group.rotation.y=s.heading;
    if(visual.loadout!==s.loadout)visual.setLoadout(s.loadout);
    if(visual.state!==s.state)visual.setState(s.state);
    visual.setLookTarget(lookAt);
    // Each entity uses its own animation phase; simulation movement is authoritative.
    visual.update(Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1)),s.groundSpeed);
  };
  update(0,initial);
  return {id,visual,root:visual.group,update,
    dispose(){
      if(disposed)return;
      disposed=true;
      visual.group.removeFromParent();
      visual.dispose();
    },
  };
}
/** A bounded, explicit collection. The host may call update only near the camera.
 * Intended for connection to current NPC/entity scheduling, not a duplicate scheduler.
 */
export function createCapybaraWorldCollection(parent:THREE.Object3D){
  const entities=new Map<string,CapybaraWorldEntity>();
  return {
    entities,
    async add(id:string,snapshot:CapybaraWorldSnapshot){
      if(entities.has(id))throw new Error('Duplicate capybara id: '+id);
      const entity=await createCapybaraWorldEntity(parent,id,snapshot);
      if(entities.has(id)){entity.dispose();throw new Error('Duplicate capybara id: '+id);}
      entities.set(id,entity);
      return entity;
    },
    remove(id:string){
      const entity=entities.get(id);
      if(!entity)return false;
      entity.dispose();entities.delete(id);return true;
    },
    update(dt:number,snapshots:ReadonlyMap<string,CapybaraWorldSnapshot>,lookAt?:THREE.Vector3|null){
      for(const [id,entity]of entities){
        const snapshot=snapshots.get(id);
        if(snapshot)entity.update(dt,snapshot,lookAt);
      }
    },
    dispose(){
      for(const e of entities.values())e.dispose();
      entities.clear();
    },
  };
}
