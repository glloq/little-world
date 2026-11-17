/** Cosmetic speed cues. Never feed presentation state back into simulation or camera input.
 * One fixed 12-instance draw call: no particles, shaders, postprocessing or per-frame allocations. */
import * as THREE from 'three';
export interface SpeedCameraState {fov:number;extraDistance:number;bank:number}
export const speedCameraState=():SpeedCameraState=>({fov:66,extraDistance:0,bank:0});
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export function advanceSpeedCamera(s:SpeedCameraState,
  input:{speed:number;mode:string;boosting:boolean;turnRate:number;enabled:boolean},dt:number):void{
  const step=clamp(Number.isFinite(dt)?dt:0,0,.25);
  const active=input.enabled&&(input.mode==='glide'||input.mode==='roll');
  const speed=clamp(Number.isFinite(input.speed)?input.speed:0,0,60);
  const boost=active&&input.mode==='glide'&&input.boosting;
  const targetFov=66+(active?Math.min(10,Math.max(0,speed-8)*.24)+(boost?1:0):0);
  const targetDistance=active&&input.mode==='glide'?Math.min(3.1,Math.max(0,speed-11)*.07)+(boost?.5:0):0;
  const targetBank=active&&input.mode==='glide'?clamp((Number.isFinite(input.turnRate)?input.turnRate:0)*.06,-.075,.075):0;
  s.fov+=(targetFov-s.fov)*(1-Math.exp(-step*(targetFov>s.fov?5:3)));
  s.extraDistance+=(targetDistance-s.extraDistance)*(1-Math.exp(-step*3.5));
  s.bank+=(targetBank-s.bank)*(1-Math.exp(-step*6));
}
export function createSpeedStreaks(camera:THREE.PerspectiveCamera){
  const count=12;
  const geometry=new THREE.PlaneGeometry(.015,.38);
  const material=new THREE.MeshBasicMaterial({color:0xe6f5ff,transparent:true,opacity:.22,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  mesh.name='SpeedWindLines';mesh.visible=false;mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=950;mesh.castShadow=false;mesh.receiveShadow=false;
  camera.add(mesh);
  const matrix=new THREE.Matrix4();let phase=0;
  return {
    update(speed:number,gliding:boolean,enabled:boolean,dt:number){
      const intensity=enabled&&gliding?clamp((speed-14)/34,0,1):0;
      const visible=Math.floor(intensity*count);
      if(visible===0){mesh.visible=false;mesh.count=0;return;}
      phase=(phase+Math.min(.25,Math.max(0,dt))*(.7+Math.min(60,speed)*.07))%1;
      for(let i=0;i<visible;i++){
        const side=i%2===0?-1:1;
        const row=Math.floor(i/2),drift=(phase+row*.173)%1;
        const x=side*(1.8+(row%3)*.37+drift*.25);
        const y=-1.35+((row*7)%11)/11*2.7;
        const length=.40+intensity*.5;
        matrix.makeScale(1,length,1).setPosition(x,y+drift*.1,-4.4);
        mesh.setMatrixAt(i,matrix);
      }
      mesh.count=visible;mesh.visible=true;mesh.instanceMatrix.needsUpdate=true;
    },
    dispose(){camera.remove(mesh);geometry.dispose();material.dispose();mesh.dispose();}
  };
}
