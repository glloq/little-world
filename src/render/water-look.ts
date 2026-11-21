/**
 * Water look V1 (doc 108): one shared, low-cost presentation for rivers, lakes, waterfalls,
 * the near sea and the shallow sea floor. Everything is presentation only: `waterSurface`,
 * depths, currents, swimming and boats never read it.
 *
 * Budget rules (docs 11, 21, 22):
 * - no extra render pass, no render target, no depth texture, no reflection camera, no texture;
 * - three's own Lambert program (same lights, fog, tone mapping) with a few injected lines;
 * - per-pixel animated detail is computed only near the camera and only when the shared
 *   `uWaterDetail` (driven by the presentation budget) is above zero: far water costs the
 *   same as before (flat lit colour), and `detail = 0` keeps only static colours;
 * - the shallow-sea look is painted on the terrain (absorption by depth under the sea level),
 *   so the sea surface itself stays a few flat quads.
 */
import * as THREE from 'three';
import {SEA_COLOR} from '../horizon-data.ts';
import {LAMBERT_VERTEX_LIGHTS} from './surf-water-material.ts';

/** Shared uniforms (one world active at a time; the Studio viewport shares them harmlessly). */
export const WATER_UNIFORMS={
 uWaterTime:{value:0},
 /** 0 = static colours only, 1 = full animated detail (presentation budget). */
 uWaterDetail:{value:1},
 uWaterSea:{value:0},
 /** Distance (m) beyond which animated detail is off (fades from half of it). */
 uWaterFar:{value:220},
};
/** Stylised palette (sRGB hex). The deep colour of rivers/lakes stays close to the sea. */
export const WATER_LOOK_PALETTE={
 riverDeep:0x2f8592,riverShallow:0x69bdb4,lakeDeep:0x2c7b8c,foam:0xf2faf6,sky:0xcde8ec,
 /** = SEA_COLOR: deep water composites to exactly the horizon sea (no seam at tiles, skirts, ring). */
 seabedAbsorb:SEA_COLOR,seaShallow:0x5cc7bc,
} as const;
/** Presentation budget level (0 best … 3 overload) → animated detail. Economy keeps colours. */
export function waterDetailFor(level:number,economy=false):number{
 if(economy)return 0;
 return level<=0?1:level===1?.85:level===2?.5:0;
}
export function setWaterTime(seconds:number){WATER_UNIFORMS.uWaterTime.value=seconds%3600;}
export function setWaterSeaLevel(y:number){WATER_UNIFORMS.uWaterSea.value=y;}
export function setWaterDetail(detail:number){WATER_UNIFORMS.uWaterDetail.value=Math.max(0,Math.min(1,detail));}

const color=(hex:number)=>new THREE.Color(hex);
const vec3=(hex:number)=>{const c=color(hex);return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;};

/** Hash + value noise (no texture). */
const NOISE=`
float wl_hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float wl_noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(wl_hash(i),wl_hash(i+vec2(1,0)),f.x),mix(wl_hash(i+vec2(0,1)),wl_hash(i+vec2(1,1)),f.x),f.y);}
`;
/** Cheap analytic ripple normal (2 sin + 2 cos, world space: stable under a moving camera). */
const RIPPLE=`
vec3 wl_ripple(vec3 world,float amount){
 float t=uWaterTime;
 return normalize(vec3(amount*(.09*sin(world.x*.9+world.z*.31+t*1.7)+.05*sin(world.z*2.3-t*2.9)),1.0,amount*(.09*cos(world.z*1.1-world.x*.27-t*1.3)+.05*cos(world.x*2.1+t*2.3))));
}
`;
/** Artistic sun glint from the ripple normal; no environment map, no reflection pass. */
const GLINT=`
vec3 wl_glint(vec3 n,float strength){
 vec3 glint=vec3(0.0);
 #if NUM_DIR_LIGHTS > 0
 if(strength>0.001){
  vec3 r=reflect(normalize(-vViewPosition),normalize(mat3(viewMatrix)*n));
  float s=max(dot(r,directionalLights[0].direction),0.0);s*=s;s*=s;s*=s;s*=s;s*=s;s*=s;s*=s; // ≈ pow(s,128)
  glint=directionalLights[0].color*s*strength;
 }
 #endif
 return glint;
}
`;
const UNIFORM_DECL='uniform float uWaterTime;uniform float uWaterDetail;uniform float uWaterSea;uniform float uWaterFar;\n';
function bindUniforms(shader:{uniforms:Record<string,THREE.IUniform>}){Object.assign(shader.uniforms,WATER_UNIFORMS);}

