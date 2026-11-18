/** N1 harbour scene: approved stand GLB + dock GLBs + approved rowboat + two
 * existing hamster rigs. Rendering only; all trade/ferry authority stays in gameplay.
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildHamster} from '../hamster/hamster.ts';
import {createAsset} from '../world.ts';
import type {Player} from '../player.ts';
import {assembleDock} from '../structures/assemble-dock.mjs';
import {portActorPresence,type PortN1Layout} from './port-n1-plan.ts';

export function createPortN1View(scene:THREE.Scene,plan:PortN1Layout,baseUrl:string){
  const root=new THREE.Group();root.name='port-n1-generated';
  root.position.set(plan.shore.x,0,plan.shore.z);root.rotation.y=plan.heading;
  scene.add(root);
  const absolute=(p:{x:number;y:number;z:number})=>{
    const dx=p.x-plan.shore.x,dz=p.z-plan.shore.z;
    const c=Math.cos(plan.heading),s=Math.sin(plan.heading);
    return new THREE.Vector3(dx*c-dz*s,p.y,dx*s+dz*c);
  };
  let disposed=false,present=false;
  const boat=createAsset('boat.rowboat_wood');boat.name='Ferry rowboat (approved GLB LOD)';
  boat.position.copy(absolute(plan.boat));root.add(boat);
  // Preserve original GLB: it has no cargo, and its hexagonal sign is already modelled.
  const stall=new THREE.Group();stall.name='Trade stand N1 V1 (approved GLB)';
  stall.position.copy(absolute(plan.stand));root.add(stall);
  const loader=new GLTFLoader();
  void loader.loadAsync(baseUrl+'models/commerce-portuaire/port-trade-n1-v1.glb').then(gltf=>{
    if(disposed)return;
    stall.add(gltf.scene);
  }).catch(error=>{if(!disposed)console.warn('Stand N1 3D indisponible',error);});
  // Do not create a second dock kit: use exactly the existing 2m-grid instance assembler.
  void assembleDock({
    cells:[[0,0],[0,1],[0,2]],
    assetBaseUrl:baseUrl+'models/structures/dock/',
    lod:0,
    bollards:[{tile:[0,2],offset:[.52,.5]}],
    ramps:[],
  }).then(dock=>{
    if(disposed)return;
    dock.name='Dock N1 real modular GLBs';
    dock.position.set(0,plan.dockBaseY,1);root.add(dock);
  }).catch(error=>{if(!disposed)console.warn('Ponton N1 indisponible',error);});
  const merchant=buildHamster(),rower=buildHamster();
  merchant.group.name='Merchant (N1 / ferry hours)';
  rower.group.name='Rower (on quay)';
  merchant.setAppearance({hat:true,backpack:false,neckwear:'pendant',emotion:'happy'});
  rower.setAppearance({hat:true,backpack:false,neckwear:'scarf',emotion:'happy'});
  merchant.group.position.copy(absolute(plan.vendor));
  rower.group.position.copy(absolute(plan.rower));
  // Both face the player on the promenade; the merchant stands behind the counter.
  merchant.group.rotation.y=0;
  rower.group.rotation.y=-Math.PI/2;
  root.add(merchant.group,rower.group);
  const makePlayer=(p:THREE.Vector3):Player=>({
    position:p.clone(),velocity:new THREE.Vector3(),mode:'ground',oxygen:90,glideReady:false,
  });
  const merchantPlayer=makePlayer(merchant.group.position);
  const rowerPlayer=makePlayer(rower.group.position);
  function setPresent(isPresent:boolean){
    present=isPresent;
    boat.visible=isPresent;
    const actors=portActorPresence(1,isPresent);
    merchant.group.visible=actors.merchant;
    rower.group.visible=actors.rower;
  }
  setPresent(false);
  return {
    root,
    setPresent,
    update(time:number,viewer?:{x:number;z:number}){
      if(disposed)return;
      if(present){
        boat.position.y=plan.boat.y+Math.sin(time*1.6)*.045;
        boat.rotation.z=Math.sin(time*.9)*.012;
      }
      const close=!viewer||Math.hypot(plan.shore.x-viewer.x,plan.shore.z-viewer.z)<90;
      const actors=portActorPresence(1,present);
      merchant.group.visible=actors.merchant&&close;
      rower.group.visible=actors.rower&&close;
      if(!close||!present)return;
      merchant.update(merchantPlayer,1/30,time);
      rower.update(rowerPlayer,1/30,time);
    },
    dispose(){
      if(disposed)return;
      disposed=true;boat.userData.disposed=true;
      merchant.dispose();rower.dispose();root.removeFromParent();
      // Shared meshes in the asset registry / dock loader belong to their caches.
      // They must not be disposed here when another island's instance can reuse them.
    },
  };
}
