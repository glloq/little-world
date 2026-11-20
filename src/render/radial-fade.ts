/** Radial screen-door fade (doc 105, SEAM-7/8): objects drawn only within a radius around a
 * moving centre fade in/out over the outer band of that radius instead of popping at a
 * sector or cut-off boundary. The distance is taken from each object's (or instance's) own
 * origin, so no per-object uniform is needed: one shared radius per material, one shared
 * centre per system. Opaque dithering (no blending, no sorting), presentation only. */
import type * as THREE from 'three';

export interface RadialFade {center:{value:THREE.Vector3};radius:{value:number};band:{value:number}}
const DITHER=`if(vFade<0.999){float fadeH=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));if(fadeH>=vFade)discard;}`;
/** Adds the fade to a built-in material (Lambert, Basic, Standard…). Chains an existing onBeforeCompile. */
export function addRadialFade(material:THREE.Material,fade:RadialFade){
  const previous=material.onBeforeCompile.bind(material),previousKey=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    previous(shader,renderer);
    shader.uniforms.uFadeCenter=fade.center;shader.uniforms.uFadeRadius=fade.radius;shader.uniforms.uFadeBand=fade.band;
    shader.vertexShader='uniform vec3 uFadeCenter;\nuniform float uFadeRadius;\nuniform float uFadeBand;\nvarying float vFade;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
  vec4 fadeOrigin=vec4(0.0,0.0,0.0,1.0);
  #ifdef USE_INSTANCING
  fadeOrigin=instanceMatrix*fadeOrigin;
  #endif
  fadeOrigin=modelMatrix*fadeOrigin;
  vFade=1.0-smoothstep(uFadeRadius-uFadeBand,uFadeRadius,distance(fadeOrigin.xz,uFadeCenter.xz));`);
    shader.fragmentShader='varying float vFade;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n  '+DITHER);
  };
  material.customProgramCacheKey=()=>previousKey()+'|radial-fade-v1';
}
