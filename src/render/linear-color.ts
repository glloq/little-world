/** Minimal colour with Three.js' exact sRGB → linear conversion of `Color.setHex` (colour
 * management on, linear working space), usable in workers without loading Three.js. */
const toLinear=(c:number)=>c<0.04045?c*0.0773993808:Math.pow(c*0.9478672986+0.0521327014,2.4);
// Vertex colours repeatedly convert 8-bit palette channels; a fixed 2 KiB table avoids
// three pow() calls per cover sample without approximating Three.js colour management.
const LINEAR=Float64Array.from({length:256},(_,i)=>toLinear(i/255));
export function setLinearHex(out:{r:number;g:number;b:number},hex:number):void {
  hex=Math.floor(hex);out.r=LINEAR[hex>>16&255];out.g=LINEAR[hex>>8&255];out.b=LINEAR[hex&255];
}
export class LinearColor {
  r=0;g=0;b=0;
  setHex(hex:number):this{setLinearHex(this,hex);return this;}
  multiplyScalar(s:number):this{this.r*=s;this.g*=s;this.b*=s;return this;}
}
