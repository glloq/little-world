/** Low-poly hamster mine helmet and a single movable, shadow-free headlamp.
 * Attach to the existing animated head socket; do not add a light per mesh or
 * per frame. The beam points along the hamster's local +Z forward axis.
 * The accessory is visible only while equipped in a mine. */
import * as THREE from 'three';

export interface MineHelmetView{
  setActive(enabled:boolean):void;
  readonly active:boolean;
  dispose():void;
}
export function createMineHelmet(headSocket:THREE.Object3D):MineHelmetView{
  const root=new THREE.Group();root.name='MineHelmet';root.position.set(0,-.13,0);
  headSocket.add(root);
  const metal=new THREE.MeshLambertMaterial({color:0x9e904e,flatShading:true});
  const rim=new THREE.MeshLambertMaterial({color:0x4f493b,flatShading:true});
  const glass=new THREE.MeshBasicMaterial({color:0xffeac2});
  const dome=new THREE.Mesh(new THREE.SphereGeometry(.43,10,5,0,Math.PI*2,0,Math.PI/2),metal);
  dome.scale.set(1,.53,1);dome.name='HelmetShell';root.add(dome);
  const edge=new THREE.Mesh(new THREE.CylinderGeometry(.445,.445,.065,10),rim);
  edge.position.y=.02;edge.name='HelmetEdge';root.add(edge);
  const brim=new THREE.Mesh(new THREE.BoxGeometry(.59,.045,.16),metal);
  brim.position.set(0,.005,.43);brim.name='HelmetBrim';root.add(brim);
  const housing=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.10,8),rim);
  housing.rotation.x=Math.PI/2;housing.position.set(0,.16,.47);housing.name='HeadlampHousing';root.add(housing);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.13,8),glass);
  lens.position.set(0,.16,.53);lens.name='HeadlampLens';root.add(lens);
  // One spotlight only, no dynamic shadow map. The luminous lens is visible even
  // when the environment's existing pool allocates its lights elsewhere.
  const lamp=new THREE.SpotLight(0xffe7ab,19,12,Math.PI/4,.8,2);
  lamp.name='MinerHeadlamp';lamp.castShadow=false;
  lamp.position.set(0,.16,.55);
  lamp.target.position.set(0,.10,5);
  root.add(lamp,lamp.target);
  root.visible=false;
  let active=false;
  return {
    get active(){return active;},
    setActive(enabled:boolean){
      if(enabled===active)return;
      active=enabled;root.visible=enabled;
    },
    dispose(){
      root.removeFromParent();
      for(const o of root.children){const mesh=o as THREE.Mesh;if(mesh.isMesh)mesh.geometry.dispose();}
      metal.dispose();rim.dispose();glass.dispose();lamp.dispose();
    },
  };
}
