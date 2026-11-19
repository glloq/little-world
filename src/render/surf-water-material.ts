import * as THREE from 'three';
import {SEA_COLOR} from '../horizon-data.ts';
import {SURF_TICK_HZ,surfSwellCoefficients,type SurfZone} from '../surf/wave-field.ts';
import {barrelCrestPhase,barrelPeelOrigin,barrelPeelParameters,barrelPhaseOffset} from '../surf/surf-barrel.ts';

/** Surf water material: the scene's own Lambert lighting (sun, sky, night, tone mapping), so a
 * flat zone border is shaded exactly like NearSea. The vertex stage reproduces the CPU swell
 * (wave-field.ts) and its analytic normal; the fragment stage adds depth tint, wave-face shading
 * and analytic foam. One program for every zone, no texture, no render target, no extra pass.
 * Foam detail: 0 = crest band only (Low), 1 = noise + breaking trail (Medium), 2 = finer (HQ). */
const TAU=2*Math.PI;
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
varying float vWet;varying float vCrest;varying float vEnv;varying vec3 vShore;
varying float vFace;varying float vLocal;varying float vAcross;varying vec2 vFoamUV;varying float vMod;
`;
const VERTEX_HEADER=COMMON+`
attribute float aEnvelope;attribute float aWet;attribute vec3 aShore;attribute vec2 aEnvGrad;
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
vec2 sw_g=uAmplitude*(aEnvGrad*sw_m*sw_f+aEnvelope*(sw_mg*sw_f+sw_m*sw_df*sw_k*sw_dir));
vec3 objectNormal=normalize(vec3(-sw_g.x,1.0,-sw_g.y));
vWet=aWet;vEnv=aEnvelope;vShore=aShore;vMod=sw_m;
vCrest=clamp((sw_f+uCrest.x)/uCrest.y,0.0,1.0);
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
transformed.y=aWet>.5?uSeaLevel+.02+uAmplitude*aEnvelope*sw_m*sw_f:uSeaLevel-.6;
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
vec3 sw_col=mix(uShallow,uDeep,smoothstep(0.0,1.0,sw_depth));
sw_col=mix(sw_col,uTrough,(1.0-vCrest)*vEnv*.38);
sw_col=mix(sw_col,uCrestColor,smoothstep(.58,1.0,vCrest)*vEnv*.55);
sw_col=mix(sw_col,uFaceColor,clamp(vFace,0.0,1.0)*vEnv*.5);
float sw_n=.5,sw_n2=.5;
if(uFoamDetail>.5)sw_n=sw_noise(vFoamUV);
if(uFoamDetail>1.5)sw_n2=sw_noise(vFoamUV*vec2(2.0,2.3)+vec2(0.0,17.0));
float sw_irregular=sw_n*.7+sw_n2*.3;
// Crest foam: thicker on breaking, bigger (set) waves; broken up by noise.
float sw_crestFoam=smoothstep(mix(.95,.78,sw_break)-.06*(vMod-1.0),1.0,vCrest+.14*(sw_irregular-.5))*
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
float sw_trail=sw_break*sw_break*sw_broken*exp(-sw_since*(uFoamDetail>.5?5.0:7.5))*
  (uFoamDetail>.5?smoothstep(.3,.74,sw_irregular):.5);
// Swash line on the last metres before the beach, pulsing with each wave.
float sw_shore=smoothstep(.09,.0,sw_depth)*(.35+.65*vCrest)*(uFoamDetail>.5?.6+.4*sw_n:.8);
float sw_foam=clamp(max(sw_crestFoam,sw_trail)+sw_shore,0.0,1.0)*sw_edge*uFoamStrength;
sw_col=mix(sw_col,uFoamColor,sw_foam);
// Zone border: exact NearSea colour, so the rectangle disappears into the open sea.
diffuseColor.rgb=mix(uSea,sw_col,sw_edge);
`;
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
 const material=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
 material.name='SurfWaterMaterial';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=VERTEX_HEADER+shader.vertexShader
   .replace('#include <beginnormal_vertex>',VERTEX_NORMAL)
   .replace('#include <begin_vertex>',VERTEX_POSITION);
  shader.fragmentShader=FRAGMENT_HEADER+shader.fragmentShader
   .replace('#include <color_fragment>','#include <color_fragment>\n'+FRAGMENT_COLOR);
 };
 material.customProgramCacheKey=()=>'little-world-surf-water-v2';
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
