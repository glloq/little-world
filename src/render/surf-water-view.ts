import * as THREE from 'three';
import type {SurfWaveField} from '../surf/wave-field.ts';

/** Fixed geometry, pure vertex animation. Shader and CPU share the same crest equation.
 * No texture, render-target, FFT, reflection camera or CPU vertex updates per frame. */
export function createSurfWaterView(parent:THREE.Object3D,field:SurfWaveField,
 ground:(x:number,z:number)=>number){
 const z=field.zone,spacing=3;
 const nx=Math.max(2,Math.ceil((z.maxX-z.minX)/spacing));
 const nz=Math.max(2,Math.ceil((z.maxZ-z.minZ)/spacing));
 const positions:number[]=[],envelopes:number[]=[],wet:number[]=[],indices:number[]=[];
 const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
 const fadeDepth=z.shoreFadeDepth??4,fadeEdge=z.edgeFade??12;
 for(let j=0;j<=nz;j++){
  const pz=z.minZ+(z.maxZ-z.minZ)*j/nz;
  for(let i=0;i<=nx;i++){
   const px=z.minX+(z.maxX-z.minX)*i/nx,depth=z.seaLevel-ground(px,pz);
   const edge=Math.min(px-z.minX,z.maxX-px,pz-z.minZ,z.maxZ-pz);
   positions.push(px,z.seaLevel+.02,pz);
   envelopes.push(smooth(depth/fadeDepth)*smooth(edge/fadeEdge));
   wet.push(depth>.04?1:0);
  }
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const a=j*(nx+1)+i,b=a+nx+1;
  indices.push(a,b,a+1,a+1,b,b+1);
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geo.setAttribute('aEnvelope',new THREE.Float32BufferAttribute(envelopes,1));
 geo.setAttribute('aWet',new THREE.Float32BufferAttribute(wet,1));
 geo.setIndex(indices);
 geo.computeBoundingSphere();
 // Expand culling bounds to include vertex-displaced peaks, or skip frustum culling.
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
 const mesh=new THREE.Mesh(geo,material);
 mesh.frustumCulled=false;mesh.renderOrder=3;mesh.name='SurfWaterPatch';
 parent.add(mesh);
 return {
  mesh,
  update(tick:number,alpha=0){material.uniforms.uTime.value=(Math.max(0,tick-1)+alpha)/30;},
  dispose(){mesh.removeFromParent();geo.dispose();material.dispose();}
 };
}
