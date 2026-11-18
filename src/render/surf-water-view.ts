import * as THREE from 'three';
import type {SurfWaveField,SurfZone} from '../surf/wave-field.ts';

/** Terrain-sampled static envelopes, GPU-animated crests. Three pre-baked uniform
 * meshes share one shader: LOD switches never change the deterministic wave physics.
 * No per-frame terrain resampling, render target, texture or CPU vertex upload. */
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const LIMITS=[160,84,44] as const;
export interface SurfWaterStats {tier:number;vertices:number;triangles:number;maxVertices:number;}
export function surfWaterTier(zone:SurfZone,focus:{x:number;z:number},budgetLevel:number):0|1|2 {
 const dx=Math.max(zone.minX-focus.x,0,focus.x-zone.maxX);
 const dz=Math.max(zone.minZ-focus.z,0,focus.z-zone.maxZ);
 const distance=Math.hypot(dx,dz);
 return Math.min(2,Math.max(
  Number.isFinite(budgetLevel)?Math.max(0,Math.floor(budgetLevel)):0,
  distance>400?2:distance>150?1:0
 )) as 0|1|2;
}
function surfWaterGeometry(zone:SurfZone,ground:(x:number,z:number)=>number,
 resolution:number):THREE.BufferGeometry{
 const width=zone.maxX-zone.minX,length=zone.maxZ-zone.minZ;
 const spacing=Math.max(2,width/resolution,length/resolution);
 const nx=Math.max(2,Math.ceil(width/spacing)),nz=Math.max(2,Math.ceil(length/spacing));
 const positions=new Float32Array((nx+1)*(nz+1)*3),
   envelope=new Float32Array((nx+1)*(nz+1)),
   wet=new Float32Array((nx+1)*(nz+1)),
   indices:number[]=[];
 const fadeDepth=zone.shoreFadeDepth??4,edgeFade=zone.edgeFade??12;
 for(let j=0;j<=nz;j++){
  const z=zone.minZ+length*j/nz;
  for(let i=0;i<=nx;i++){
   const x=zone.minX+width*i/nx,index=j*(nx+1)+i,depth=zone.seaLevel-ground(x,z);
   const edge=Math.min(x-zone.minX,zone.maxX-x,z-zone.minZ,zone.maxZ-z);
   positions.set([x,zone.seaLevel+.02,z],index*3);
   envelope[index]=Number.isFinite(depth)&&depth>.05?smooth(depth/fadeDepth)*smooth(edge/edgeFade):0;
   wet[index]=Number.isFinite(depth)&&depth>.04?1:0;
  }
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const a=j*(nx+1)+i,b=a+nx+1;
  indices.push(a,b,a+1,a+1,b,b+1);
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geo.setAttribute('aEnvelope',new THREE.BufferAttribute(envelope,1));
 geo.setAttribute('aWet',new THREE.BufferAttribute(wet,1));
 geo.setIndex(indices);
 geo.computeBoundingBox();
 if(geo.boundingBox){
  geo.boundingBox.min.y-=zone.amplitude*1.4;
  geo.boundingBox.max.y+=zone.amplitude*1.4;
 }
 geo.computeBoundingSphere();
 return geo;
}
export function createSurfWaterView(parent:THREE.Object3D,field:SurfWaveField,
 ground:(x:number,z:number)=>number){
 const z=field.zone;
 const geometries=LIMITS.map(n=>surfWaterGeometry(z,ground,n));
 const material=new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uWavelength:{value:z.wavelength},uSpeed:{value:z.speed},
   uAmplitude:{value:z.amplitude},uDirection:{value:new THREE.Vector2(z.dirX,z.dirZ)},
   uPhaseSeed:{value:(z.seed%4093)/4093*2*Math.PI},uSeaLevel:{value:z.seaLevel}},
  vertexShader:`
    uniform float uTime,uWavelength,uSpeed,uAmplitude,uPhaseSeed,uSeaLevel;
    uniform vec2 uDirection;
    attribute float aEnvelope,aWet;
    varying float vCrest,vWet,vEnvelope;
    void main(){
      vec3 p=position;
      float phase=6.28318530718*fract((dot(uDirection,p.xz)-uSpeed*uTime)/uWavelength)+uPhaseSeed;
      float shape=sin(phase)+.22*sin(2.0*phase);
      p.y=uSeaLevel+.02+uAmplitude*aEnvelope*shape;
      vCrest=clamp((shape+1.12)/2.24,0.0,1.0);
      vWet=aWet;
      vEnvelope=aEnvelope;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`,
  fragmentShader:`
    varying float vCrest,vWet,vEnvelope;
    void main(){
      if(vWet<.5)discard;
      float crest=smoothstep(.66,.98,vCrest)*vEnvelope;
      vec3 deep=vec3(.07,.39,.49), shallow=vec3(.20,.61,.66);
      vec3 col=mix(deep,shallow,clamp(.38+.22*vCrest,0.0,1.0));
      col=mix(col,vec3(.68,.91,.91),crest*.42);
      gl_FragColor=vec4(col,1.0);
    }`,
  transparent:false,depthWrite:true,side:THREE.DoubleSide
 });
 const mesh=new THREE.Mesh(geometries[0],material);
 mesh.frustumCulled=true;mesh.renderOrder=3;mesh.name='SurfWaterPatch';
 const stats:SurfWaterStats={tier:0,vertices:geometries[0].attributes.position.count,
  triangles:(geometries[0].index?.count??0)/3,
  maxVertices:Math.max(...geometries.map(g=>g.attributes.position.count))};
 parent.add(mesh);
 return {
  mesh,stats,
  update(tick:number,alpha=0){
   // Render interpolates the previous and current fixed-tick wave exactly as the
   // hamster's renderPosition does; a new water physics sample uses integer tick.
   material.uniforms.uTime.value=(Math.max(0,tick-1)+Math.max(0,Math.min(1,alpha)))/30;
  },
  setDetail(budgetLevel:number,focus:{x:number;z:number}){
   const level=surfWaterTier(z,focus,budgetLevel);
   if(stats.tier===level)return;
   mesh.geometry=geometries[level];
   stats.tier=level;stats.vertices=mesh.geometry.attributes.position.count;
   stats.triangles=(mesh.geometry.index?.count??0)/3;
  },
  dispose(){mesh.removeFromParent();for(const g of geometries)g.dispose();material.dispose();}
 };
}
