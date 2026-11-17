/** Low-poly pooled cosmetic gas puffs, independent of player physics. */
import * as THREE from 'three';
const COUNT=24;
export function createGasEffects(scene:THREE.Object3D){
  const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.11,0),
    new THREE.MeshBasicMaterial({color:0xc8d69c,transparent:true,opacity:.75,depthWrite:false}),COUNT);
  mesh.name='GlideGasPuffs';mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);
  const life=new Float32Array(COUNT),x=new Float32Array(COUNT),y=new Float32Array(COUNT),z=new Float32Array(COUNT);
  const vx=new Float32Array(COUNT),vy=new Float32Array(COUNT),vz=new Float32Array(COUNT);
  const transform=new THREE.Matrix4();let cursor=0,alive=0;
  return {
    spawn(at:{x:number;y:number;z:number},velocity:{x:number;y:number;z:number},amount=4){
      const h=Math.hypot(velocity.x,velocity.z)||1;
      for(let i=0;i<Math.min(6,amount);i++){
        const k=cursor;cursor=(cursor+1)%COUNT;life[k]=.35+Math.random()*.2;
        x[k]=at.x+(Math.random()-.5)*.15;y[k]=at.y+(Math.random()-.5)*.14;z[k]=at.z+(Math.random()-.5)*.15;
        vx[k]=-velocity.x/h*(.8+Math.random()*.8)+(Math.random()-.5)*.5;
        vy[k]=.25+Math.random()*.65;vz[k]=-velocity.z/h*(.8+Math.random()*.8)+(Math.random()-.5)*.5;
      }
      alive=COUNT;
    },
    update(dt:number){
      if(!alive)return;let count=0;
      for(let i=0;i<COUNT;i++){
        const remaining=life[i]-dt;life[i]=Math.max(0,remaining);
        if(remaining<=0){transform.makeScale(0,0,0);mesh.setMatrixAt(i,transform);continue;}
        x[i]+=vx[i]*dt;y[i]+=vy[i]*dt;z[i]+=vz[i]*dt;
        const scale=Math.min(2.2,(.55-remaining)*3.5+.25)*Math.min(1,remaining*5);
        transform.makeScale(scale,scale,scale).setPosition(x[i],y[i],z[i]);mesh.setMatrixAt(i,transform);count++;
      }
      mesh.count=COUNT;mesh.instanceMatrix.needsUpdate=true;alive=count;if(!count)mesh.count=0;
    },
    dispose(){scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
  };
}
