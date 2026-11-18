/** Low-poly chairlift: static pylons/cables, one instanced seat mesh (no moving colliders). */
import * as THREE from 'three';
import {seatCount,seatPosition,type SkiLift} from './ski-lift.ts';
export function createSkiLiftView(scene:THREE.Scene,lift:SkiLift){
  const root=new THREE.Group();root.name='SnowChairlift';
  const steel=new THREE.MeshLambertMaterial({color:0x70818a,flatShading:true});
  const chairMat=new THREE.MeshLambertMaterial({color:0xcf6244,flatShading:true});
  const cableMat=new THREE.LineBasicMaterial({color:0x303a43});
  const legGeo=new THREE.CylinderGeometry(.17,.22,1,5),stationGeo=new THREE.BoxGeometry(3,.35,3);
  for(let i=0;i<lift.path.length;i++){
    const p=lift.path[i],height= Math.max(3,p.y-(i===0?lift.path[0].y:Math.min(lift.path[i-1].y,p.y-5))+2);
    const mast=new THREE.Mesh(legGeo,steel);mast.scale.y=height;mast.position.set(p.x,p.y-height/2,p.z);root.add(mast);
    if(i===0||i===lift.path.length-1){
      const platform=new THREE.Mesh(stationGeo,steel);platform.position.set(p.x,p.y-2,p.z);root.add(platform);
    }
  }
  const positions:THREE.Vector3[]=lift.path.map(p=>new THREE.Vector3(p.x,p.y,p.z));
  const cable=new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions),cableMat);root.add(cable);
  const seats=seatCount(lift),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1.1,.17,.55),chairMat,seats);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=false;root.add(mesh);
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),p=new THREE.Vector3();
  scene.add(root);
  return {
    update(time:number){for(let i=0;i<seats;i++){const s=seatPosition(lift,time,i);p.set(s.x,s.y,s.z);matrix.compose(p,q,scale);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;},
    dispose(){scene.remove(root);root.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)m.geometry.dispose();if((o as THREE.Line).isLine)(o as THREE.Line).geometry.dispose();});steel.dispose();chairMat.dispose();cableMat.dispose();},
  };
}
