import * as THREE from 'three';
import {packColorArray,packNormalArray} from './pack.ts';
/** Compact GPU vertex attributes with no visible difference: unit normals as normalized
 * Int16 (error ≤ 1.5e-5) and linear colours in [0, 1] as normalized Uint16 (error ≤ 7.6e-6,
 * far below one step of an 8-bit display, even in the darkest sRGB range). 6 bytes per
 * vertex instead of 12 for each attribute; positions stay Float32. */
export function packedNormals(values:ArrayLike<number>|Int16Array):THREE.BufferAttribute{
  return new THREE.BufferAttribute(values instanceof Int16Array?values:packNormalArray(values),3,true);
}
export function packedColors(values:ArrayLike<number>|Uint16Array):THREE.BufferAttribute{
  return new THREE.BufferAttribute(values instanceof Uint16Array?values:packColorArray(values),3,true);
}
