/** Approximate average Lambert response for a baked atlas, relative to the approved noon
 * lighting. One RGB correction per view/frame, no normals texture or extra texture sample. */
import * as THREE from 'three';
import type {SkyLighting} from '../environment/sky-lighting.ts';
const sky=new THREE.Color(0xfaf7e9),ground=new THREE.Color(0x678c7c),sun=new THREE.Color(0xffeed3),fill=new THREE.Color(0xd8f0ff);
const reference=(channel:'r'|'g'|'b')=>2.15*(sky[channel]*.8+ground[channel]*.2)+.25*(2.35*sun[channel]+.65*fill[channel]);
const channels=['r','g','b'] as const;
const baseline={r:reference('r'),g:reference('g'),b:reference('b')};
export function impostorIllumination(l:SkyLighting,out:THREE.Color){
 for(const channel of channels){const value=l.ambient.intensity*(l.ambient.color[channel]*.8+l.ambient.groundColor[channel]*.2)+.25*(l.sun.intensity*l.sun.color[channel]+l.fill.intensity*l.fill.color[channel]);out[channel]=Math.max(0,Math.min(4,value/baseline[channel]));}
 return out;
}
