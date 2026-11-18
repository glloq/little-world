/** Instanced, low-poly race gate presentation. Never used for gameplay collision. */
import * as THREE from 'three';
import type {RaceGate} from '../gameplay/races.ts';
export function createRaceGates(scene:THREE.Object3D){
  const maximum=24;
  const ringGeometry=new THREE.TorusGeometry(1,.045,4,18);
  const postGeometry=new THREE.BoxGeometry(1,1,1);
  const ringMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
  const postMaterial=new THREE.MeshBasicMaterial({color:0xffffff});
  const rings=new THREE.InstancedMesh(ringGeometry,ringMaterial,maximum);
  const posts=new THREE.InstancedMesh(postGeometry,postMaterial,maximum*3);
  rings.name='RaceCheckpointRings';posts.name='RaceCheckpointArches';
  rings.castShadow=false;posts.castShadow=false;rings.frustumCulled=false;posts.frustumCulled=false;
  rings.count=0;posts.count=0;scene.add(rings,posts);
  const green=new THREE.Color(0x78d5aa),gold=new THREE.Color(0xf9cf70),blue=new THREE.Color(0x80c3ec);
  const yAxis=new THREE.Vector3(0,1,0),zAxis=new THREE.Vector3(0,0,1);
  const origin=new THREE.Vector3(),right=new THREE.Vector3(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
  const normal=new THREE.Vector3(),q=new THREE.Quaternion(),matrix=new THREE.Matrix4();
  let gates:readonly RaceGate[]=[];let passed=0;
  function update(){
    let r=0,p=0;
    for(let i=passed;i<gates.length;i++){
      const g=gates[i],color=i===passed?green:i===gates.length-1?blue:gold;
      origin.set(g.center.x,g.center.y,g.center.z);
      normal.set(g.normal.x,g.normal.y,g.normal.z);
      right.set(g.normal.z,0,-g.normal.x);
      if(g.shape==='circle'){
        q.setFromUnitVectors(zAxis,normal);
        scale.set(g.width/2,g.height/2,1);
        matrix.compose(origin,q,scale);
        rings.setMatrixAt(r,matrix);rings.setColorAt(r,color);r++;
      }else{
        q.setFromAxisAngle(yAxis,Math.atan2(normal.x,normal.z));
        for(let j=0;j<3;j++){
          if(j<2){
            const sign=j===0?-1:1;
            pos.copy(origin).addScaledVector(right,sign*g.width/2);
            scale.set(.17,g.height,.17);
          }else{
            pos.copy(origin);pos.y+=g.height/2;scale.set(g.width,.17,.17);
          }
          matrix.compose(pos,q,scale);
          posts.setMatrixAt(p,matrix);posts.setColorAt(p,color);p++;
        }
      }
    }
    rings.count=r;posts.count=p;
    rings.visible=r>0;posts.visible=p>0;
    rings.instanceMatrix.needsUpdate=true;posts.instanceMatrix.needsUpdate=true;
    if(rings.instanceColor)rings.instanceColor.needsUpdate=true;
    if(posts.instanceColor)posts.instanceColor.needsUpdate=true;
  }
  return {
    show(definition:readonly RaceGate[]){gates=definition.slice(0,maximum);passed=0;update();},
    advance(next:number){passed=Math.max(0,Math.min(gates.length,next));update();},
    clear(){gates=[];passed=0;rings.count=0;posts.count=0;rings.visible=false;posts.visible=false;},
    dispose(){
      scene.remove(rings,posts);
      rings.dispose();posts.dispose();
      ringGeometry.dispose();postGeometry.dispose();ringMaterial.dispose();postMaterial.dispose();
    }
  };
}
