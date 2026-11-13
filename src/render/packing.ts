import * as THREE from 'three';
/** Compact GPU vertex attributes with no visible difference: unit normals as normalized
 * Int16 (error ≤ 1.5e-5) and linear colours in [0, 1] as normalized Uint16 (error ≤ 7.6e-6,
 * far below one step of an 8-bit display, even in the darkest sRGB range). 6 bytes per
 * vertex instead of 12 for each attribute; positions stay Float32. */
export function packedNormals(values:ArrayLike<number>):THREE.BufferAttribute{
  const out=new Int16Array(values.length);for(let i=0;i<values.length;i++)out[i]=Math.round(Math.max(-1,Math.min(1,values[i]))*32767);
  return new THREE.BufferAttribute(out,3,true);
}
export function packedColors(values:ArrayLike<number>):THREE.BufferAttribute{
  const out=new Uint16Array(values.length);for(let i=0;i<values.length;i++)out[i]=Math.round(Math.max(0,Math.min(1,values[i]))*65535);
  return new THREE.BufferAttribute(out,3,true);
}
