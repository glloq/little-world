/** Tree trunks as logical colliders (doc 42 §H3): generated trees are not entities, so their
 * trunks are registered in the shared collision world only around the player (36 m), from the
 * SAME deterministic dressing cells as the renderer and the gathering rules. A felled tree is
 * disabled at once (gathering filter). Bounded work: re-synced only after a 6 m move. */
import type {WorldCollisionQuery} from '../physics/collision-world.ts';
import {DRESSING_CELL_M,ITEM_STRIDE,type DressingCell,type DressingKind} from '../geography/dressing.ts';

export const TRUNK_RADIUS_M=36;
/** Trunk box of a tree of GLB scale `s` (m): narrow, a few metres high. */
export const trunkSize=(s:number)=>{const w=Math.max(.4,Math.min(1,.32*s));return {x:w,y:Math.max(2,3.5*s),z:w};};
export function createTreeColliders(deps:{collision:WorldCollisionQuery;cell(cx:number,cz:number):DressingCell;hidden(cx:number,cz:number,kind:DressingKind,index:number):boolean}){
  const active=new Set<string>();let lastX=Infinity,lastZ=Infinity;
  function sync(x:number,z:number){
    lastX=x;lastZ=z;const wanted=new Set<string>(),r=TRUNK_RADIUS_M;
    for(let cz=Math.floor((z-r)/DRESSING_CELL_M);cz<=Math.floor((z+r)/DRESSING_CELL_M);cz++)for(let cx=Math.floor((x-r)/DRESSING_CELL_M);cx<=Math.floor((x+r)/DRESSING_CELL_M);cx++){
      const c=deps.cell(cx,cz);
      for(const kind of ['pine','oak'] as const){const a=c.items[kind];for(let i=0;i<a.length;i+=ITEM_STRIDE){
        if(Math.hypot(a[i]-x,a[i+2]-z)>r)continue;const id=`tree:${cx}:${cz}:${kind}:${i/ITEM_STRIDE}`;wanted.add(id);if(active.has(id))continue;
        const index=i/ITEM_STRIDE,size=trunkSize(a[i+3]);
        deps.collision.add({id,shape:'box',position:{x:a[i],y:a[i+1]-.2,z:a[i+2]},size,enabled:()=>!deps.hidden(cx,cz,kind,index)});active.add(id);}}
    }
    for(const id of active)if(!wanted.has(id)){deps.collision.remove(id);active.delete(id);}
  }
  return {
    update(p:{x:number;z:number},space?:unknown){if(space)return;if(Math.hypot(p.x-lastX,p.z-lastZ)>6)sync(p.x,p.z);},
    get count(){return active.size;},
  };
}
