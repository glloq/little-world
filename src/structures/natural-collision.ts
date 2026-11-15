/** Local stone-vault collider decomposition. AABB proxies remain sparse, low-poly
 * graphics do not affect physics. No single box obstructs the opening. */
import {transformedCollider,type CollisionDefinition} from '../physics/definitions.ts';
import {naturalBoxes,type NaturalStructureSpec,validateNaturalStructure} from './natural-structure.ts';
export interface StructuralTransform {
 position:{x:number;y:number;z:number};
 rotation:{x:number;y:number;z:number;w:number};
 scale:{x:number;y:number;z:number};
}
function rotate(v:{x:number;y:number;z:number},q:StructuralTransform['rotation']){
 const {x,y,z,w}=q,tx=2*(y*v.z-z*v.y),ty=2*(z*v.x-x*v.z),tz=2*(x*v.y-y*v.x);
 return {x:v.x+w*tx+(y*tz-z*ty),y:v.y+w*ty+(z*tx-x*tz),z:v.z+w*tz+(x*ty-y*tx)};
}
/** All definitions anchor their vertical offset at the *same* central terrain height,
 * rather than re-sampling beneath each block (which would close the opening on slopes). */
export function naturalColliders(id:string,spec:NaturalStructureSpec,t:StructuralTransform):CollisionDefinition[]{
 validateNaturalStructure(spec);
 return naturalBoxes(spec).map((part,i)=>{
   const local=rotate({x:part.x*t.scale.x,y:part.bottom*t.scale.y,z:part.z*t.scale.z},t.rotation);
   const result=transformedCollider(id+'::natural:'+i,
     {shape:'box',size:{x:part.sx,y:part.sy,z:part.sz}},
     {position:{x:t.position.x+local.x,y:t.position.y+local.y,z:t.position.z+local.z},
       rotation:t.rotation,scale:t.scale});
   result.groundAnchor={x:t.position.x,z:t.position.z};
   return result;
 });
}
export function naturalColliderOwner(id:string):string{
 const split=id.indexOf('::natural:');
 return split===-1?id:id.slice(0,split);
}
