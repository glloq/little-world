/** Reuses the APPROVED maritime market N1 GLB; only the mine badge changes.
 * The model remains untouched on disk and is cached once for every mine/level.
 * No extra mesh generator, dynamic texture or maritime inventory logic. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {linearizeVertexColors} from '../world-production/species-library.ts';
import type {MineHubLayout} from './mine-hub.ts';

export const MINE_STAND_SOURCE='models/commerce-portuaire/port-trade-n1-v1.glb';
let template:Promise<THREE.Object3D|null>|null=null;
function loadTemplate():Promise<THREE.Object3D|null>{
  if(!template){
    const base=(import.meta as {env?:{BASE_URL?:string}}).env?.BASE_URL??'/';
    template=new GLTFLoader().loadAsync(base+MINE_STAND_SOURCE)
      .then(gltf=>{linearizeVertexColors(gltf.scene);return gltf.scene;})
      .catch(error=>{console.warn('Stand N1 réutilisé pour la mine indisponible',error);return null;});
  }
  return template;
}
export function removeMaritimeSign(scene:THREE.Object3D):number{
  let removed=0;
  scene.traverse(node=>{
    // The original GLB exposes a separate "sign" mesh (see N1 asset manifest).
    // Hide that original hexagonal cargo badge; retain cloth, wooden frame and crates.
    if(/(?:^|[_\s.-])(sign|logo|emblem|enseigne)(?:$|[_\s.-])/i.test(node.name)){
      node.visible=false;removed++;
    }
  });
  return removed;
}
export async function attachMineStand(model:THREE.Group,hub:MineHubLayout):Promise<boolean>{
  const base=await loadTemplate();
  if(!base||!model.parent)return false;
  const stand=base.clone(true);
  stand.name='MineStand:approved-port-trade-N1';
  stand.userData.mineId=hub.mineId;stand.userData.mineLevelId=hub.levelId;
  removeMaritimeSign(stand);
  // The world kit's front is -Z. Turn it toward the free centre aisle (local +X).
  stand.rotation.y=-Math.PI/2;
  stand.position.set(-7.77,0,.15);
  stand.traverse(obj=>{const mesh=obj as THREE.Mesh;
    if(mesh.isMesh)mesh.userData.mineSharedStandGeometry=true;
  });
  model.add(stand);
  model.userData.tradeStandAsset=MINE_STAND_SOURCE;
  return true;
}
