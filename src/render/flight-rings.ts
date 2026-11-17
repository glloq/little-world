/** Five low-poly torus instances for solo trial rings. Render-only; no physics authority. */
import * as THREE from 'three';
import type {FlightPoint} from '../gameplay/flight-courses.ts';
export function createFlightRings(scene:THREE.Object3D){
 const count=5;
 const geometry=new THREE.TorusGeometry(8,.35,3,16);
 const material=new THREE.MeshBasicMaterial({color:0xf9cf70,side:THREE.DoubleSide,depthWrite:true});
 const mesh=new THREE.InstancedMesh(geometry,material,count);
 mesh.name='FlightTrialRings';mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
 scene.add(mesh);
 const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),rot=new THREE.Quaternion(),scale=new THREE.Vector3();
 const forward=new THREE.Vector3(0,0,1),direction=new THREE.Vector3(0,0,1);
 let positions:FlightPoint[]=[];
 let current=0;
 const update=()=>{
  const n=Math.min(count,positions.length);
  for(let i=0;i<n;i++){
   const p=positions[i];pos.set(p.x,p.y,p.z);scale.setScalar(i<current?0:1);
   matrix.compose(pos,rot,scale);mesh.setMatrixAt(i,matrix);
  }
  mesh.count=n;mesh.visible=n>current;mesh.instanceMatrix.needsUpdate=true;
 };
 return {
  show(rings:readonly FlightPoint[],heading:number){
   positions=rings.slice(0,count);current=0;
   direction.set(Math.sin(heading),0,Math.cos(heading));
   rot.setFromUnitVectors(forward,direction);
   update();
  },
  advance(index:number){current=Math.max(0,Math.min(count,index));update();},
  clear(){positions=[];current=0;mesh.count=0;mesh.visible=false;},
  dispose(){scene.remove(mesh);geometry.dispose();material.dispose();mesh.dispose();}
 };
}
