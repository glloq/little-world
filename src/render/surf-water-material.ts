import * as THREE from 'three';
import {SEA_COLOR} from '../horizon-data.ts';
import {SURF_TICK_HZ,surfSwellCoefficients,type SurfZone} from '../surf/wave-field.ts';
import {barrelCrestPhase,barrelPeelOrigin,barrelPeelParameters,barrelPhaseOffset} from '../surf/surf-barrel.ts';

/** Surf water material. The vertex stage reproduces the CPU swell (wave-field.ts), its analytic
 * normal and the scene's Lambert lighting (directional + hemisphere + ambient, same formulas and
 * light uniforms as three's MeshLambertMaterial) evaluated PER VERTEX: the fragment stage only
 * mixes colours, so large water surfaces cost little fill rate. A flat border receives exactly
 * the NearSea shading. Tone mapping and output colour space are three's own chunks.
 * Foam detail: 0 = crest band, 1 = + breaking trail and swash, 2 = + one noise octave (HQ). */
const TAU=2*Math.PI;
/** Distance band where the drawn swell (water and lip) flattens; presentation only. */
export const SURF_VISUAL_FADE={start:160,end:360,strength:.75} as const;
export interface SurfWaterUniforms {[name:string]:THREE.IUniform}
const linear=(hex:number)=>new THREE.Color(hex);
/** Stylised palette (sRGB hex, converted to the linear working space by THREE.Color). */
export const SURF_WATER_PALETTE={
 sea:SEA_COLOR,deep:SEA_COLOR,shallow:0x4fc4ba,trough:0x3a8797,crest:0xb4e6df,face:0x2a7689,foam:0xf4fbf7,
} as const;
const COMMON=`
uniform float uTime,uSetTime,uWavelength,uSpeed,uAmplitude,uPhaseSeed,uSeaLevel,uFoamDetail,uFoamStrength;
uniform vec2 uDirection;
uniform vec4 uShape;
uniform vec4 uMod;
uniform vec4 uCrest;
uniform vec4 uPeel;uniform vec4 uPeelSpan;uniform vec4 uWave;uniform vec4 uBend;uniform float uBendSeed;
uniform vec3 uFade;
varying float vWet;varying float vEnv;varying vec3 vShore;
varying float vFace;varying float vLocal;varying float vAcross;varying vec2 vFoamUV;varying float vMod;
varying vec3 vLightFront;varying vec3 vLightBack;
`;
/** Light uniforms named like three's lights_pars_begin (filled by the renderer, lights:true).
 * Shared with the near-sea material (water-look.ts): same per-vertex Lambert terms. */
