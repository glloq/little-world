/** Original Little World capybara V6.3 — optional mount / draft visual prototype.
 * One OBJ mesh (802 vertices / 1600 triangles), animated on GPU; accessories are
 * independently replaceable. No island spawn, gameplay, autonomous RAF or physics.
 * +X forward; +Y up; +Z lateral. Ground is Y≈0.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { advanceCapybaraGait, makeCapybaraGait, type CapybaraGait } from './capybara-gait.ts';
import { advanceCapybaraPose, initialCapybaraPose, type CapybaraPose, type CapybaraState } from './capybara-pose.ts';
import { buildCapybaraAccessories, advanceCapybaraEquipment, disposeCapybaraAccessories, type CapybaraLoadout } from './capybara-accessories.ts';

export type { CapybaraState } from './capybara-pose.ts';
export type { CapybaraLoadout } from './capybara-accessories.ts';
export const CAPYBARA_ASSET_ID = 'animal.capybara.v6-3';
export const CAPYBARA_TRIANGLES = 1600;
export const CAPYBARA_BOUNDS = { length: 3.57, width: 1.26, height: 1.82 } as const;
export const CAPYBARA_COLLIDER = { shape: 'capsule' as const, radius: 0.51, length: 2.4, centreY: 0.98 };
export const CAPYBARA_SOCKETS = {
  rider: [-0.48, 1.73, 0] as const,
  hitch: [-1.62, 0.77, 0] as const,
} as const;

type ShaderUniforms = {
  phase: { value: number }; influence: { value: number };
  yaw: { value: number }; pitch: { value: number };
  breathe: { value: number }; eyesClosed: { value: number };
};
export interface CapybaraModel {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  riderSocket: THREE.Group;
  hitchSocket: THREE.Group;
  loadout: CapybaraLoadout;
  state: CapybaraState;
  /** Explicit visual intent; physics and NPC AI remain external. */
  setState(state: CapybaraState): void;
  setLoadout(loadout: CapybaraLoadout): void;
  /** The vector belongs to the caller; it may be updated in place each frame. */
  setLookTarget(worldPosition: THREE.Vector3 | null): void;
  /** Call from existing frame loop: no RAF. */
  update(dt: number, groundSpeed: number): void;
  dispose(): void;
}

let cachedGeometry: Promise<THREE.BufferGeometry> | undefined;
function loadGeometry(): Promise<THREE.BufferGeometry> {
  if (!cachedGeometry) {
    cachedGeometry = new OBJLoader().loadAsync(`${import.meta.env.BASE_URL}models/capybara-v6.3.obj`).then((root) => {
      const parts: THREE.Mesh[] = [];
      root.traverse((child) => { if (child instanceof THREE.Mesh) parts.push(child); });
      if (parts.length !== 1) throw new Error(`Expected one capybara mesh; got ${parts.length}`);
      const geometry = parts[0].geometry.clone();
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const positions = geometry.getAttribute('position');
      const triangles = geometry.index ? geometry.index.count / 3 : positions.count / 3;
      if (triangles !== CAPYBARA_TRIANGLES) {
        geometry.dispose();
        throw new Error(`Capybara triangle count mismatch: ${triangles}`);
      }
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      });
      return geometry;
    }).catch((error: unknown) => { cachedGeometry = undefined; throw error; });
  }
  return cachedGeometry;
}