/** Rivers, lakes and waterfalls: one material for every inland water mesh (one program). */
export function createInlandWaterMaterial():THREE.MeshLambertMaterial{
 const material=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,side:THREE.DoubleSide,depthWrite:true});
 // Transparent + DoubleSide would be drawn twice (back then front faces): one pass is enough
 // for a single-layer surface (also seen from below while diving).
 material.forceSinglePass=true;
 material.onBeforeCompile=shader=>{
  bindUniforms(shader);
  shader.vertexShader=UNIFORM_DECL+'attribute vec4 waterFlow;\nvarying vec4 vWaterFlow;\nvarying vec3 vWaterWorld;\n'+shader.vertexShader
   .replace('#include <project_vertex>','#include <project_vertex>\nvWaterFlow=waterFlow;vWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=UNIFORM_DECL+'varying vec4 vWaterFlow;\nvarying vec3 vWaterWorld;\n'+NOISE+shader.fragmentShader
   .replace('#include <lights_lambert_pars_fragment>','#include <lights_lambert_pars_fragment>\n'+RIPPLE+GLINT)
   .replace('#include <color_fragment>',`#include <color_fragment>
 float wl_lake=step(vWaterFlow.z,-.5),wl_rush=max(vWaterFlow.z,0.0),wl_edge=abs(vWaterFlow.y);
 float wl_dist=length(vWaterWorld-cameraPosition);
 float wl_detail=uWaterDetail*(1.0-smoothstep(uWaterFar*.5,uWaterFar,wl_dist));
 // Depth reading: darker channel in the middle, bed colour showing on the banks.
 vec3 wl_col=mix(mix(${vec3(WATER_LOOK_PALETTE.riverDeep)},${vec3(WATER_LOOK_PALETTE.lakeDeep)},wl_lake),${vec3(WATER_LOOK_PALETTE.riverShallow)},smoothstep(.2,.95,wl_edge));
 float wl_foam=vWaterFlow.w+smoothstep(.8,.97,wl_edge)*(1.0-wl_lake)*(.06+.4*wl_rush);
 float wl_n=.5;
 if(wl_detail>.001){
  // Streaks stretched along the current; lakes: slow isotropic ripples in world space.
  float wl_speed=mix(.45,5.5,wl_rush*wl_rush);
  vec2 wl_p=mix(vec2((vWaterFlow.x-uWaterTime*wl_speed)*.22,vWaterFlow.y*2.2),vWaterWorld.xz*.35+vec2(uWaterTime*.07,-uWaterTime*.05),wl_lake);
  wl_n=mix(.5,.65*wl_noise(wl_p)+.35*wl_noise(wl_p*2.7+3.1),wl_detail);
  wl_col=mix(wl_col,${vec3(WATER_LOOK_PALETTE.sky)},smoothstep(.62,.82,wl_n)*.35*wl_detail);
  wl_foam+=smoothstep(.72-.35*wl_rush,.95,wl_n)*wl_rush*.9*wl_detail;
 }
 float wl_whiteness=smoothstep(.25,.75,wl_foam*(.55+.9*wl_n));
 wl_col=mix(wl_col,${vec3(WATER_LOOK_PALETTE.foam)},wl_whiteness);
 // Grazing angles reflect the sky and turn opaque; the banks fade out (no hard ribbon edge).
 vec3 wl_view=normalize(cameraPosition-vWaterWorld);
 float wl_fresnel=pow(1.0-abs(wl_view.y),3.0)*(1.0-step(.5,wl_rush)*step(.8,vWaterFlow.w));
 wl_col=mix(wl_col,${vec3(WATER_LOOK_PALETTE.sky)},wl_fresnel*.45);
 float wl_alpha=mix(.86,1.0,wl_fresnel)*(1.0-smoothstep(.86,1.0,wl_edge)*(1.0-wl_lake*.35));
 // Only baked foam (waterfalls, plunge pools) and rapids keep the faded banks opaque.
 diffuseColor.rgb*=wl_col;diffuseColor.a*=max(wl_alpha,wl_whiteness*.95*max(step(.15,vWaterFlow.w),1.0-wl_edge));`)
   .replace('#include <opaque_fragment>','outgoingLight+=wl_glint(wl_ripple(vWaterWorld,wl_detail),(1.0-wl_whiteness)*.9*wl_detail);\n#include <opaque_fragment>');
 };
 material.customProgramCacheKey=()=>'water-inland-v1';
 return material;
}

