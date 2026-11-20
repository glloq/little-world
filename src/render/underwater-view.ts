/**
 * Underwater view (doc 21 §6, doc 104 §3). Driven by the CAMERA volume, never
 * by the player's swim state: palette and visibility follow the camera depth
 * and the daylight. Fog is used here as a real physical state of water (light
 * absorption), allowed by the project rules, and is removed as soon as the
 * camera surfaces; it never hides map limits above water. Low cost: one
 * linear fog, no extra pass, no post-processing.
 */
import * as THREE from 'three';

export interface UnderwaterLook {color:number;near:number;far:number;sun:number;tint:number}
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>{const ar=a>>16&255,ag=a>>8&255,ab=a&255,br=b>>16&255,bg=b>>8&255,bb=b&255;return (Math.round(ar+(br-ar)*t)<<16)|(Math.round(ag+(bg-ag)*t)<<8)|Math.round(ab+(bb-ab)*t);};
/** Pure: look for a camera depth (m) and daylight (0 night … 1 noon). */
export function underwaterLook(depth:number,daylight:number):UnderwaterLook{
 const d=Math.max(0,depth),deep=smooth(1,45,d),day=Math.max(.15,Math.min(1,daylight));
 const color=mix(mix(0x3fa7ad,0x0f3b52,deep),0x061a24,1-day);
 // Visibility shrinks with depth and at night (still ≥ 14 m so divers can orient).
 const far=Math.max(14,(70-42*deep)*(.55+.45*day)),near=Math.min(far*.25,2+3*(1-deep));
 return {color,near,far,sun:(1-.8*deep)*day,tint:.12+.25*deep};
}

export function createUnderwaterView(scene:THREE.Scene){
 let fog:THREE.Fog|null=null,active=false,tint='';
 const color=new THREE.Color();
 return {
  /** Call once per frame after the environment update. `depth` = water surface − camera y (≤ 0 = above water). */
  update(depth:number|null,daylight:number,sun?:THREE.DirectionalLight){
   // Hysteresis: a camera bobbing at the surface does not flip the fog every frame.
   const under=depth!==null&&depth>(active?0.02:0.1);
   if(!under){if(active){scene.fog=null;active=false;tint='';document.body.style.removeProperty('--underwater-tint');}return null;}
   const look=underwaterLook(depth!,daylight);color.setHex(look.color);
   if(!fog)fog=new THREE.Fog(look.color,look.near,look.far);
   fog.color.copy(color);fog.near=look.near;fog.far=look.far;scene.fog=fog;active=true;
   if(scene.background instanceof THREE.Color)scene.background.copy(color);
   if(sun)sun.intensity*=look.sun;
   // Restyling the whole document every frame is costly: write only when the value changes.
   const nextTint=look.tint.toFixed(2);if(nextTint!==tint){tint=nextTint;document.body.style.setProperty('--underwater-tint',nextTint);}
   return look;
  },
  get active(){return active;},
 };
}