const draftEquipment = new Set<CapybaraLoadout>(['cart','wagon','caravan']);
/** Geometry reused across instances; uniforms, materials and state are per capybara. */
export async function createCapybaraModel(initialLoadout: CapybaraLoadout='none'): Promise<CapybaraModel> {
  const geometry = await loadGeometry();
  const uniforms: ShaderUniforms = {
    phase:{value:0}, influence:{value:0}, yaw:{value:0}, pitch:{value:0},
    breathe:{value:0}, eyesClosed:{value:0},
  };
  const material = new THREE.MeshStandardMaterial({color:0xc58b5c, roughness:.98, metalness:0});
  material.onBeforeCompile=(shader)=>{
    shader.uniforms.capPhase=uniforms.phase;
    shader.uniforms.capInfluence=uniforms.influence;
    shader.uniforms.capYaw=uniforms.yaw;
    shader.uniforms.capPitch=uniforms.pitch;
    shader.uniforms.capBreathe=uniforms.breathe;
    shader.uniforms.capEyesClosed=uniforms.eyesClosed;
    shader.vertexShader=`
      uniform float capPhase;
      uniform float capInfluence;
      uniform float capYaw;
      uniform float capPitch;
      uniform float capBreathe;
      varying vec3 vCapPosition;
    `+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vCapPosition=position;
      float rear=1.0-smoothstep(-.94,-.70,position.x);
      float front=smoothstep(-.04,.12,position.x)*(1.0-smoothstep(.49,.69,position.x));
      float limb=max(rear,front)*(1.0-smoothstep(.25,.78,position.y))*smoothstep(.18,.34,abs(position.z));
      float side=position.z>=0.0?0.0:3.14159265;
      float phase=capPhase+side+(rear>front?0.0:3.14159265);
      transformed.x+=limb*capInfluence*sin(phase)*.14;
      transformed.y+=limb*capInfluence*max(0.0,cos(phase))*.12;
      float torso=smoothstep(.42,.95,position.y)*(1.0-smoothstep(1.58,1.81,position.y));
      transformed.y+=torso*(capInfluence*.01*cos(2.0*capPhase)+capBreathe);
      // Shader-only head follow, blending at the neck (no skeletal jaw / eyelids).
      float head=smoothstep(.48,.98,position.x);
      vec3 rel=transformed-vec3(.64,1.14,0.0);
      float cy=cos(capYaw),sy=sin(capYaw);
      float cp=cos(capPitch),sp=sin(capPitch);
      vec3 turned=vec3(cy*rel.x-sy*rel.z,rel.y,sy*rel.x+cy*rel.z);
      turned=vec3(cp*turned.x-sp*turned.y,sp*turned.x+cp*turned.y,turned.z);
      transformed=mix(transformed,turned+vec3(.64,1.14,0.0),head);
    `);
    shader.fragmentShader=`
      varying vec3 vCapPosition;
      uniform float capEyesClosed;
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      // Face is shaded directly on the original mesh: no extra draw calls.
      float muzzle=smoothstep(1.51,1.78,vCapPosition.x)*(1.0-smoothstep(1.30,1.44,vCapPosition.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.32,.18,.12),muzzle*.75);
      float sx=(vCapPosition.x-1.09)/.14;
      float sy=(vCapPosition.y-1.37)/.065;
      float arcY=sy-.65*(1.0-sx*sx);
      float eyeOpen=1.0-smoothstep(.38,.80,sx*sx+sy*sy);
      float eyeSleep=(1.0-smoothstep(.11,.33,abs(arcY)))*(1.0-smoothstep(.78,1.03,abs(sx)));
      float eye=mix(eyeOpen,eyeSleep,capEyesClosed)*smoothstep(.34,.40,abs(vCapPosition.z));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.07,.038,.026),eye*.95);
    `);
  };
  material.customProgramCacheKey=()=> 'little-world-capybara-v6.3-full-pose-v2';
  const group=new THREE.Group(); group.name='CapybaraV63';
  // Pivot above floor allows a subtle side-lying rest posture.
  const poseRoot=new THREE.Group(); poseRoot.name='CapybaraPoseRoot';
  poseRoot.position.y=.96; group.add(poseRoot);
  const body=new THREE.Mesh(geometry,material); body.name='CapybaraBody';
  body.position.y=-.96; body.castShadow=true; body.receiveShadow=true;
  body.frustumCulled=false; poseRoot.add(body);
  const riderSocket=new THREE.Group(); riderSocket.name='SocketRider';
  riderSocket.position.set(CAPYBARA_SOCKETS.rider[0],CAPYBARA_SOCKETS.rider[1]-.96,CAPYBARA_SOCKETS.rider[2]);
  poseRoot.add(riderSocket);
  const hitchSocket=new THREE.Group(); hitchSocket.name='SocketHitch';
  hitchSocket.position.set(...CAPYBARA_SOCKETS.hitch); group.add(hitchSocket);
  const attachEquipment=(kind:CapybaraLoadout):THREE.Group=>{
    const next=buildCapybaraAccessories(kind);
    if(kind==='saddle'||kind==='pack'){
      next.position.y=-.96; poseRoot.add(next);
    }else{
      group.add(next);
    }
    return next;
  };
  let equipment=attachEquipment(initialLoadout);
  let loadout=initialLoadout;
  let state:CapybaraState='idle';
  let gait:CapybaraGait=makeCapybaraGait();
  let pose:CapybaraPose=initialCapybaraPose();
  let lookTarget:THREE.Vector3|null=null;
  const temp=new THREE.Vector3();
  let disposed=false;
  const model:CapybaraModel={
    group,body,riderSocket,hitchSocket,loadout,state,
    setState(value) { if(disposed)return; state=value; model.state=value; },
    setLoadout(value) {
      if(disposed||loadout===value)return;
      equipment.removeFromParent(); disposeCapybaraAccessories(equipment);
      equipment=attachEquipment(value);
      loadout=value; model.loadout=value;
    },
    setLookTarget(value){lookTarget=value;},
    update(dt,groundSpeed) {
      if(disposed)return;
      // Keep a loaded carriage upright: side-lying visual requires releasing the hitch.
      const wanted=draftEquipment.has(loadout)&&(state==='rest'||state==='sleep')?'idle':state;
      let yaw=0,pitch=0;
      if(lookTarget && (wanted==='idle'||wanted==='walk'||wanted==='follow')){
        group.updateWorldMatrix(true,false);
        temp.copy(lookTarget); group.worldToLocal(temp);
        const dx=temp.x-.64, dy=temp.y-1.14, dz=temp.z;
        yaw=Math.atan2(dz,dx);
        pitch=Math.atan2(dy,Math.sqrt(dx*dx+dz*dz));
      }
      pose=advanceCapybaraPose(pose,{dt,speed:groundSpeed,state:wanted,lookYaw:yaw,lookPitch:pitch});
      gait=advanceCapybaraGait(gait,{dt,speed:pose.walkWeight>0?groundSpeed:0});
      // Wheels are children of the same animal-root transform; no world-space detach.
      advanceCapybaraEquipment(equipment,groundSpeed*Math.max(0,Math.min(.1,dt)));
      uniforms.phase.value=gait.phase;
      uniforms.influence.value=gait.influence*pose.walkWeight;
      uniforms.yaw.value=pose.headYaw;
      uniforms.pitch.value=pose.headPitch;
      uniforms.breathe.value=pose.breathing;
      uniforms.eyesClosed.value=pose.eyesClosed;
      poseRoot.rotation.x=pose.roll;
      // Keep barrel near floor as it rolls, without changing the physics controller.
      poseRoot.position.y=.96-.045*Math.sin(pose.roll);
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      equipment.removeFromParent(); disposeCapybaraAccessories(equipment);
      poseRoot.remove(body); material.dispose();
      group.clear();
    },
  };
  return model;
}
