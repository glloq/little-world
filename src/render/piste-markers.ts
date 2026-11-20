/** Piste marking: coloured poles along both edges of every run (French resort colours) and a
 * sign at each start. Two InstancedMeshes for the whole domain; presentation only. */
import * as THREE from 'three';
import {PISTE_COLORS} from '../snow/resort-planner.ts';
import type {SkiAreaV1} from '../snow/ski-area.ts';

export function createPisteMarkers(scene:THREE.Object3D,areas:readonly SkiAreaV1[],height:(x:number,z:number)=>number){
  const poles:{x:number;y:number;z:number;color:number}[]=[],signs:{x:number;y:number;z:number;yaw:number;color:number}[]=[];
  for(const area of areas){
    const color=PISTE_COLORS[area.difficulty??'blue'],pts=area.points;let next=0,acc=0;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],d=Math.hypot(b.x-a.x,b.z-a.z);if(d<.01)continue;
      const nx=-(b.z-a.z)/d,nz=(b.x-a.x)/d,off=area.widthM/2+.8;
      for(;next<=acc+d;next+=20){
        const t=(next-acc)/d,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        for(const side of [-1,1]){const px=x+nx*off*side,pz=z+nz*off*side;poles.push({x:px,y:height(px,pz),z:pz,color});}
      }
      acc+=d;
    }
    const a=pts[0],b=pts[Math.min(3,pts.length-1)],yaw=Math.atan2(b.x-a.x,b.z-a.z),d=Math.hypot(b.x-a.x,b.z-a.z)||1;
    const sx=a.x-(b.z-a.z)/d*(area.widthM/2+2),sz=a.z+(b.x-a.x)/d*(area.widthM/2+2);
    signs.push({x:sx,y:height(sx,sz),z:sz,yaw,color});
  }
  const group=new THREE.Group();group.name='PisteMarkers';
  const poleGeometry=new THREE.CylinderGeometry(.09,.1,2.2,5);poleGeometry.translate(0,1.1,0);
  const signGeometry=new THREE.BoxGeometry(1.3,.9,.08);signGeometry.translate(0,2,0);
  const postGeometry=new THREE.CylinderGeometry(.07,.07,2,5);postGeometry.translate(0,1,0);
  const material=new THREE.MeshLambertMaterial({color:0xffffff});
  const wood=new THREE.MeshLambertMaterial({color:0x6b4a2f});
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1),p=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),c=new THREE.Color();
  const make=(geometry:THREE.BufferGeometry,mat:THREE.Material,items:{x:number;y:number;z:number;yaw?:number;color?:number}[],colored:boolean)=>{
    const mesh=new THREE.InstancedMesh(geometry,mat,Math.max(1,items.length));mesh.count=items.length;mesh.castShadow=false;
    items.forEach((it,i)=>{p.set(it.x,it.y,it.z);q.setFromAxisAngle(up,it.yaw??0);matrix.compose(p,q,one);mesh.setMatrixAt(i,matrix);if(colored)mesh.setColorAt(i,c.setHex(it.color!));});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();group.add(mesh);return mesh;
  };
  make(poleGeometry,material,poles,true);make(signGeometry,material,signs,true);make(postGeometry,wood,signs,false);
  scene.add(group);
  return {poles:poles.length,dispose(){scene.remove(group);poleGeometry.dispose();signGeometry.dispose();postGeometry.dispose();material.dispose();wood.dispose();}};
}