/** Near sea: translucent when looking down (the absorbed seabed shows through), opaque at grazing
 * angles and far away, where it equals the opaque horizon sea (same Lambert terms). The sea is
 * flat, so its lighting is computed per vertex (exact) like the surf material: the per-pixel
 * work is the view angle, one ripple normal and the glint. */
export function createSeaSurfaceMaterial():THREE.ShaderMaterial{
 const uniforms=Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.lights]),{uSeaColor:{value:color(SEA_COLOR)}},WATER_UNIFORMS);
 const material=new THREE.ShaderMaterial({name:'NearSeaMaterial',uniforms,lights:true,transparent:true,depthWrite:false,
  vertexShader:`#include <common>
${LAMBERT_VERTEX_LIGHTS}
varying vec3 vWaterWorld;varying vec3 vSeaLight;
void main(){
 vec4 wl_world=modelMatrix*vec4(position,1.0);vWaterWorld=wl_world.xyz;
 vSeaLight=sw_irradiance(normalize(normalMatrix*normal));
 gl_Position=projectionMatrix*viewMatrix*wl_world;
}`,
  fragmentShader:`#include <common>
${UNIFORM_DECL}uniform vec3 uSeaColor;
#if NUM_DIR_LIGHTS > 0
struct DirectionalLight{vec3 direction;vec3 color;};
uniform DirectionalLight directionalLights[NUM_DIR_LIGHTS];
#endif
varying vec3 vWaterWorld;varying vec3 vSeaLight;
${RIPPLE}
void main(){
 vec3 wl_toEye=cameraPosition-vWaterWorld;
 float wl_dist=length(wl_toEye);
 float wl_fresnel=1.0-abs(wl_toEye.y)/max(wl_dist,1e-3);wl_fresnel*=wl_fresnel;wl_fresnel*=wl_fresnel;
 float wl_far=smoothstep(80.0,420.0,wl_dist);
 float wl_detail=uWaterDetail*(1.0-wl_far);
 vec3 wl_col=uSeaColor;
 vec3 wl_glintLight=vec3(0.0);
 if(wl_detail>.001){
  // One ripple normal drives both the faint brightness swell and the sun glint.
  vec3 wl_rn=wl_ripple(vWaterWorld,wl_detail);
  wl_col*=1.0+(wl_rn.x+wl_rn.z)*.35;
  #if NUM_DIR_LIGHTS > 0
  vec3 wl_r=reflect(-wl_toEye/max(wl_dist,1e-3),wl_rn);
  // View-space light direction back to world space (transpose of the view rotation).
  float wl_s=max(dot(wl_r,normalize((vec4(directionalLights[0].direction,0.0)*viewMatrix).xyz)),0.0);
  wl_s*=wl_s;wl_s*=wl_s;wl_s*=wl_s;wl_s*=wl_s;wl_s*=wl_s;wl_s*=wl_s;wl_s*=wl_s;
  wl_glintLight=directionalLights[0].color*wl_s*.8*wl_detail;
  #endif
 }
 wl_col=mix(wl_col,${vec3(WATER_LOOK_PALETTE.sky)},wl_fresnel*.25*(1.0-wl_far));
 gl_FragColor=vec4(wl_col*vSeaLight+wl_glintLight,mix(.6,1.0,max(wl_fresnel,wl_far)));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
 material.customProgramCacheKey=()=>'water-sea-v2';
 return material;
}

/** Terrain fragment code: under the sea level the ground is absorbed toward the water colour
 * with depth (turquoise shallows, dark deep water) and a gently moving foam line marks the
 * waterline. Above the sea (almost every terrain pixel) it is a single comparison. */
export const TERRAIN_WATER_VERTEX={
 header:UNIFORM_DECL+'varying vec3 vWaterWorld;\nvarying vec3 vWaterAux;\n'+NOISE,
 /** Per vertex: low-frequency variation, ground slope (rise/run) and camera distance. */
 after:`vWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
 vec3 wl_wn=normalize(mat3(modelMatrix)*objectNormal);
 vWaterAux=vec3(wl_noise(vWaterWorld.xz*.07),length(wl_wn.xz)/max(wl_wn.y,.05),length(vWaterWorld-cameraPosition));`,
};
/** Few instructions on purpose: software rasterisers (SwiftShader) execute every branch. */
export const TERRAIN_WATER_FRAGMENT={
 header:UNIFORM_DECL+'varying vec3 vWaterWorld;\nvarying vec3 vWaterAux;\n',
 code:`
 float wl_depth=uWaterSea-vWaterWorld.y;
 if(wl_depth>-.6){
  // Tint first (light shallows), then absorption toward the deep colour.
  float wl_wet=step(0.0,wl_depth);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*${vec3(WATER_LOOK_PALETTE.seaShallow)}*1.6,smoothstep(0.0,.8,wl_depth)*wl_wet);
  diffuseColor.rgb=mix(diffuseColor.rgb,${vec3(WATER_LOOK_PALETTE.seabedAbsorb)},(1.0-exp(-max(wl_depth,0.0)*.28)));
  // Waterline (±0.6 m, near the camera): swash climbing and retreating (≈ 7 s), broken up.
  float wl_near=(1.0-smoothstep(60.0,240.0,vWaterAux.z))*step(wl_depth,.6);
  if(wl_near>0.0){
   float wl_detail=uWaterDetail*(1.0-smoothstep(uWaterFar*.5,uWaterFar,vWaterAux.z)),wl_k=vWaterAux.x;
   float wl_line=uWaterSea+.06+.16*sin(uWaterTime*.9+wl_k*6.2832)*wl_detail;
   // Horizontal width ≈ 1 m whatever the beach slope (flat beaches get a thin line).
   float wl_band=1.0-smoothstep(.35,1.1+.8*wl_k,abs(vWaterWorld.y-wl_line)/max(vWaterAux.y,.02));
   float wl_broken=.6+.4*sin(vWaterWorld.x*1.7+uWaterTime*.4+wl_k*9.0)*sin(vWaterWorld.z*1.3-uWaterTime*.3);
   diffuseColor.rgb=mix(diffuseColor.rgb,${vec3(WATER_LOOK_PALETTE.foam)},clamp(wl_band*wl_broken,0.0,1.0)*.75*wl_near);
  }
 }`,
};
export function bindTerrainWaterUniforms(shader:{uniforms:Record<string,THREE.IUniform>}){bindUniforms(shader);}
