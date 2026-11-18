import * as THREE from 'three';
import type {Player} from '../player.ts';

/** Low-poly temporary surfboard; visual only. Equipment/physics are owned by Player. */
export function createSurfBoardView(scene:THREE.Object3D){
 const group=new THREE.Group();group.name='HamsterSurfboard';
 const deck=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,1.85,8,1),new THREE.MeshLambertMaterial({color:0xf1c66d,flatShading:true}));
 deck.rotation.x=Math.PI/2;deck.scale.z=.12;group.add(deck);
 const stripe=new THREE.Mesh(new THREE.BoxGeometry(.075,.02,1.35),new THREE.MeshLambertMaterial({color:0x488ca6}));
 stripe.position.y=.06;group.add(stripe);
 group.visible=false;scene.add(group);
 return {
  update(player:Player){
   const visible=player.mode==='surf'||player.surfAirborne===true;
   group.visible=visible;
   if(!visible)return;
   group.position.set(player.position.x,player.position.y-.095,player.position.z);
   group.rotation.y=player.surfHeading??player.heading??0;
   group.rotation.z=0;group.rotation.x=player.surfAirborne?-.08:0;
  },
  dispose(){group.removeFromParent();deck.geometry.dispose();(deck.material as THREE.Material).dispose();
   stripe.geometry.dispose();(stripe.material as THREE.Material).dispose();}
 };
}
