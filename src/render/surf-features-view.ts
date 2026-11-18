import * as THREE from 'three';
import type {SurfFeature} from '../surf/surf-features.ts';
/** Fixed low-poly feedback for surf boosts, kickers and marker buoys. */
export function createSurfFeaturesView(scene:THREE.Object3D,features:readonly SurfFeature[],seaLevel:number){
 const group=new THREE.Group();group.name='SurfCourseFeatures';
 for(const f of features){
  const item=new THREE.Group();item.position.set(f.x,seaLevel+.25,f.z);
  item.rotation.y=Math.atan2(f.dirX,f.dirZ);
  let mesh:THREE.Mesh;
  if(f.kind==='ramp'){
   const vertices=new Float32Array([-2,0,-3,2,0,-3,-2,1.3,3,2,1.3,3]);
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
   geometry.setIndex([0,2,1,1,2,3]);
   geometry.computeVertexNormals();
   mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:0xc69768,side:THREE.DoubleSide}));
  }else if(f.kind==='boost'){
   mesh=new THREE.Mesh(new THREE.RingGeometry(1.3,2.4,12),
     new THREE.MeshBasicMaterial({color:0x9ae9ad,side:THREE.DoubleSide}));
   mesh.rotation.x=-Math.PI/2;mesh.position.y=.08;
  }else{
   mesh=new THREE.Mesh(new THREE.CylinderGeometry(.65,.7,1.3,7),
     new THREE.MeshLambertMaterial({color:0xf1b65f,flatShading:true}));
   mesh.position.y=.5;
  }
  mesh.castShadow=false;mesh.receiveShadow=false;item.add(mesh);group.add(item);
 }
 scene.add(group);
 return {group,dispose(){group.traverse(o=>{
   const mesh=o as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();
   if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();
  });group.removeFromParent();}};
}
