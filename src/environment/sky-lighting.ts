/** Shared sun / sky lighting curve: the game environment and the Studio night preview apply
 * the same values for the same sun altitude (E10 — the Studio preview matches the runtime). */
import * as THREE from 'three';
export interface SkyLighting {sun:THREE.DirectionalLight;fill:THREE.DirectionalLight;ambient:THREE.HemisphereLight;}
const night=new THREE.Color('#243d56'),day=new THREE.Color('#cce6e2'),overcast=new THREE.Color('#859ba4'),warm=new THREE.Color('#ffd8ab');
export function applySkyLighting(l:SkyLighting,background:THREE.Color,sunAltitude:number,dayPhase:number,cloudCover:number){
  const brightness=THREE.MathUtils.smoothstep(sunAltitude,-.15,.35);
  background.copy(night).lerp(day,brightness).lerp(overcast,cloudCover*.5*brightness);
  l.sun.intensity=2.35*Math.max(0,sunAltitude)*(1-cloudCover*.35);l.sun.position.set(Math.cos(dayPhase*Math.PI*2)*160,sunAltitude*185,Math.sin(dayPhase*Math.PI*2)*140);
  l.sun.color.set('#ffeed3').lerp(warm,1-THREE.MathUtils.smoothstep(sunAltitude,0,.5));l.ambient.intensity=.55+brightness*1.6;l.fill.intensity=.12+brightness*.53;
}
