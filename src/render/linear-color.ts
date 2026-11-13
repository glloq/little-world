/** Minimal colour with Three.js' exact sRGB → linear conversion of `Color.setHex` (colour
 * management on, linear working space), usable in workers without loading Three.js. */
const toLinear=(c:number)=>c<0.04045?c*0.0773993808:Math.pow(c*0.9478672986+0.0521327014,2.4);
export class LinearColor {
  r=0;g=0;b=0;
  setHex(hex:number):this{hex=Math.floor(hex);this.r=toLinear((hex>>16&255)/255);this.g=toLinear((hex>>8&255)/255);this.b=toLinear((hex&255)/255);return this;}
  multiplyScalar(s:number):this{this.r*=s;this.g*=s;this.b*=s;return this;}
}
