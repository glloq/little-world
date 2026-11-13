/** Pure packing of vertex attributes (no Three.js): unit normals → normalized Int16,
 * linear colours in [0, 1] → normalized Uint16. Errors ≤ 1.5e-5 and ≤ 7.6e-6. */
export function packNormalArray(values:ArrayLike<number>):Int16Array{const out=new Int16Array(values.length);for(let i=0;i<values.length;i++)out[i]=Math.round(Math.max(-1,Math.min(1,values[i]))*32767);return out;}
export function packColorArray(values:ArrayLike<number>):Uint16Array{const out=new Uint16Array(values.length);for(let i=0;i<values.length;i++)out[i]=Math.round(Math.max(0,Math.min(1,values[i]))*65535);return out;}
/** Index array type chosen like BufferGeometry.setIndex (Uint32 only when needed). */
export function indexArray(values:ArrayLike<number>):Uint16Array|Uint32Array{let max=0;for(let i=0;i<values.length;i++)if(values[i]>max)max=values[i];return max>=65535?Uint32Array.from(values):Uint16Array.from(values);}
