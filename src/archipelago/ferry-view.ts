/** Tiny independent ferry scene object: never instantiates a second world or a physics body. */
import * as THREE from 'three';
export function createFerryView(scene: THREE.Scene, at: {x:number;y:number;z:number}) {
  const root = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({color:0x806044,flatShading:true});
  const trim = new THREE.MeshLambertMaterial({color:0xb38b58,flatShading:true});
  const fur = new THREE.MeshLambertMaterial({color:0xa67b58,flatShading:true});
  const cream = new THREE.MeshLambertMaterial({color:0xf2d4a9,flatShading:true});
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);root.add(m);return m;
  };
  const hull=add(new THREE.SphereGeometry(1,8,5),wood,0,0,0);
  hull.scale.set(1.05,.45,2.6);
  add(new THREE.BoxGeometry(1.65,.12,.5),trim,0,.26,.12);
  add(new THREE.CylinderGeometry(.37,.48,.7,7),fur,0,.8,.5);
  add(new THREE.SphereGeometry(.36,7,5),cream,0,1.39,.5);
  for(const x of [-.26,.26])add(new THREE.SphereGeometry(.12,6,4),fur,x,1.67,.47);
  const oar=add(new THREE.BoxGeometry(.12,.09,3.0),trim,0,.5,.1);oar.rotation.y=Math.PI/2;
  root.position.set(at.x,at.y,at.z);
  scene.add(root);
  return {
    root,
    setPresent(present:boolean){root.visible=present;},
    update(seconds:number){if(root.visible){root.position.y=at.y+Math.sin(seconds*1.65)*.055;oar.rotation.z=Math.sin(seconds*1.6)*.15;}},
    dispose(){scene.remove(root);root.traverse(node=>{if((node as THREE.Mesh).isMesh)(node as THREE.Mesh).geometry.dispose();});for(const material of [wood,trim,fur,cream])material.dispose();},
  };
}