export const LAMBERT_VERTEX_LIGHTS=`
uniform vec3 ambientLightColor;
#if NUM_DIR_LIGHTS > 0
struct DirectionalLight{vec3 direction;vec3 color;};
uniform DirectionalLight directionalLights[NUM_DIR_LIGHTS];
#endif
#if NUM_HEMI_LIGHTS > 0
struct HemisphereLight{vec3 direction;vec3 skyColor;vec3 groundColor;};
uniform HemisphereLight hemisphereLights[NUM_HEMI_LIGHTS];
#endif
// Lambert irradiance × BRDF (1/π), view-space normal: identical to MeshLambertMaterial terms.
vec3 sw_irradiance(vec3 n){
  vec3 e=ambientLightColor;
  #if NUM_DIR_LIGHTS > 0
  for(int i=0;i<NUM_DIR_LIGHTS;i++)e+=saturate(dot(n,directionalLights[i].direction))*directionalLights[i].color;
  #endif
  #if NUM_HEMI_LIGHTS > 0
  for(int i=0;i<NUM_HEMI_LIGHTS;i++)e+=mix(hemisphereLights[i].groundColor,hemisphereLights[i].skyColor,
    .5*dot(n,hemisphereLights[i].direction)+.5);
  #endif
  return e*RECIPROCAL_PI;
}
`;
const VERTEX_HEADER=COMMON+LAMBERT_VERTEX_LIGHTS+`
attribute float aEnvelope;attribute float aWet;attribute vec3 aShore;attribute vec2 aEnvGrad;attribute float aSkirt;
`;
/** CPU twin: SurfWaveField.height / sample (wave-field.ts). Keep both in sync (tests). */
const VERTEX_NORMAL=`
float sw_across=-uDirection.y*position.x+uDirection.x*position.z;
// Curved crests (SurfZone.form): static along-crest offset and its slope (zero when straight).
float sw_c=sw_across-uBend.y;
float sw_bendSlope=uBend.x*sw_c+uBend.z*uBend.w*cos(uBend.w*sw_c+uBendSeed);
float sw_along=dot(uDirection,position.xz)+uBend.x*sw_c*sw_c*.5+uBend.z*sin(uBend.w*sw_c+uBendSeed);
vec2 sw_dir=uDirection+sw_bendSlope*vec2(-uDirection.y,uDirection.x);
float sw_cycle=(sw_along-uSpeed*uTime)/uWavelength;
float sw_p=6.28318530718*fract(sw_cycle)+uPhaseSeed;
float sw_a=uShape.x+uShape.z*aShore.x;
float sw_s1=sin(sw_p),sw_s2=sin(2.0*sw_p),sw_c1=cos(sw_p),sw_c2=cos(2.0*sw_p);
float sw_f=sw_s1+sw_a*sw_s2-uShape.y*sw_c2;
float sw_df=sw_c1+2.0*sw_a*sw_c2+2.0*uShape.y*sw_s2;
float sw_ps=6.28318530718*fract((sw_along-uSpeed*uSetTime)/uMod.y)+uCrest.z;
float sw_pc=6.28318530718*fract(sw_across/uMod.w)+uCrest.w;
float sw_m=1.0+uMod.x*sin(sw_ps)+uMod.z*sin(sw_pc);
vec2 sw_mg=uMod.x*cos(sw_ps)*6.28318530718/uMod.y*sw_dir+
  uMod.z*cos(sw_pc)*6.28318530718/uMod.w*vec2(-uDirection.y,uDirection.x);
float sw_k=6.28318530718/uWavelength;
// Visual amplitude LOD: distant swell flattens smoothly (coarse tiles never alias into dashes).
// Presentation only: physics, collisions and the logical water height are unchanged.
float sw_view=length((modelMatrix*vec4(position,1.0)).xyz-cameraPosition);
float sw_amp=uAmplitude*(1.0-uFade.z*smoothstep(uFade.x,uFade.y,sw_view));
vec2 sw_g=sw_amp*(aEnvGrad*sw_m*sw_f+aEnvelope*(sw_mg*sw_f+sw_m*sw_df*sw_k*sw_dir));
vec3 objectNormal=normalize(vec3(-sw_g.x,1.0,-sw_g.y));
vWet=aWet;vEnv=aEnvelope;vShore=aShore;vMod=sw_m;
vFace=clamp(-dot(sw_g,normalize(sw_dir))/(uAmplitude*sw_k*1.6+1e-4),-1.0,1.0);
// Linear in position: exact after interpolation (latest crest index and lag per fragment).
vLocal=sw_cycle-uWave.z;vAcross=sw_across;
// Foam lattice: 6 cells per wavelength along the swell, periodic like the wrapped time.
vFoamUV=vec2(sw_cycle*6.0,sw_across/uWavelength*6.0);
`;
const VERTEX_POSITION=`
vec3 transformed=vec3(position);
// Dry vertices sink under the beach: the terrain depth test draws the shoreline, so the
// fragment stage needs no discard (keeps early depth testing on real GPUs).
transformed.y=aWet>.5?uSeaLevel+.02+sw_amp*aEnvelope*sw_m*sw_f:uSeaLevel-.6;
// LOD skirts hang below tile borders between two tessellations: no crack is ever visible.
transformed.y-=aSkirt*(.4+uAmplitude*.6);
`;
const FRAGMENT_HEADER=COMMON+`
uniform vec3 uSea,uDeep,uShallow,uTrough,uCrestColor,uFaceColor,uFoamColor;
float sw_hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
// Value noise periodic over 6 cells along x: the wrapped swell time never makes foam jump.
float sw_noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float x0=mod(i.x,6.0),x1=mod(i.x+1.0,6.0);
  float a=sw_hash(vec2(x0,i.y)),b=sw_hash(vec2(x1,i.y)),c=sw_hash(vec2(x0,i.y+1.0)),d=sw_hash(vec2(x1,i.y+1.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
`;
const FRAGMENT_COLOR=`
float sw_depth=vShore.y,sw_break=vShore.x,sw_edge=vShore.z;
// Swell phase per pixel (vLocal is linear in position): crests stay exact on coarse tiles.
float sw_fp=6.28318530718*fract(vLocal+uWave.z)+uPhaseSeed;
float sw_fa=uShape.x+uShape.z*sw_break;
float sw_crest=clamp((sin(sw_fp)+sw_fa*sin(2.0*sw_fp)-uShape.y*cos(2.0*sw_fp)+uCrest.x)/uCrest.y,0.0,1.0);
vec3 sw_col=mix(uShallow,uDeep,smoothstep(0.0,1.0,sw_depth));
sw_col=mix(sw_col,uTrough,(1.0-sw_crest)*vEnv*.38);
sw_col=mix(sw_col,uCrestColor,smoothstep(.58,1.0,sw_crest)*vEnv*.55);
sw_col=mix(sw_col,uFaceColor,clamp(vFace,0.0,1.0)*vEnv*.5);
// Noise only in HQ (4 hashes per pixel); Low/Medium keep smooth analytic foam.
float sw_n=.5;
if(uFoamDetail>1.5)sw_n=sw_noise(vFoamUV);
float sw_irregular=sw_n;
// Crest foam: thicker on breaking, bigger (set) waves; broken up by noise.
float sw_crestFoam=smoothstep(mix(.95,.78,sw_break)-.06*(vMod-1.0),1.0,sw_crest+.14*(sw_irregular-.5))*
  vEnv*(.3+.7*sw_break);
// Latest crest that passed here (same index as surf-barrel.ts) and the lag behind it.
float sw_wave=ceil(vLocal),sw_since=sw_wave-vLocal,sw_broken=1.0;
if(uPeel.w>.5){
  // Where was the peeling break point when this crest passed here? Whitewater only behind it.
  float sw_shift=fract(uWave.y+(sw_wave-uWave.x)*.381966)*uPeel.z;
  float sw_elapsed=sw_since*uWavelength/uSpeed;
  float sw_pos=uPeelSpan.w+sw_shift-uPeel.y*sw_elapsed;
  float sw_ahead=mod(uPeel.x*vAcross-sw_pos+uPeel.z*.5,uPeel.z)-uPeel.z*.5;
  sw_broken=smoothstep(3.0,-4.0,sw_ahead);
}
// White water left behind a breaking crest, fading with the time elapsed since it passed.
float sw_trail=uFoamDetail>.5?sw_break*sw_break*sw_broken*exp(-sw_since*5.0)*
  (uFoamDetail>1.5?smoothstep(.3,.74,sw_irregular):.55):0.0;
// Swash line on the last metres before the beach, pulsing with each wave.
float sw_shore=smoothstep(.09,.0,sw_depth)*(.35+.65*sw_crest)*(uFoamDetail>1.5?.6+.4*sw_n:.8);
float sw_foam=clamp(max(sw_crestFoam,sw_trail)+sw_shore,0.0,1.0)*sw_edge*uFoamStrength;
sw_col=mix(sw_col,uFoamColor,sw_foam);
// Zone border: exact NearSea colour, so the rectangle disappears into the open sea.
diffuseColor.rgb=mix(uSea,sw_col,sw_edge);
`;
const VERTEX_SHADER=`#include <common>
`+VERTEX_HEADER+`
void main(){
`+'__NORMAL__'+'__POSITION__'+`
  vec3 sw_n=normalize(normalMatrix*objectNormal);
  vLightFront=sw_irradiance(sw_n);vLightBack=sw_irradiance(-sw_n);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.0);
}`;
const FRAGMENT_SHADER=`#include <common>
`+'__FRAGMENT_HEADER__'+`
void main(){
  vec4 diffuseColor=vec4(1.0);
`+'__FRAGMENT__'+`
  gl_FragColor=vec4(diffuseColor.rgb*(gl_FrontFacing?vLightFront:vLightBack),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function createSurfWaterMaterial(zone:SurfZone){
 const q=surfSwellCoefficients(zone);
 const p=SURF_WATER_PALETTE;
 const uniforms:SurfWaterUniforms={
  uTime:{value:0},uSetTime:{value:0},uWavelength:{value:zone.wavelength},uSpeed:{value:zone.speed},
  uAmplitude:{value:zone.amplitude},uDirection:{value:new THREE.Vector2(zone.dirX,zone.dirZ)},
  uPhaseSeed:{value:(zone.seed%4093)/4093*TAU},uSeaLevel:{value:zone.seaLevel},
  uShape:{value:new THREE.Vector4(q.skew,q.sharpness,q.shoal,barrelCrestPhase(zone))},
  uMod:{value:new THREE.Vector4(q.setVariation,q.setWavelength,q.peakVariation,q.peakWavelength)},
  uCrest:{value:new THREE.Vector4(q.crestOffset,q.crestRange,q.setSeed,q.peakSeed)},
  uFoamDetail:{value:1},uFoamStrength:{value:1},
  // Visual amplitude fade: start (m), end (m), strength (fraction removed at the end).
  uFade:{value:new THREE.Vector3(SURF_VISUAL_FADE.start,SURF_VISUAL_FADE.end,SURF_VISUAL_FADE.strength)},
  uSea:{value:linear(p.sea)},uDeep:{value:linear(p.deep)},uShallow:{value:linear(p.shallow)},
  uTrough:{value:linear(p.trough)},uCrestColor:{value:linear(p.crest)},
  uFaceColor:{value:linear(p.face)},uFoamColor:{value:linear(p.foam)},
 };
 const peel=barrelPeelParameters(zone),phaseOffset=barrelPhaseOffset(zone);
 Object.assign(uniforms,{
  uPeel:{value:new THREE.Vector4(1,peel?.speed??0,peel?.period??1,peel?1:0)},
  uPeelSpan:{value:new THREE.Vector4(peel?.shoulder??0,peel?.open??0,peel?.collapse??0,0)},
  uWave:{value:new THREE.Vector4(0,0,phaseOffset,0)},
 });
 const form=zone.form,bent=!!form&&(!!form.curvature||!!form.meander);
 const centerAcross=-zone.dirZ*(zone.minX+zone.maxX)/2+zone.dirX*(zone.minZ+zone.maxZ)/2;
 Object.assign(uniforms,{
  uBend:{value:new THREE.Vector4(bent?form!.curvature??0:0,centerAcross,bent?form!.meander??0:0,TAU/(form?.meanderLength??160))},
  uBendSeed:{value:((zone.seed*41)%983)/983*TAU},
 });
 const alongMin=Math.min(zone.minX*zone.dirX,zone.maxX*zone.dirX)+Math.min(zone.minZ*zone.dirZ,zone.maxZ*zone.dirZ);
 // Scene light uniforms (renderer-filled) + our own uniform objects kept by reference.
 const all=Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.lights]),uniforms);
 const material=new THREE.ShaderMaterial({name:'SurfWaterMaterial',uniforms:all,lights:true,
  side:THREE.DoubleSide,
  vertexShader:VERTEX_SHADER.replace('__NORMAL__',VERTEX_NORMAL).replace('__POSITION__',VERTEX_POSITION),
  fragmentShader:FRAGMENT_SHADER.replace('__FRAGMENT_HEADER__',FRAGMENT_HEADER).replace('__FRAGMENT__',FRAGMENT_COLOR)});
 material.customProgramCacheKey=()=>'little-world-surf-water-v3';
 return {material,uniforms,
  /** Fixed-tick time with render interpolation, wrapped on each exact period (float32 safety). */
  setTime(tick:number,alpha:number){
   const ticks=Math.max(0,tick-1)+Math.max(0,Math.min(1,alpha)),seconds=ticks/SURF_TICK_HZ;
   const period=zone.wavelength/zone.speed,wraps=Math.floor(seconds/period);
   uniforms.uTime.value=seconds-wraps*period;
   uniforms.uSetTime.value=seconds%(q.setWavelength/zone.speed);
   if(peel){
    // Small integer offsets keep the shader's crest index exact in float32 on long sessions.
    const nBase=Math.ceil((alongMin-zone.speed*seconds)/zone.wavelength-phaseOffset);
    const w=uniforms.uWave.value as THREE.Vector4,o=barrelPeelOrigin(zone,ticks);
    w.x=wraps+nBase;w.y=(((nBase*.381966)%1)+1)%1;
    (uniforms.uPeel.value as THREE.Vector4).x=o.sign;
    (uniforms.uPeelSpan.value as THREE.Vector4).w=o.origin;
   }
  },
  setFoamDetail(detail:0|1|2,strength=1){uniforms.uFoamDetail.value=detail;uniforms.uFoamStrength.value=strength;},
 };
}
/** GLSL sources, exposed for tests that check the shader stays the CPU twin. */
export const SURF_WATER_GLSL={vertexNormal:VERTEX_NORMAL,vertexPosition:VERTEX_POSITION,fragment:FRAGMENT_COLOR};
