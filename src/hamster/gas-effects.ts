/** Low-poly pooled cosmetic gas puffs, independent of player physics. */
import * as THREE from 'three';
const COUNT=24;
/** Cosmetic only: no thrust/energy parameters depend on these palettes. */
const SKIN_TYPES:Readonly<Record<string,number>>={classic:0,cheese:1,potato:2,hazelnut:3,magic:4,rainbow:5};
const SKIN_COLORS:Readonly<Record<string,readonly number[]>>={
 classic:[0xc8d69c,0xa2c482,0xe3dcbc],cheese:[0xffd15c,0xf7e69f,0xefb847],
 potato:[0xba906d,0x9b7150,0xd4b191],hazelnut:[0x92683e,0xa27e4b,0x7a984b],
 magic:[0xaf8deb,0xdcc7ff,0x866bd8],rainbow:[0xff8fa5,0xffc776,0xb8dc85,0x79c5df,0xa499eb,0xe1a6dd]
};
export function createGasEffects(scene:THREE.Object3D){
  const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.11,0),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75,depthWrite:false}),COUNT);
  mesh.name='GlideGasPuffs';mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);
  const life=new Float32Array(COUNT),x=new Float32Array(COUNT),y=new Float32Array(COUNT),z=new Float32Array(COUNT);
  const vx=new Float32Array(COUNT),vy=new Float32Array(COUNT),vz=new Float32Array(COUNT),style=new Uint8Array(COUNT);
  const transform=new THREE.Matrix4(),tint=new THREE.Color(),stretch=new THREE.Vector3();let cursor=0,alive=0;
  return {
    spawn(at:{x:number;y:number;z:number},velocity:{x:number;y:number;z:number},amount=4,skinId='classic'){
      const palette=SKIN_COLORS[skinId]??SKIN_COLORS.classic,skin=SKIN_TYPES[skinId]??0;
      const h=Math.hypot(velocity.x,velocity.z)||1;
      for(let i=0;i<Math.min(6,amount);i++){
        const k=cursor;cursor=(cursor+1)%COUNT;style[k]=skin;life[k]=(skin===4?.25:.35)+Math.random()*.2;
        mesh.setColorAt(k,tint.setHex(palette[(i+cursor)%palette.length]));
        x[k]=at.x+(Math.random()-.5)*.15;y[k]=at.y+(Math.random()-.5)*.14;z[k]=at.z+(Math.random()-.5)*.15;
        vx[k]=-velocity.x/h*(.8+Math.random()*.8)+(Math.random()-.5)*.5;
        vy[k]=.25+Math.random()*.65;vz[k]=-velocity.z/h*(.8+Math.random()*.8)+(Math.random()-.5)*.5;
        if(skin===1){vy[k]+=.15;vx[k]*=.8;vz[k]*=.8;} // buoyant cheese bubbles
        if(skin===3){vy[k]+=.35;vx[k]+=(i%2?1:-1)*.4;} // flying hazelnut leaves
      }
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      alive=COUNT;mesh.visible=true;
    },
    update(dt:number){
      if(!alive)return;let count=0;
      for(let i=0;i<COUNT;i++){
        const remaining=life[i]-dt;life[i]=Math.max(0,remaining);
        if(remaining<=0){transform.makeScale(0,0,0);mesh.setMatrixAt(i,transform);continue;}
        x[i]+=vx[i]*dt;y[i]+=vy[i]*dt;z[i]+=vz[i]*dt;
        const scale=Math.min(2.2,(.55-remaining)*3.5+.25)*Math.min(1,remaining*5);
        const kind=style[i];let sx=1,sy=1,sz=1;
        if(kind===1){sx=1.15;sy=1.15;sz=1.15;}
        else if(kind===2){sx=1.45;sy=.72;sz=1.05;}
        else if(kind===3){sx=1.45;sy=.36;sz=.7;}
        else if(kind===4){sx=.65;sy=1.65;sz=.65;}
        else if(kind===5){sx=.75;sy=1.2;sz=.75;}
        transform.makeRotationZ(kind===3?(i%3-1)*.75:kind===4?(i%4)*.4:0);
        transform.scale(stretch.set(scale*sx,scale*sy,scale*sz)).setPosition(x[i],y[i],z[i]);
        mesh.setMatrixAt(i,transform);count++;
      }
      mesh.count=COUNT;mesh.instanceMatrix.needsUpdate=true;alive=count;if(!count){mesh.count=0;mesh.visible=false;}
    },
    dispose(){scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
  };
}
