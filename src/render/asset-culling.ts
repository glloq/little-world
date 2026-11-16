/** Conservative parent-level culling, from all registry LOD bounds. Near objects and
 * animated owners keep their existing visibility; collisions and gameplay never read this. */
import * as THREE from 'three';
import {worldAsset} from '../world-production/registry.ts';
const local=new Map<string,THREE.Sphere>();
const scratch=new THREE.Sphere();
export function assetInFrustum(assetId:string,object:THREE.Object3D,frustum:THREE.Frustum):boolean{
 if(object.userData.dynamicVisual||assetId==='architecture.lighthouse'||assetId==='architecture.windmill_stone'||assetId==='architecture.watermill_log_stone'||assetId.startsWith('boat.'))return true;
 let bounds=local.get(assetId);if(!bounds){const a=worldAsset(assetId);if(!a?.lods.length)return true;const box=new THREE.Box3();for(const lod of a.lods){box.expandByPoint(new THREE.Vector3().fromArray(lod.bounds.min));box.expandByPoint(new THREE.Vector3().fromArray(lod.bounds.max));}bounds=box.getBoundingSphere(new THREE.Sphere());local.set(assetId,bounds);}
 // Placement coordinates already are world coordinates (the shared world root is identity).
 scratch.center.copy(bounds.center).multiply(object.scale).applyQuaternion(object.quaternion).add(object.position);
 scratch.radius=bounds.radius*Math.max(Math.abs(object.scale.x),Math.abs(object.scale.y),Math.abs(object.scale.z))+2;
 return frustum.intersectsSphere(scratch);
}
