import * as THREE from 'three';
import type {Player} from '../player.ts';
import type {SurfWaveSample} from '../surf/wave-field.ts';

/** Low-poly temporary surfboard; visual only. Equipment/physics are owned by Player. */
export function createSurfBoardView(scene:THREE.Object3D){
 const group=new THREE.Group();group.name='HamsterSurfboard';
 const deck=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,1.85,8,1),new THREE.MeshLambertMaterial({color:0xf1c66d,flatShading:true}));
 deck.rotation.x=Math.PI/2;deck.scale.z=.12;group.add(deck);
 const stripe=new THREE.Mesh(new THREE.BoxGeometry(.075,.02,1.35),new THREE.MeshLambertMaterial({color:0x488ca6}));
 stripe.position.y=.06;group.add(stripe);
 const fin=new THREE.Mesh(new THREE.ConeGeometry(.12,.32,3),
   new THREE.MeshLambertMaterial({color:0x26647b,flatShading:true}));
 fin.position.set(0,-.16,-.65);fin.rotation.z=Math.PI;
 group.add(fin);
 // Reuse scratch vectors for rail pitch and bank, no per-frame allocations.
 const up=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3(),
  basis=new THREE.Matrix4();
 group.visible=false;scene.add(group);
 return {
  update(player:Player,renderPosition?:THREE.Vector3,wave?:SurfWaveSample|null){
   const visible=player.mode==='surf'||player.surfAirborne===true;
   group.visible=visible;
   if(!visible)return;
   const pose=renderPosition??player.position;
   group.position.set(pose.x,pose.y-.095,pose.z);
   const heading=player.surfHeading??player.heading??0;
   if(wave&&!player.surfAirborne){
     up.set(wave.normalX,wave.normalY,wave.normalZ).normalize();
     forward.set(Math.sin(heading),0,Math.cos(heading));
     forward.addScaledVector(up,-forward.dot(up)).normalize();
     right.crossVectors(up,forward).normalize();
     forward.crossVectors(right,up).normalize();
     basis.makeBasis(right,up,forward);
     group.quaternion.setFromRotationMatrix(basis);
   }else group.rotation.set(player.surfAirborne?-.12:0,heading,0);
  },
  dispose(){group.removeFromParent();deck.geometry.dispose();(deck.material as THREE.Material).dispose();
   stripe.geometry.dispose();(stripe.material as THREE.Material).dispose();
   fin.geometry.dispose();(fin.material as THREE.Material).dispose();}
 };
}
